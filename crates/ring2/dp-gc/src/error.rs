use std::fmt;

/// Messages never include the refresh token or any GC session data.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GcError {
    /// No usable Steam session on this machine: logged out, "remember me" off, or the blob did not decrypt.
    AuthUnavailable(String),
    /// The GC handshake or a GC job failed, for example because the account does not own the game.
    GcUnavailable(String),
    /// Steam's GC is throttling this account.
    GcRateLimited,
    /// The GC refused a friend's match history because their profile is private.
    HistoryPrivate,
    /// A deadlock-api request failed.
    Api(String),
}

impl std::error::Error for GcError {}

impl fmt::Display for GcError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::AuthUnavailable(s) => write!(f, "Steam session unavailable: {s}"),
            Self::GcUnavailable(s) => write!(f, "Steam GC unavailable: {s}"),
            Self::GcRateLimited => write!(f, "Steam GC rate-limited the request"),
            Self::HistoryPrivate => write!(f, "match history is private"),
            Self::Api(s) => write!(f, "deadlock-api request failed: {s}"),
        }
    }
}
