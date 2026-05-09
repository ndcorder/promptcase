use regex::Regex;

use crate::types::{Assertion, AssertionResult};

pub fn check_assertions(response: &str, token_count: usize, assertions: &[Assertion]) -> Vec<AssertionResult> {
    assertions.iter().map(|a| check_one(response, token_count, a)).collect()
}

fn check_one(response: &str, token_count: usize, assertion: &Assertion) -> AssertionResult {
    let lower = response.to_lowercase();
    let (passed, detail) = match assertion {
        Assertion::Contains { value } => {
            let found = lower.contains(&value.to_lowercase());
            (found, if found {
                format!("Found \"{}\"" , value)
            } else {
                format!("\"{}\" not found in response", value)
            })
        }
        Assertion::NotContains { value } => {
            let absent = !lower.contains(&value.to_lowercase());
            (absent, if absent {
                format!("\"{}\" correctly absent", value)
            } else {
                format!("\"{}\" was found in response", value)
            })
        }
        Assertion::MatchesRegex { value } => {
            match Regex::new(value) {
                Ok(re) => {
                    let matched = re.is_match(response);
                    (matched, if matched {
                        format!("Matched /{}/", value)
                    } else {
                        format!("No match for /{}/", value)
                    })
                }
                Err(e) => (false, format!("Invalid regex: {}", e)),
            }
        }
        Assertion::MaxTokens { value } => {
            let ok = token_count <= *value;
            (ok, format!("{} tokens (max {})", token_count, value))
        }
        Assertion::MinTokens { value } => {
            let ok = token_count >= *value;
            (ok, format!("{} tokens (min {})", token_count, value))
        }
        Assertion::StartsWith { value } => {
            let starts = lower.starts_with(&value.to_lowercase());
            (starts, if starts {
                format!("Starts with \"{}\"" , value)
            } else {
                format!("Does not start with \"{}\"" , value)
            })
        }
    };

    AssertionResult {
        assertion: assertion.clone(),
        passed,
        detail,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_contains_pass() {
        let results = check_assertions("Hello World", 2, &[
            Assertion::Contains { value: "hello".into() },
        ]);
        assert_eq!(results.len(), 1);
        assert!(results[0].passed);
    }

    #[test]
    fn test_contains_fail() {
        let results = check_assertions("Hello World", 2, &[
            Assertion::Contains { value: "goodbye".into() },
        ]);
        assert!(!results[0].passed);
    }

    #[test]
    fn test_not_contains_pass() {
        let results = check_assertions("Hello World", 2, &[
            Assertion::NotContains { value: "goodbye".into() },
        ]);
        assert!(results[0].passed);
    }

    #[test]
    fn test_not_contains_fail() {
        let results = check_assertions("Hello World", 2, &[
            Assertion::NotContains { value: "hello".into() },
        ]);
        assert!(!results[0].passed);
    }

    #[test]
    fn test_matches_regex_pass() {
        let results = check_assertions("abc 123 def", 3, &[
            Assertion::MatchesRegex { value: r"\d{3}".into() },
        ]);
        assert!(results[0].passed);
    }

    #[test]
    fn test_matches_regex_fail() {
        let results = check_assertions("abc def", 2, &[
            Assertion::MatchesRegex { value: r"\d+".into() },
        ]);
        assert!(!results[0].passed);
    }

    #[test]
    fn test_matches_regex_invalid() {
        let results = check_assertions("abc", 1, &[
            Assertion::MatchesRegex { value: r"[invalid".into() },
        ]);
        assert!(!results[0].passed);
        assert!(results[0].detail.contains("Invalid regex"));
    }

    #[test]
    fn test_max_tokens_pass() {
        let results = check_assertions("text", 50, &[
            Assertion::MaxTokens { value: 100 },
        ]);
        assert!(results[0].passed);
    }

    #[test]
    fn test_max_tokens_fail() {
        let results = check_assertions("text", 150, &[
            Assertion::MaxTokens { value: 100 },
        ]);
        assert!(!results[0].passed);
    }

    #[test]
    fn test_max_tokens_boundary() {
        let results = check_assertions("text", 100, &[
            Assertion::MaxTokens { value: 100 },
        ]);
        assert!(results[0].passed);
    }

    #[test]
    fn test_min_tokens_pass() {
        let results = check_assertions("text", 50, &[
            Assertion::MinTokens { value: 10 },
        ]);
        assert!(results[0].passed);
    }

    #[test]
    fn test_min_tokens_fail() {
        let results = check_assertions("text", 5, &[
            Assertion::MinTokens { value: 10 },
        ]);
        assert!(!results[0].passed);
    }

    #[test]
    fn test_min_tokens_boundary() {
        let results = check_assertions("text", 10, &[
            Assertion::MinTokens { value: 10 },
        ]);
        assert!(results[0].passed);
    }

    #[test]
    fn test_starts_with_pass() {
        let results = check_assertions("Hello World", 2, &[
            Assertion::StartsWith { value: "hello".into() },
        ]);
        assert!(results[0].passed);
    }

    #[test]
    fn test_starts_with_fail() {
        let results = check_assertions("Hello World", 2, &[
            Assertion::StartsWith { value: "world".into() },
        ]);
        assert!(!results[0].passed);
    }

    #[test]
    fn test_multiple_assertions_all_pass() {
        let results = check_assertions("Hello World has tokens", 3, &[
            Assertion::Contains { value: "hello".into() },
            Assertion::NotContains { value: "goodbye".into() },
            Assertion::MaxTokens { value: 10 },
            Assertion::MinTokens { value: 1 },
            Assertion::StartsWith { value: "hello".into() },
        ]);
        assert_eq!(results.len(), 5);
        assert!(results.iter().all(|r| r.passed));
    }

    #[test]
    fn test_multiple_assertions_mixed() {
        let results = check_assertions("Hello World", 50, &[
            Assertion::Contains { value: "hello".into() },
            Assertion::Contains { value: "missing".into() },
            Assertion::MaxTokens { value: 10 },
        ]);
        assert_eq!(results.len(), 3);
        assert!(results[0].passed);
        assert!(!results[1].passed);
        assert!(!results[2].passed);
    }

    #[test]
    fn test_empty_assertions() {
        let results = check_assertions("Hello", 1, &[]);
        assert!(results.is_empty());
    }
}
