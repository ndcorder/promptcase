pub const GETTING_STARTED: &str = r#"---
title: Getting Started with Promptcase
tags: [tutorial, guide]
model: claude-sonnet-4-20250514
variables:
  - name: topic
    description: What you want to learn about
    default: prompt engineering
---
You are a helpful assistant. Explain {{topic}} in simple terms.

Key concepts to cover:
- What it is
- Why it matters
- How to get started
"#;

pub const CODE_REVIEW: &str = r#"---
title: Code Review
tags: [development, code]
model: claude-sonnet-4-20250514
variables:
  - name: language
    description: Programming language
    default: python
    enum: [python, typescript, rust, go]
  - name: code
    description: Code to review
---
Review this {{language}} code for bugs, performance issues, and best practices:

```{{language}}
{{code}}
```

Provide specific, actionable feedback.
"#;

pub const SYSTEM_PROMPT_TEMPLATE: &str = r#"---
title: System Prompt
type: fragment
tags: [template, system]
---
You are a helpful, accurate assistant. Be concise and specific. If you're unsure about something, say so rather than guessing.
"#;

pub const SUMMARIZE: &str = r#"---
title: Summarize Text
tags: [writing, utility]
model: claude-sonnet-4-20250514
includes:
  - system-prompt
variables:
  - name: text
    description: Text to summarize
  - name: length
    description: Summary length
    default: brief
    enum: [brief, detailed, bullet-points]
---
{{> system-prompt}}

Summarize the following text in a {{length}} format:

{{text}}
"#;

pub struct SamplePrompt {
    pub path: &'static str,
    pub content: &'static str,
}

pub fn all_samples() -> Vec<SamplePrompt> {
    vec![
        SamplePrompt { path: "getting-started.md", content: GETTING_STARTED },
        SamplePrompt { path: "code-review.md", content: CODE_REVIEW },
        SamplePrompt { path: "_templates/system-prompt.md", content: SYSTEM_PROMPT_TEMPLATE },
        SamplePrompt { path: "summarize.md", content: SUMMARIZE },
    ]
}
