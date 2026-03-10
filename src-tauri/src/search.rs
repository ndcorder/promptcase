use std::collections::HashMap;

use crate::types::{PromptEntry, PromptType, SearchFilters, SearchResult};

/// A flattened, searchable representation of a prompt document.
pub struct SearchableDoc {
    pub path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub body: String,
    pub variables: Vec<String>,
    pub folder: String,
    pub prompt_type: String,
}

/// In-memory full-text search index for prompt documents.
pub struct PromptSearch {
    documents: HashMap<String, SearchableDoc>,
}

impl PromptSearch {
    /// Create an empty search index.
    pub fn new() -> Self {
        Self {
            documents: HashMap::new(),
        }
    }

    /// Index a prompt entry with its body text. Replaces any existing document at the same path.
    pub fn add_document(&mut self, entry: &PromptEntry, body: &str) {
        let fm = &entry.frontmatter;
        let doc = SearchableDoc {
            path: entry.path.clone(),
            title: fm.title.clone(),
            tags: fm.tags.clone(),
            body: body.to_string(),
            variables: fm.variables.iter().map(|v| v.name.clone()).collect(),
            folder: fm.folder.clone(),
            prompt_type: prompt_type_str(&fm.prompt_type),
        };
        self.documents.insert(entry.path.clone(), doc);
    }

    /// Remove a document from the index by path.
    pub fn remove_document(&mut self, path: &str) {
        self.documents.remove(path);
    }

    /// Search for documents matching `query`, optionally filtered.
    ///
    /// Scoring:
    /// - Title contains term: +3.0
    /// - Tag matches term: +2.0
    /// - Body contains term: +1.0
    /// - Variable name contains term: +1.5
    ///
    /// Results are sorted by score descending and capped at 50.
    pub fn search(&self, query: &str, filters: Option<&SearchFilters>) -> Vec<SearchResult> {
        let terms: Vec<String> = query
            .split_whitespace()
            .map(|t| t.to_lowercase())
            .collect();

        if terms.is_empty() {
            return Vec::new();
        }

        let mut scored: Vec<(f64, &SearchableDoc)> = self
            .documents
            .values()
            .filter_map(|doc| {
                // Apply filters first.
                if let Some(f) = filters {
                    if let Some(ref tag) = f.tag {
                        if !doc.tags.iter().any(|t| t == tag) {
                            return None;
                        }
                    }
                    if let Some(ref folder) = f.folder {
                        if !doc.folder.starts_with(folder.as_str()) {
                            return None;
                        }
                    }
                    if let Some(ref ft) = f.filter_type {
                        if doc.prompt_type != prompt_type_str(ft) {
                            return None;
                        }
                    }
                }

                let score = compute_score(doc, &terms);
                if score > 0.0 {
                    Some((score, doc))
                } else {
                    None
                }
            })
            .collect();

        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(50);

        scored
            .into_iter()
            .map(|(score, doc)| {
                let snippet = make_snippet(&doc.body, &terms);
                SearchResult {
                    path: doc.path.clone(),
                    title: doc.title.clone(),
                    snippet,
                    score,
                    tags: doc.tags.clone(),
                }
            })
            .collect()
    }

    /// Remove all documents from the index.
    pub fn clear(&mut self) {
        self.documents.clear();
    }

    /// Number of indexed documents.
    pub fn document_count(&self) -> usize {
        self.documents.len()
    }
}

/// Compute relevance score for a document against the given query terms.
fn compute_score(doc: &SearchableDoc, terms: &[String]) -> f64 {
    let title_lower = doc.title.to_lowercase();
    let body_lower = doc.body.to_lowercase();
    let tags_lower: Vec<String> = doc.tags.iter().map(|t| t.to_lowercase()).collect();
    let vars_lower: Vec<String> = doc.variables.iter().map(|v| v.to_lowercase()).collect();

    let mut score = 0.0f64;
    for term in terms {
        if title_lower.contains(term.as_str()) {
            score += 3.0;
        }
        for tag in &tags_lower {
            if tag.contains(term.as_str()) {
                score += 2.0;
            }
        }
        if body_lower.contains(term.as_str()) {
            score += 1.0;
        }
        for var in &vars_lower {
            if var.contains(term.as_str()) {
                score += 1.5;
            }
        }
    }
    score
}

