use std::collections::HashMap;
use std::path::PathBuf;
use std::process;

use clap::{Parser, Subcommand};

use promptcase_core::config;
use promptcase_core::error::AppError;
use promptcase_core::file_ops;
use promptcase_core::git_ops;
use promptcase_core::linter;
use promptcase_core::scanner;
use promptcase_core::template;
use promptcase_core::tokenizer;

#[derive(Parser)]
#[command(name = "promptcase", about = "Manage prompt libraries from the terminal")]
struct Cli {
    /// Path to the prompt repository (default: $PROMPTCASE_REPO or ~/prompts)
    #[arg(long, global = true)]
    repo: Option<PathBuf>,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// List prompts in the repository
    List {
        /// Filter by tag
        #[arg(long)]
        tag: Option<String>,
        /// Search by title substring
        #[arg(long)]
        search: Option<String>,
    },
    /// Print the raw content of a prompt
    Show {
        /// Prompt file path (relative to repo root)
        name: String,
    },
    /// Resolve a prompt template with variable substitution
    Resolve {
        /// Prompt file path
        name: String,
        /// Variable assignments (key=value)
        #[arg(long = "var", value_parser = parse_var)]
        vars: Vec<(String, String)>,
    },
    /// Lint prompts for issues
    Lint {
        /// Specific prompt to lint (omit to lint all)
        name: Option<String>,
    },
    /// Count tokens for a prompt
    Tokens {
        /// Prompt file path
        name: String,
        /// Model name for tokenizer selection
        #[arg(long, default_value = "claude-sonnet-4")]
        model: String,
    },
    /// Export a prompt to a file or stdout
    Export {
        /// Prompt file path
        name: String,
        /// Output file (omit for stdout)
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
    /// Initialize a new prompt repository
    Init {
        /// Directory to initialize (default: current directory)
        path: Option<PathBuf>,
    },
    /// Scan a directory for prompts scattered across a codebase
    Scan {
        /// Directory to scan
        path: PathBuf,
        /// Minimum confidence threshold (0.0-1.0)
        #[arg(long, default_value = "0.5")]
        min_confidence: f32,
        /// Import discovered prompts into the repo
        #[arg(long)]
        import: bool,
        /// Show what would be imported without writing files
        #[arg(long)]
        dry_run: bool,
    },
}

fn parse_var(s: &str) -> Result<(String, String), String> {
    let (k, v) = s.split_once('=').ok_or_else(|| format!("expected KEY=VALUE, got '{s}'"))?;
    Ok((k.to_string(), v.to_string()))
}

fn resolve_repo(flag: Option<PathBuf>) -> PathBuf {
    flag.or_else(|| std::env::var("PROMPTCASE_REPO").ok().map(PathBuf::from))
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("prompts")
        })
}

