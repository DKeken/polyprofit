use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("WebSocket error: {0}")]
    WebSocket(String),

    #[error("API error: {0}")]
    Api(String),

    #[error("Auth error: {0}")]
    Auth(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Heartbeat failed: {0}")]
    Heartbeat(String),

    #[error("Order rejected: {0}")]
    OrderRejected(String),

    #[error("Risk limit hit: {0}")]
    RiskLimit(String),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
}