/// Extract a short snippet from the body around the first matching term.
fn make_snippet(body: &str, terms: &[String]) -> String {
    let body_lower = body.to_lowercase();
    let mut best_pos: Option<usize> = None;

    for term in terms {
        if let Some(pos) = body_lower.find(term.as_str()) {
            if best_pos.is_none() || pos < best_pos.unwrap() {
                best_pos = Some(pos);
            }
        }
    }

    match best_pos {
        Some(pos) => {
            let start = pos.saturating_sub(40);
            let end = (pos + 120).min(body.len());
            // Align to char boundaries.
            let start = body.floor_char_boundary(start);
            let end = body.ceil_char_boundary(end);
            let mut snippet = body[start..end].to_string();
            if start > 0 {
                snippet.insert_str(0, "...");
            }
            if end < body.len() {
                snippet.push_str("...");
            }
            snippet
        }
        None => {
            let end = body.ceil_char_boundary(160.min(body.len()));
            let mut s = body[..end].to_string();
            if end < body.len() {
                s.push_str("...");
            }
            s
        }
    }
}

fn prompt_type_str(pt: &PromptType) -> String {
    match pt {
        PromptType::Prompt => "prompt".to_string(),
        PromptType::Fragment => "fragment".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{PromptFrontmatter, PromptType, VariableDefinition};

    fn make_entry(path: &str, title: &str, tags: Vec<&str>, folder: &str) -> PromptEntry {
        PromptEntry {
            path: path.to_string(),
            frontmatter: PromptFrontmatter {
                id: path.to_string(),
                title: title.to_string(),
                prompt_type: PromptType::Prompt,
                tags: tags.into_iter().map(String::from).collect(),
                folder: folder.to_string(),
                model_targets: None,
                variables: vec![VariableDefinition {
                    name: "input".to_string(),
                    description: None,
                    default: None,
                    enum_values: None,
                }],
                includes: vec![],
                created: "2025-01-01".to_string(),
                modified: "2025-01-01".to_string(),
                starred_versions: vec![],
            },
        }
    }

    #[test]
    fn search_by_title() {
        let mut idx = PromptSearch::new();
        let entry = make_entry("a.md", "Code Review Helper", vec!["review"], "prompts");
        idx.add_document(&entry, "This prompt helps with code reviews.");

        let results = idx.search("review", None);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "a.md");
        assert!(results[0].score > 0.0);
    }

    #[test]
    fn filter_by_tag() {
        let mut idx = PromptSearch::new();
        idx.add_document(
            &make_entry("a.md", "Alpha", vec!["rust"], "prompts"),
            "body a",
        );
        idx.add_document(
            &make_entry("b.md", "Beta", vec!["python"], "prompts"),
            "body b",
        );

        let filters = SearchFilters {
            tag: Some("rust".to_string()),
            folder: None,
            filter_type: None,

        };
        // Search with a broad term that matches both, then filter.
        let results = idx.search("body", Some(&filters));
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "a.md");
    }

    #[test]
    fn remove_document_not_found() {
        let mut idx = PromptSearch::new();
        let entry = make_entry("a.md", "Alpha", vec![], "prompts");
        idx.add_document(&entry, "body");
        assert_eq!(idx.document_count(), 1);

        idx.remove_document("a.md");
        assert_eq!(idx.document_count(), 0);

        let results = idx.search("alpha", None);
        assert!(results.is_empty());
    }

    #[test]
    fn replace_existing_document() {
        let mut idx = PromptSearch::new();
        let entry = make_entry("a.md", "Old Title", vec![], "prompts");
        idx.add_document(&entry, "old body");

        let entry2 = make_entry("a.md", "New Title", vec![], "prompts");
        idx.add_document(&entry2, "new body");

        assert_eq!(idx.document_count(), 1);
        let results = idx.search("new", None);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "New Title");
    }

    #[test]
    fn clear_removes_all() {
        let mut idx = PromptSearch::new();
        idx.add_document(&make_entry("a.md", "A", vec![], "p"), "body");
        idx.add_document(&make_entry("b.md", "B", vec![], "p"), "body");
        idx.clear();
        assert_eq!(idx.document_count(), 0);
    }

    #[test]
    fn score_ordering() {
        let mut idx = PromptSearch::new();
        // "deploy" in title gets +3, in body gets +1 = 4
        idx.add_document(
            &make_entry("a.md", "Deploy Guide", vec![], "prompts"),
            "How to deploy your app.",
        );
        // "deploy" only in body gets +1
        idx.add_document(
            &make_entry("b.md", "Setup Guide", vec![], "prompts"),
            "After setup, deploy the service.",
        );

        let results = idx.search("deploy", None);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].path, "a.md"); // higher score
        assert!(results[0].score > results[1].score);
    }

    #[test]
    fn search_empty_index() {
        let idx = PromptSearch::new();
        let results = idx.search("anything", None);
        assert!(results.is_empty());
    }

    #[test]
    fn search_with_empty_query() {
        let mut idx = PromptSearch::new();
        idx.add_document(&make_entry("a.md", "Alpha", vec![], "p"), "body");
        let results = idx.search("", None);
        assert!(results.is_empty());
        // Also whitespace-only
        let results2 = idx.search("   ", None);
        assert!(results2.is_empty());
    }

    #[test]
    fn search_case_insensitive() {
        let mut idx = PromptSearch::new();
        idx.add_document(
            &make_entry("a.md", "Hello World", vec![], "p"),
            "Some body text",
        );

        let results = idx.search("hello", None);
        assert_eq!(results.len(), 1);

        let results2 = idx.search("HELLO", None);
        assert_eq!(results2.len(), 1);

        let results3 = idx.search("hElLo", None);
        assert_eq!(results3.len(), 1);
    }

    #[test]
    fn search_multiple_terms_higher_score() {
        let mut idx = PromptSearch::new();
        // This doc has both "code" and "review" in body
        idx.add_document(
            &make_entry("both.md", "General", vec![], "p"),
            "This is about code review practices.",
        );
        // This doc has only "code" in body
        idx.add_document(
            &make_entry("single.md", "General2", vec![], "p"),
            "This is about code quality.",
        );

        let results = idx.search("code review", None);
        // "both.md" should score higher because it matches both terms
        assert!(results.len() >= 1);
        assert_eq!(results[0].path, "both.md");
        if results.len() > 1 {
            assert!(results[0].score > results[1].score);
        }
    }

    #[test]
    fn filter_by_folder() {
        let mut idx = PromptSearch::new();
        idx.add_document(
            &make_entry("a.md", "Alpha", vec![], "engineering"),
            "shared body content",
        );
        idx.add_document(
            &make_entry("b.md", "Beta", vec![], "marketing"),
            "shared body content",
        );

        let filters = SearchFilters {
            tag: None,
            folder: Some("engineering".to_string()),
            filter_type: None,

        };
        let results = idx.search("shared", Some(&filters));
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "a.md");
    }

    fn make_fragment_entry(path: &str, title: &str, folder: &str) -> PromptEntry {
        PromptEntry {
            path: path.to_string(),
            frontmatter: PromptFrontmatter {
                id: path.to_string(),
                title: title.to_string(),
                prompt_type: PromptType::Fragment,
                tags: vec![],
                folder: folder.to_string(),
                model_targets: None,
                variables: vec![],
                includes: vec![],
                created: "2025-01-01".to_string(),
                modified: "2025-01-01".to_string(),
                starred_versions: vec![],
            },
        }
    }

    #[test]
    fn filter_by_type() {
        let mut idx = PromptSearch::new();
        idx.add_document(
            &make_entry("a.md", "PromptDoc", vec![], "p"),
            "common keyword",
        );
        idx.add_document(
            &make_fragment_entry("b.md", "FragDoc", "p"),
            "common keyword",
        );

        let filters = SearchFilters {
            tag: None,
            folder: None,
            filter_type: Some(PromptType::Fragment),

        };
        let results = idx.search("common", Some(&filters));
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].path, "b.md");
    }

    #[test]
    fn snippet_generation_with_ellipsis() {
        let mut idx = PromptSearch::new();
        // Create a long body where the match is in the middle
        let long_body = format!(
            "{}The magic keyword appears here.{}",
            "A".repeat(200),
            "B".repeat(200)
        );
        idx.add_document(
            &make_entry("a.md", "Snippet Test", vec![], "p"),
            &long_body,
        );

        let results = idx.search("magic", None);
        assert_eq!(results.len(), 1);
        let snippet = &results[0].snippet;
        // Snippet should contain ellipsis since match is in the middle of a long body
        assert!(snippet.contains("..."));
        assert!(snippet.contains("magic"));
    }

    #[test]
    fn max_results_cap() {
        let mut idx = PromptSearch::new();
        // Add 60 documents all matching a broad term
        for i in 0..60 {
            let path = format!("doc{i}.md");
            let title = format!("Document {i}");
            idx.add_document(
                &make_entry(&path, &title, vec![], "p"),
                "common searchable body text",
            );
        }

        let results = idx.search("common", None);
        assert!(results.len() <= 50, "Expected max 50 results, got {}", results.len());
        assert_eq!(results.len(), 50);
    }
}
