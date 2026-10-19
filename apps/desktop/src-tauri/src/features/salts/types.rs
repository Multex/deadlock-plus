use serde::Serialize;
use ts_rs::TS;

/// Where Deadlock+ found a match it shared.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum ShareSource {
    /// Steam's download of the match.
    Steam,
    /// Read from Deadlock while it ran.
    Deadlock,
    /// Fetched by signing in to Steam.
    Login,
}

/// A match Deadlock+ shared with the Deadlock API.
#[derive(Serialize, Clone, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct SharedMatch {
    pub match_id: u64,
    pub at: i64,
    pub source: ShareSource,
    pub details: bool,
    pub replay: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn share_source_serializes_in_lowercase() {
        assert_eq!(serde_json::to_value(ShareSource::Steam).unwrap(), "steam");
        assert_eq!(serde_json::to_value(ShareSource::Deadlock).unwrap(), "deadlock");
        assert_eq!(serde_json::to_value(ShareSource::Login).unwrap(), "login");
    }

    #[test]
    fn shared_match_serializes_with_camel_case_keys() {
        let shared = SharedMatch { match_id: 7, at: 100, source: ShareSource::Login, details: true, replay: false };
        assert_eq!(
            serde_json::to_value(shared).unwrap(),
            json!({"matchId": 7, "at": 100, "source": "login", "details": true, "replay": false})
        );
    }
}
