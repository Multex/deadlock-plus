mod item;
mod link;
#[cfg(test)]
mod tests;

use std::cmp::Reverse;
use std::collections::HashSet;
use std::fmt;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::Deserialize;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

pub use item::{Announcement, AnnouncementSeverity};
pub use link::AnnouncementLink;

pub const URL: &str = "https://deadlockplus.app/announcements.json";
pub const MAX_ENVELOPE_BYTES: usize = 64 * 1024;

/// An ed25519 public key the feed may be signed with: the envelope's `keyId` and the raw 32-byte key as unpadded
/// base64url (the private JWK's `x`).
#[derive(Debug, Clone, Copy)]
pub struct PublicKey<'a> {
    pub id: &'a str,
    pub x: &'a str,
}

/// Keys a feed may be signed with. More than one may be listed so the signing key can be rotated.
pub const KEYS: &[PublicKey<'static>] = &[];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Windows,
    Linux,
}

impl Platform {
    pub fn current() -> Option<Self> {
        if cfg!(windows) {
            Some(Self::Windows)
        } else if cfg!(target_os = "linux") {
            Some(Self::Linux)
        } else {
            None
        }
    }
}

#[derive(Debug, Clone)]
pub struct Context {
    pub version: semver::Version,
    pub platform: Option<Platform>,
    pub now: OffsetDateTime,
}

impl Context {
    pub fn current(version: semver::Version) -> Self {
        Self { version, platform: Platform::current(), now: OffsetDateTime::now_utc() }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeedError {
    TooLarge,
    Malformed,
    UnknownKey,
    BadSignature,
    UnsupportedVersion,
    BadPayload,
}

impl fmt::Display for FeedError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::TooLarge => "the feed is over the size limit",
            Self::Malformed => "the feed envelope is malformed",
            Self::UnknownKey => "the feed is signed with an unknown key",
            Self::BadSignature => "the feed signature does not verify",
            Self::UnsupportedVersion => "the feed version is not supported",
            Self::BadPayload => "the feed payload is malformed",
        })
    }
}

#[derive(Debug, Clone)]
pub struct Feed {
    issued_at: OffsetDateTime,
    items: Vec<item::Item>,
}

impl Feed {
    pub fn issued_at(&self) -> OffsetDateTime {
        self.issued_at
    }

    /// The items for this app version, platform and time: most severe first, then the latest added (further down
    /// the list) first.
    pub fn visible(&self, ctx: &Context) -> Vec<Announcement> {
        let mut shown: Vec<(usize, &item::Item)> =
            self.items.iter().enumerate().filter(|(_, item)| item.shows(ctx)).collect();
        shown.sort_by_key(|&(position, item)| (Reverse(item.announcement.severity), Reverse(position)));
        shown.into_iter().map(|(_, item)| item.announcement.clone()).collect()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Envelope {
    key_id: String,
    payload: String,
    signature: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Payload {
    issued_at: String,
    announcements: Vec<serde_json::Value>,
}

const PAYLOAD_VERSION: u64 = 1;
const MAX_ANNOUNCEMENTS: usize = 20;

/// The signature covers the decoded payload bytes, so no JSON canonicalisation is involved.
pub fn verify(envelope: &[u8], keys: &[PublicKey]) -> Result<Feed, FeedError> {
    if envelope.len() > MAX_ENVELOPE_BYTES {
        return Err(FeedError::TooLarge);
    }
    let envelope: Envelope = serde_json::from_slice(envelope).map_err(|_| FeedError::Malformed)?;
    let key = keys.iter().find(|key| key.id == envelope.key_id).ok_or(FeedError::UnknownKey)?;
    let payload = URL_SAFE_NO_PAD.decode(&envelope.payload).map_err(|_| FeedError::Malformed)?;
    let signature = URL_SAFE_NO_PAD.decode(&envelope.signature).map_err(|_| FeedError::Malformed)?;
    let public = URL_SAFE_NO_PAD.decode(key.x).map_err(|_| FeedError::BadSignature)?;
    UnparsedPublicKey::new(&ED25519, &public).verify(&payload, &signature).map_err(|_| FeedError::BadSignature)?;
    parse_payload(&payload)
}

fn parse_payload(bytes: &[u8]) -> Result<Feed, FeedError> {
    let value: serde_json::Value = serde_json::from_slice(bytes).map_err(|_| FeedError::BadPayload)?;
    let fields = value.as_object().ok_or(FeedError::BadPayload)?;
    if fields.get("version").and_then(serde_json::Value::as_u64) != Some(PAYLOAD_VERSION) {
        return Err(FeedError::UnsupportedVersion);
    }
    let payload: Payload = serde_json::from_value(value).map_err(|_| FeedError::BadPayload)?;
    if payload.announcements.len() > MAX_ANNOUNCEMENTS {
        return Err(FeedError::BadPayload);
    }
    let issued_at = OffsetDateTime::parse(&payload.issued_at, &Rfc3339).map_err(|_| FeedError::BadPayload)?;
    let mut ids = HashSet::new();
    let items = payload
        .announcements
        .into_iter()
        .filter_map(item::parse)
        .filter(|item| ids.insert(item.announcement.id.clone()))
        .collect();
    Ok(Feed { issued_at, items })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Fetch {
    /// The host has no feed: there are no announcements.
    Missing,
    Body(Vec<u8>),
    Failed(String),
}

impl Fetch {
    pub fn from_response(status: u16, body: Vec<u8>) -> Self {
        match status {
            404 => Self::Missing,
            200..=299 => Self::Body(body),
            _ => Self::Failed(format!("HTTP {status}")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    Fetch(String),
    Feed(FeedError),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Fetch(e) => write!(f, "could not fetch announcements: {e}"),
            Self::Feed(e) => e.fmt(f),
        }
    }
}

#[derive(Debug)]
pub struct Resolved {
    pub feed: Option<Feed>,
    /// The envelope to store as the last verified feed.
    pub save: Option<Vec<u8>>,
    /// Why the fetched feed was not used although a stored one is shown.
    pub rejected: Option<Error>,
}

impl Resolved {
    pub fn announcements(&self, ctx: &Context) -> Vec<Announcement> {
        self.feed.as_ref().map(|feed| feed.visible(ctx)).unwrap_or_default()
    }
}

/// Picks the feed to show from a fetch and the last verified envelope. A feed issued before the stored one is a
/// replay and is ignored; when the fetch fails or is rejected, the stored feed stands in.
pub fn resolve(fetch: Fetch, stored: Option<&[u8]>, keys: &[PublicKey]) -> Result<Resolved, Error> {
    let fallback = |problem: Error| match stored.and_then(|bytes| verify(bytes, keys).ok()) {
        Some(feed) => Ok(Resolved { feed: Some(feed), save: None, rejected: Some(problem) }),
        None => Err(problem),
    };
    let body = match fetch {
        Fetch::Missing => return Ok(Resolved { feed: None, save: None, rejected: None }),
        Fetch::Failed(e) => return fallback(Error::Fetch(e)),
        Fetch::Body(body) => body,
    };
    let fresh = match verify(&body, keys) {
        Ok(feed) => feed,
        Err(e) => return fallback(Error::Feed(e)),
    };
    let last = stored.and_then(|bytes| verify(bytes, keys).ok());
    if let Some(last) = last.filter(|last| last.issued_at > fresh.issued_at) {
        return Ok(Resolved { feed: Some(last), save: None, rejected: None });
    }
    let save = (stored != Some(body.as_slice())).then_some(body);
    Ok(Resolved { feed: Some(fresh), save, rejected: None })
}
