use serde::{Deserialize, Serialize};
use ts_rs::TS;

const MAX_LABEL_CHARS: usize = 40;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct AnnouncementLink {
    pub url: String,
    pub label: String,
}

#[derive(Deserialize)]
struct Raw {
    url: String,
    label: String,
}

/// `None` for anything but a well-formed link to one of our own places.
pub(crate) fn parse(value: serde_json::Value) -> Option<AnnouncementLink> {
    let Raw { url, label } = serde_json::from_value(value).ok()?;
    let label_chars = label.chars().count();
    (allowed(&url) && (1..=MAX_LABEL_CHARS).contains(&label_chars)).then_some(AnnouncementLink { url, label })
}

/// Our site, a Discord invite or the GitHub org. Strict on purpose: browsers read `\` as `/` and resolve `..` and
/// `%2e%2e` segments, so anything that could walk out of the allowed path is refused.
pub(crate) fn allowed(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    if rest.chars().any(|c| c.is_whitespace() || c.is_control() || c == '\\') {
        return false;
    }
    let host_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let (host, tail) = rest.split_at(host_end);
    let path = &tail[..tail.find(['?', '#']).unwrap_or(tail.len())];
    let decoded = path.to_ascii_lowercase().replace("%2e", ".");
    if decoded.split('/').any(|segment| segment == "." || segment == "..") {
        return false;
    }
    let non_empty_after = |prefix: &str| path.strip_prefix(prefix).is_some_and(|rest| !rest.is_empty());
    match host.to_ascii_lowercase().as_str() {
        "deadlockplus.app" | "www.deadlockplus.app" => true,
        "discord.gg" => non_empty_after("/"),
        "discord.com" => non_empty_after("/invite/"),
        "github.com" => path == "/deadlock-plus" || path.starts_with("/deadlock-plus/"),
        _ => false,
    }
}