fn run() -> Result<(), AppError> {
    let cli = Cli::parse();
    let repo_root = resolve_repo(cli.repo);

    match cli.command {
        Command::Init { path } => {
            let target = path.unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
            std::fs::create_dir_all(&target)?;
            config::ensure_repo_structure(&target)?;
            git_ops::init_repo(&target)?;
            println!("Initialized prompt repository at {}", target.display());
        }

        Command::List { tag, search } => {
            let entries = file_ops::list_all(&repo_root)?;
            for entry in &entries {
                if let Some(ref t) = tag {
                    if !entry.frontmatter.tags.iter().any(|et| et.eq_ignore_ascii_case(t)) {
                        continue;
                    }
                }
                if let Some(ref q) = search {
                    let q_lower = q.to_lowercase();
                    if !entry.frontmatter.title.to_lowercase().contains(&q_lower)
                        && !entry.path.to_lowercase().contains(&q_lower)
                    {
                        continue;
                    }
                }
                let tags = if entry.frontmatter.tags.is_empty() {
                    String::new()
                } else {
                    format!(" [{}]", entry.frontmatter.tags.join(", "))
                };
                println!("{}{} — {}", entry.path, tags, entry.frontmatter.title);
            }
        }

        Command::Show { name } => {
            let content = file_ops::read_raw(&repo_root, &name)?;
            print!("{content}");
        }

        Command::Resolve { name, vars } => {
            let content = file_ops::read_raw(&repo_root, &name)?;
            let variables: HashMap<String, String> = vars.into_iter().collect();
            let vars_ref = if variables.is_empty() { None } else { Some(&variables) };
            let resolved = template::resolve_template(&name, &content, &repo_root, vars_ref)?;
            print!("{}", resolved.text);
            if !resolved.unresolved_variables.is_empty() {
                eprintln!(
                    "warning: unresolved variables: {}",
                    resolved.unresolved_variables.join(", ")
                );
            }
        }

        Command::Lint { name } => {
            let cfg = config::load_config(&repo_root)?;
            let mut found = false;
            match name {
                Some(path) => {
                    let content = file_ops::read_raw(&repo_root, &path)?;
                    let results = linter::lint_prompt(&path, &content, &repo_root, &cfg)?;
                    for r in &results {
                        found = true;
                        print_lint(&path, r);
                    }
                }
                None => {
                    let entries = file_ops::list_all(&repo_root)?;
                    let files: Vec<(String, String)> = entries
                        .iter()
                        .filter_map(|e| {
                            file_ops::read_raw(&repo_root, &e.path)
                                .ok()
                                .map(|c| (e.path.clone(), c))
                        })
                        .collect();
                    let all = linter::lint_all(&files, &repo_root, &cfg)?;
                    for (path, results) in &all {
                        for r in results {
                            found = true;
                            print_lint(path, r);
                        }
                    }
                }
            }
            if found {
                process::exit(1);
            }
        }

        Command::Tokens { name, model } => {
            let content = file_ops::read_raw(&repo_root, &name)?;
            let resolved = template::resolve_template(&name, &content, &repo_root, None)?;
            let count = tokenizer::count_tokens(&resolved.text, &model);
            println!("{count}");
        }

        Command::Scan { path, min_confidence, import, dry_run } => {
            let scan_path = if path.is_absolute() {
                path
            } else {
                std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")).join(&path)
            };
            let results = scanner::scan_directory(&scan_path)?;
            let filtered: Vec<_> = results
                .into_iter()
                .filter(|r| r.confidence >= min_confidence)
                .collect();

            if filtered.is_empty() {
                println!("No prompts found.");
                return Ok(());
            }

            // Print table
            println!("{:<50} {:<18} {:<10} {}", "SOURCE", "TYPE", "CONF", "TITLE");
            println!("{}", "-".repeat(100));
            for r in &filtered {
                let source = if r.source_path.len() > 48 {
                    format!("...{}", &r.source_path[r.source_path.len() - 45..])
                } else {
                    r.source_path.clone()
                };
                println!(
                    "{:<50} {:<18} {:<10.2} {}",
                    source, r.source_type, r.confidence, r.title
                );
            }
            println!("\nFound {} prompt(s).", filtered.len());

            if import || dry_run {
                let import_dir = repo_root.join("imported");
                if !dry_run {
                    std::fs::create_dir_all(&import_dir)?;
                }

                for r in &filtered {
                    let slug = r.title
                        .to_lowercase()
                        .replace(|c: char| !c.is_alphanumeric() && c != '-', "-")
                        .trim_matches('-')
                        .to_string();
                    let mut filename = format!("{slug}.md");
                    let mut dest = import_dir.join(&filename);
                    let mut counter = 1u32;
                    while dest.exists() {
                        filename = format!("{slug}-{counter}.md");
                        dest = import_dir.join(&filename);
                        counter += 1;
                    }

                    let file_content = format!(
                        "---\ntitle: {}\ntags: [imported, {}]\nsource: {}\n---\n{}",
                        r.title, r.source_type, r.source_path, r.content
                    );

                    if dry_run {
                        println!("[dry-run] Would create: imported/{filename}");
                    } else {
                        std::fs::write(&dest, &file_content)?;
                        println!("Created: imported/{filename}");
                    }
                }
            }
        }

        Command::Export { name, output } => {
            let content = file_ops::read_raw(&repo_root, &name)?;
            let resolved = template::resolve_template(&name, &content, &repo_root, None)?;
            match output {
                Some(path) => {
                    std::fs::write(&path, &resolved.text)?;
                    eprintln!("Wrote {}", path.display());
                }
                None => print!("{}", resolved.text),
            }
        }
    }

    Ok(())
}

fn print_lint(path: &str, r: &promptcase_core::types::LintResult) {
    let loc = match (r.line, r.column) {
        (Some(l), Some(c)) => format!("{path}:{l}:{c}"),
        (Some(l), None) => format!("{path}:{l}"),
        _ => path.to_string(),
    };
    eprintln!("{loc}: {:?}: [{}] {}", r.severity, r.rule, r.message);
}

fn main() {
    if let Err(e) = run() {
        eprintln!("error: {e}");
        process::exit(1);
    }
}
