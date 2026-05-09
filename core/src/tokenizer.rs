use std::sync::OnceLock;
use tiktoken_rs::{cl100k_base, o200k_base, CoreBPE};

static CL100K: OnceLock<CoreBPE> = OnceLock::new();
static O200K: OnceLock<CoreBPE> = OnceLock::new();

fn get_cl100k() -> &'static CoreBPE {
    CL100K.get_or_init(|| cl100k_base().unwrap())
}

fn get_o200k() -> &'static CoreBPE {
    O200K.get_or_init(|| o200k_base().unwrap())
}

/// Returns the tiktoken encoding name for a given model.
pub fn get_encoding_for_model(model: &str) -> &'static str {
    if model.contains("4o") || model.contains("o1") || model.contains("o3") {
        "o200k_base"
    } else {
        "cl100k_base"
    }
}

/// Count tokens in `text` using the appropriate BPE encoding for `model`.
pub fn count_tokens(text: &str, model: &str) -> usize {
    let encoding = get_encoding_for_model(model);
    let bpe = match encoding {
        "o200k_base" => get_o200k(),
        _ => get_cl100k(),
    };
    bpe.encode_with_special_tokens(text).len()
}

/// Returns true for models that lack an exact tokenizer (Claude family).
/// `cl100k_base` is used as an approximation for these.
pub fn is_approximate(model: &str) -> bool {
    let m = model.to_lowercase();
    m.contains("claude") || m.contains("sonnet") || m.contains("opus") || m.contains("haiku")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn count_tokens_known_string() {
        let count = count_tokens("hello world", "gpt-4");
        assert!(count > 0, "token count should be positive");
        assert_eq!(count, 2); // "hello" + " world"
    }

    #[test]
    fn model_routing_gpt4o_uses_o200k() {
        assert_eq!(get_encoding_for_model("gpt-4o"), "o200k_base");
        assert_eq!(get_encoding_for_model("gpt-4o-mini"), "o200k_base");
    }

    #[test]
    fn model_routing_o1_o3_use_o200k() {
        assert_eq!(get_encoding_for_model("o1-preview"), "o200k_base");
        assert_eq!(get_encoding_for_model("o3-mini"), "o200k_base");
    }

    #[test]
    fn model_routing_claude_uses_cl100k() {
        assert_eq!(get_encoding_for_model("claude-3-opus"), "cl100k_base");
        assert_eq!(get_encoding_for_model("claude-3.5-sonnet"), "cl100k_base");
    }

    #[test]
    fn model_routing_gpt4_uses_cl100k() {
        assert_eq!(get_encoding_for_model("gpt-4"), "cl100k_base");
        assert_eq!(get_encoding_for_model("gpt-3.5-turbo"), "cl100k_base");
    }

    #[test]
    fn is_approximate_claude_models() {
        assert!(is_approximate("claude-3-opus"));
        assert!(is_approximate("claude-3.5-sonnet"));
        assert!(is_approximate("claude-3-haiku"));
    }

    #[test]
    fn is_approximate_openai_models() {
        assert!(!is_approximate("gpt-4o"));
        assert!(!is_approximate("gpt-4"));
        assert!(!is_approximate("o1-preview"));
    }

    #[test]
    fn empty_string_returns_zero() {
        assert_eq!(count_tokens("", "gpt-4"), 0);
    }

    #[test]
    fn o200k_encoding_works() {
        let count = count_tokens("hello world", "gpt-4o");
        assert!(count > 0);
    }

    #[test]
    fn long_text_reasonable_count() {
        // ~1000 words of English prose
        let text = "The quick brown fox jumps over the lazy dog. ".repeat(111);
        let count = count_tokens(&text, "gpt-4");
        // 111 repetitions × 9 words × ~1.1 tok/word ≈ 1000-1200 tokens
        assert!(count >= 500 && count <= 2000, "got {count} tokens for ~1000 words");
    }

    #[test]
    fn unicode_text_produces_tokens() {
        let count = count_tokens("これは日本語のテストです。中文测试文本。", "gpt-4");
        assert!(count > 0, "unicode text should produce tokens");
    }

    #[test]
    fn code_snippet_produces_tokens() {
        let code = r#"
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

print(fibonacci(10))
"#;
        let count = count_tokens(code, "gpt-4");
        assert!(count > 5, "code snippet should produce multiple tokens, got {count}");
    }

    #[test]
    fn whitespace_only_no_crash() {
        let ws = "   \n\n\t\t  \n ";
        let _count = count_tokens(ws, "gpt-4"); // must not panic
    }

    #[test]
    fn special_token_handled() {
        let text = "<|endoftext|> some text <|endoftext|>";
        let _count = count_tokens(text, "gpt-4"); // must not panic
    }

    #[test]
    fn different_models_may_differ() {
        let text = "The quick brown fox jumps over the lazy dog";
        let cl100k = count_tokens(text, "gpt-4");
        let o200k = count_tokens(text, "gpt-4o");
        // Both should produce tokens; counts may or may not differ
        assert!(cl100k > 0);
        assert!(o200k > 0);
    }

    #[test]
    fn very_long_text_no_panic() {
        let text = "a".repeat(10_000);
        let count = count_tokens(&text, "gpt-4");
        assert!(count > 0, "10k chars should produce tokens");
    }

    #[test]
    fn model_case_sensitivity_encoding_routing() {
        // get_encoding_for_model checks lowercase substrings like "4o";
        // uppercase "GPT-4o" still contains "4o" so routing is identical.
        assert_eq!(
            get_encoding_for_model("GPT-4o"),
            get_encoding_for_model("gpt-4o")
        );
    }

    #[test]
    fn repeated_tokens_roughly_linear() {
        let single = count_tokens("hello", "gpt-4");
        let repeated = count_tokens("hello hello hello hello", "gpt-4");
        // 4 copies plus 3 spaces; should be roughly 4x (within 2x–6x)
        assert!(
            repeated >= single * 2 && repeated <= single * 8,
            "single={single}, repeated={repeated}"
        );
    }

    #[test]
    fn newlines_counted_as_tokens() {
        let text_no_nl = "abc";
        let text_with_nl = "a\nb\nc";
        let count_no_nl = count_tokens(text_no_nl, "gpt-4");
        let count_with_nl = count_tokens(text_with_nl, "gpt-4");
        // Newlines add tokens or change tokenization; both must succeed
        assert!(count_with_nl > 0);
        assert!(count_no_nl > 0);
    }

    #[test]
    fn is_approximate_mixed_case_claude() {
        assert!(is_approximate("Claude-3-Opus"));
        assert!(is_approximate("CLAUDE-3.5-SONNET"));
        assert!(is_approximate("Haiku"));
    }
}
