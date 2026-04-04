# Promptcase — Promotion & Publishing Plan

## One-Liner Pitch

**Promptcase is a local-first desktop app for managing, versioning, and composing LLM prompt templates — stored as Markdown files with Git-backed history.**

---

## Competitive Positioning

Every major prompt management tool (PromptLayer, Langfuse, LangSmith, PromptHub, Vellum, Braintrust) is cloud-hosted and team-oriented. Promptcase is the only **local-first, open-source desktop app** that treats prompts as plain files you own. This is the core differentiator — lean into it on every channel.

| Competitor | Model | Differentiator |
|-|-|-|
| [PromptLayer](https://www.promptlayer.com/) | Cloud, free tier + $249/mo Pro | No-code visual editor for non-technical teams |
| [Langfuse](https://langfuse.com/) ([GitHub](https://github.com/langfuse/langfuse)) | Open-source, self-hostable | LLM observability platform with prompt management as one feature |
| [PromptHub](https://www.prompthub.us/) | Cloud, free tier + $12/user/mo | Git-style branching and merging for prompts |
| [Promptfoo](https://www.promptfoo.dev/) ([GitHub](https://github.com/promptfoo/promptfoo)) | Open-source CLI | Eval-first with red-teaming security scanning |
| **Promptcase** | Local-first, GPL-3.0, free forever | Desktop-native, files-on-disk, template composition, zero cloud dependency |

---

## 1. Distribution Steps

### GitHub Release

- [ ] Create a v0.1.0 release with macOS, Windows, and Linux binaries (Tauri generates `.dmg`, `.msi`, `.AppImage`)
- [ ] Write release notes summarizing core features (template composition, git history, token counting)
- [ ] Add screenshots and a short GIF demo to the release body

### Package Managers

- [ ] **Homebrew Cask**: submit a cask formula to [`homebrew/homebrew-cask`](https://github.com/Homebrew/homebrew-cask)
- [ ] **Scoop** (Windows): submit a manifest to [`ScoopInstaller/Extras`](https://github.com/ScoopInstaller/Extras)
- [ ] **AUR** (Arch Linux): publish a `promptcase-bin` PKGBUILD
- [ ] **Flathub**: submit a Flatpak manifest for Linux distribution

---

## 2. GitHub SEO

### Repository Description

> Local-first desktop app for managing, versioning, and composing LLM prompt templates. Git-backed history, YAML frontmatter, template composition, token counting. Built with Tauri, Svelte 5, and Node.js.

### Topics

```
prompt-engineering
prompt-management
llm-tools
prompt-templates
tauri
svelte
desktop-app
ai-tools
version-control
token-counting
local-first
```

### Additional GitHub Optimizations

- [ ] Add Open Graph image (1280x640 social preview) showing the app UI
- [ ] Pin the repository if using a GitHub org
- [ ] Enable Discussions for community feedback
- [ ] Add badges to README: license, release version, downloads count, build status

---

## 3. Reddit Posts

### Rules & Etiquette

- **Reddit 10% rule**: no more than 10% of your posting history should be self-promotion. Build karma and comment history before launch day.
- **r/LocalLLaMA** (845k+ members): posts must relate to LLMs. Use the correct flair. No sensationalized titles. Search before posting.
- **r/PromptEngineering** (301k+ members): check sidebar rules before posting; provide genuine value, not just a link drop.
- **r/SideProject**: self-promotion is explicitly allowed — one of the best subreddits for launch posts.

### Draft 1 — r/PromptEngineering

**Title:** I built a desktop app for managing prompt templates with Git versioning, variable substitution, and token counting

**Body:**

> I got tired of managing LLM prompts across scattered text files and notes apps, so I built Promptcase — a native desktop app that stores prompts as Markdown files with YAML frontmatter.
>
> What it does:
>
> - **Template composition** — reuse fragments across prompts with `{{> fragment-name}}`
> - **Variable substitution** — `{{variable}}` placeholders with enum support
> - **Git-backed version history** — view diffs, browse history, restore previous versions
> - **Token counting** — estimates for Claude and GPT-4o
> - **Full-text search** and **command palette**
>
> Everything is local. No cloud, no accounts, no database. Prompts are plain Markdown files on your disk.
>
> It's open source (GPL-3.0): https://github.com/ndcorder/promptcase
>
> Would love feedback on the template composition model and what metadata fields you'd find most useful in the YAML frontmatter.

### Draft 2 — r/LocalLLaMA

**Title:** Promptcase — open-source desktop prompt manager with template composition and git-backed version history

**Body:**

> Sharing a tool I built for managing prompt templates locally. Promptcase is a native desktop app (Tauri v2) that stores prompts as Markdown + YAML frontmatter files on disk.
>
> The local-first angle: no cloud, no accounts, no telemetry. Your prompts are plain files you own, version-controlled with built-in Git integration.
>
> Key features:
> - Template composition (`{{> fragment-name}}`) for reusable prompt parts
> - Variable substitution with enum values
> - Git diff viewer and history browser
> - Token counting for multiple models
> - Full-text search across all prompts
>
> Stack: Tauri v2 (Rust) + Svelte 5 + Node.js sidecar. Lightweight native app, not an Electron wrapper.
>
> GPL-3.0 open source: https://github.com/ndcorder/promptcase
>
> Curious if anyone else has a structured workflow for managing prompts, and what features would make this more useful for local model users.

### Draft 3 — r/SideProject

**Title:** After months of managing prompts in random .txt files, I built a proper desktop app for it

**Body:**

> I had dozens of LLM prompts scattered across text files, notes apps, and random GitHub gists. Every time I wanted to reuse a system prompt fragment or check what I changed last week, it was a mess.
>
> So I built Promptcase — a native desktop app for managing prompt templates. Each prompt is a Markdown file with YAML frontmatter for metadata (tags, variables, model targets). Git history is built in so you can see every change.
>
> The feature I use most is template composition: define reusable fragments and include them with `{{> fragment-name}}`. Combined with variable substitution, it's like having a proper templating system for prompts.
>
> Built with Tauri v2, Svelte 5, and a Node.js sidecar. Open source under GPL-3.0.
>
> Repo: https://github.com/ndcorder/promptcase
>
> [screenshot]

### Other Subreddits

| Subreddit | Angle | Members |
|-|-|-|
| [r/MacApps](https://reddit.com/r/MacApps) | Polish the macOS build first; show a clean screenshot | 90k+ |
| [r/OpenSource](https://reddit.com/r/OpenSource) | GPL-3.0, local-first, no vendor lock-in | 130k+ |
| [r/ArtificialIntelligence](https://reddit.com/r/ArtificialIntelligence) | Prompt management as an emerging workflow need | 1.2M+ |
| [r/sveltejs](https://reddit.com/r/sveltejs) | Svelte 5 + CodeMirror 6 technical deep-dive | 80k+ |
| [r/rust](https://reddit.com/r/rust) | Tauri v2 architecture, sidecar pattern | 350k+ |

---

## 4. Hacker News — Show HN

### Timing

Post between **8–11 AM ET, Tuesday–Thursday**. Weekends can also work well for Show HN posts (less competition). Ask 3–10 trusted people to read and upvote within the first 30 minutes.

### Title

```
Show HN: Promptcase – Local-first desktop app for versioning and composing LLM prompt templates
```

### Founder Comment (post immediately after submission)

> Hi HN — I built Promptcase because I got tired of managing LLM prompts across scattered files and notes apps. It's a native desktop app (Tauri v2 + Svelte 5) that stores prompts as Markdown files with YAML frontmatter.
>
> Key features:
> - Template composition: reuse fragments across prompts with `{{> fragment-name}}`
> - Variable substitution with enum support
> - Git-backed version history with diff viewer
> - Token counting for Claude and GPT-4o
> - Full-text search, command palette, real-time linting
>
> Prompts are plain files on disk — no database, no cloud, no lock-in. The git integration is handled by a Node.js sidecar using simple-git.
>
> It's GPL-3.0 open source: https://github.com/ndcorder/promptcase
>
> Every major prompt management tool (PromptLayer, Langfuse, PromptHub) is cloud-hosted. I wanted something that works offline and treats prompts as files I own. Curious what HN thinks about the local-first approach vs. cloud-based alternatives.
>
> Happy to answer questions about the Tauri + Svelte + Node sidecar architecture.

---

## 5. Dev.to Article

### Title

**"Building a Local-First Desktop Prompt Manager with Tauri, Svelte 5, and Git"**

### Outline

1. **The Problem** — Prompts are code-like artifacts that deserve version control, metadata, and composability, but most people store them in random text files or notes apps. Existing tools (PromptLayer, Langfuse, PromptHub) are cloud-hosted and team-oriented — there's nothing for individual developers who want local control.

2. **The Approach** — Store prompts as Markdown files with YAML frontmatter. Use Git for versioning. Support template composition (partials) and variable substitution. Keep everything on disk.

3. **Architecture Deep-Dive**
   - Tauri v2 for the native shell (small binary, no Electron bloat)
   - Svelte 5 frontend with CodeMirror 6 editor
   - Node.js sidecar for git ops, token counting (js-tiktoken), and full-text search (MiniSearch)
   - Why a sidecar instead of Rust-native: ecosystem pragmatism

4. **Key Features with Screenshots**
   - YAML frontmatter editor
   - Template composition with `{{> fragment-name}}`
   - Git diff viewer and history browser
   - Token counting across models
   - Command palette and full-text search

5. **What I Learned** — Tauri v2 sidecar pattern, Svelte 5 reactivity with CodeMirror, gray-matter for frontmatter parsing.

6. **What's Next** — Roadmap items, call for contributors.

### Tags

`#ai`, `#opensource`, `#svelte`, `#rust`

---

## 6. Awesome-List PRs

Submit PRs to the following curated lists (all URLs verified as of March 2026):

| List | Section | URL |
|-|-|-|
| Awesome Prompt Engineering | Tools | [github.com/promptslab/Awesome-Prompt-Engineering](https://github.com/promptslab/Awesome-Prompt-Engineering) |
| Awesome ChatGPT | Developer Tools | [github.com/humanloop/awesome-chatgpt](https://github.com/humanloop/awesome-chatgpt) |
| Awesome Generative AI | Tools / Discoveries | [github.com/steven2358/awesome-generative-ai](https://github.com/steven2358/awesome-generative-ai) |
| Awesome Tauri | Apps | [github.com/tauri-apps/awesome-tauri](https://github.com/tauri-apps/awesome-tauri) |
| Awesome Svelte | Apps | [github.com/TheComputerM/awesome-svelte](https://github.com/TheComputerM/awesome-svelte) |
| Awesome LLM Apps | Tools | [github.com/Shubhamsaboo/awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) |

**Note:** The awesome-tauri list is maintained by `tauri-apps` (not `nicholasgasior` as previously listed). The awesome-generative-ai list uses a "Discoveries" section for newer projects that haven't been fully reviewed.

### PR Template (adapt per list)

```
- [Promptcase](https://github.com/ndcorder/promptcase) — Local-first desktop app for managing, versioning, and composing LLM prompt templates. Git-backed history, YAML frontmatter, template composition. Built with Tauri + Svelte. (GPL-3.0)
```

---

## 7. Product Hunt

### Strategy

- **Best days**: Tuesday–Thursday for general traffic. Weekends can work well for developer tools (less competition, higher dev share of visitors).
- **Launch time**: 12:01 AM PT to maximize ranking window.
- **Preparation**: Start engaging on Product Hunt 30+ days before launch — comment on other products, upvote genuinely, build a follower base. Many makers reciprocate on launch day.
- **First 4 hours are critical**: activate supporters immediately, respond to every comment.

### Assets Checklist

- [ ] Logo: 240x240
- [ ] Gallery images: 1270x760, 3–5 screenshots showing key features
- [ ] GIF or video demo: under 3 minutes, showing the core workflow
- [ ] Tagline: "Version control and compose your LLM prompts — locally, in plain Markdown"
- [ ] Categories: Developer Tools, Artificial Intelligence, Productivity

### Maker Comment

> Hi! I built Promptcase because every prompt management tool I found was cloud-hosted and team-oriented. I just wanted a clean desktop app that stores prompts as Markdown files with Git versioning.
>
> Key features: template composition (reuse prompt fragments), variable substitution, git diff viewer, token counting for Claude and GPT-4o, and full-text search. Everything runs locally — no accounts, no cloud, no lock-in.
>
> Built with Tauri v2 + Svelte 5 + Node.js sidecar. Open source under GPL-3.0.
>
> Would love to hear how you currently manage your prompts and what features would make Promptcase more useful for your workflow!

### Pre-Launch

- [ ] Create a "Coming Soon" page on Product Hunt and gather followers
- [ ] Recruit 3–5 early users to leave genuine reviews on launch day (do not ask for upvotes — ask them to try the tool and share honest feedback)

---

## 8. AI Tool Directories

| Directory | Submission URL | Notes |
|-|-|-|
| There's An AI For That | [theresanaiforthat.com/submit](https://theresanaiforthat.com/submit/) | Free submission; 5M+ monthly visitors |
| Futurepedia | [futurepedia.io/submit-tool](https://www.futurepedia.io/submit-tool) | 400k+ monthly visitors; AI tools only |
| Toolify.ai | [toolify.ai/submit](https://www.toolify.ai/submit) | $49 one-time; listed within 48h with dofollow links |
| AlternativeTo | [alternativeto.net](https://alternativeto.net/) | Free; position against PromptLayer, LangSmith, PromptHub. Differentiate: local-first, open-source, no cloud |

---

## 9. Tauri & Svelte Community Showcases

| Channel | URL | Action |
|-|-|-|
| Made with Tauri | [madewithtauri.com](https://madewithtauri.com/) | Submit the app for inclusion |
| Tauri GitHub Discussions (Show & Tell) | [github.com/tauri-apps/tauri/discussions](https://github.com/tauri-apps/tauri/discussions/categories/show-and-tell) | Post a showcase thread |
| Awesome Tauri | [github.com/tauri-apps/awesome-tauri](https://github.com/tauri-apps/awesome-tauri) | Submit a PR (covered in Section 6) |
| Tauri Discord | [discord.com/invite/tauri](https://discord.com/invite/tauri) | Share in the showcase channel (21k+ members) |
| Svelte Discord | [discord.com/invite/svelte](https://discord.com/invite/svelte) | Share in the showcase channel (67k+ members) |

---

## 10. Other Channels

### Indie Hackers

- [ ] Post a launch story at [indiehackers.com](https://www.indiehackers.com/) — focus on the problem/solution narrative, not a feature list
- [ ] Follow the 90/10 rule: 90% value-giving engagement, 10% product mention

### daily.dev

- [ ] Write a technical article or share the Dev.to post — [daily.dev](https://daily.dev/) personalizes feeds for 1M+ developers

### X (Twitter)

- [ ] Post a demo GIF with a one-liner pitch on launch day
- [ ] Write a technical thread about the Tauri + Svelte + Node sidecar architecture
- [ ] Share traction metrics (stars, downloads) as social proof in follow-up posts

### LinkedIn

- [ ] Post the same launch narrative with the demo GIF — LinkedIn's algorithm currently favors native content with images

---

## 11. Day 1–7 Launch Timeline

### Pre-Launch (Day -30 to -1)

- [ ] Finalize README with screenshots, GIF demo, and badges
- [ ] Record a 90-second demo video
- [ ] Build and test release binaries for all platforms
- [ ] Prepare all social media copy and assets
- [ ] Set up GitHub Discussions
- [ ] Pre-write Dev.to article (save as draft)
- [ ] Create Product Hunt "Coming Soon" page and gather followers
- [ ] Start engaging on Product Hunt (comment, upvote, give feedback to other makers)
- [ ] Build Reddit karma in target subreddits by commenting helpfully

### Day 1 — GitHub + Hacker News

- [ ] Tag and publish v0.1.0 release on GitHub with binaries
- [ ] Post Show HN (aim for 8–9 AM ET, Tuesday–Thursday)
- [ ] Post founder comment immediately
- [ ] Monitor HN for questions and respond within 30 minutes
- [ ] Tweet/post on X with demo GIF
- [ ] Share on LinkedIn

### Day 2 — Reddit

- [ ] Post to r/PromptEngineering (morning)
- [ ] Post to r/LocalLLaMA (afternoon — stagger to avoid looking spammy)
- [ ] Engage with all comments authentically

### Day 3 — Product Hunt + Dev.to

- [ ] Launch on Product Hunt (12:01 AM PT)
- [ ] Post maker comment immediately
- [ ] Share PH link on X, LinkedIn
- [ ] Engage with PH comments all day — first 4 hours are critical
- [ ] Publish Dev.to article

### Day 4 — Community Lists & Directories

- [ ] Submit awesome-list PRs (3–4 lists)
- [ ] Submit to AI tool directories (There's An AI For That, Futurepedia)
- [ ] Submit Homebrew Cask PR
- [ ] Post to r/SideProject
- [ ] Post to Indie Hackers

### Day 5 — Niche Communities

- [ ] Post to r/sveltejs and r/rust with technical angle
- [ ] Share in Tauri Discord ([discord.com/invite/tauri](https://discord.com/invite/tauri))
- [ ] Share in Svelte Discord ([discord.com/invite/svelte](https://discord.com/invite/svelte))
- [ ] Submit to Made with Tauri and Tauri GitHub Discussions
- [ ] Submit to AlternativeTo

### Day 6 — Follow-Up Content

- [ ] Share traction metrics (stars, downloads) on X
- [ ] Respond to all GitHub issues and discussions
- [ ] Write a technical thread on X about architecture decisions
- [ ] Submit remaining awesome-list PRs

### Day 7 — Retrospective & Plan

- [ ] Review analytics: GitHub stars, traffic, downloads, referral sources
- [ ] Identify which channels drove the most engagement
- [ ] Prioritize feature requests from community feedback
- [ ] Plan v0.2.0 based on user input
