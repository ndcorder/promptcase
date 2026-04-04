use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Git(#[from] git2::Error),
    #[error("{0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("{0}")]
    Reqwest(#[from] reqwest::Error),
    #[error("{0}")]
    Custom(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
