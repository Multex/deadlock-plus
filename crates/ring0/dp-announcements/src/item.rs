use semver::VersionReq;
use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use ts_rs::TS;

use crate::link::{self, AnnouncementLink};
use crate::{Context, Platform};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum AnnouncementSeverity {
    Info,
    Warning,
    Critical,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Announcement {
    pub id: String,
    pub title: String,
    pub body: String,
    pub severity: AnnouncementSeverity,
    pub link: Option<AnnouncementLink>,
}

#[derive(Debug, Clone)]
pub(crate) struct Item {
    pub announcement: Announcement,
    versions: Option<VersionReq>,
    platforms: Option<Vec<Platform>>,
    starts: Option<OffsetDateTime>,
    ends: Option<OffsetDateTime>,
}

impl Item {
    pub fn shows(&self, ctx: &Context) -> bool {
        self.versions.as_ref().is_none_or(|range| range.matches(&ctx.version))
            && self.platforms.as_ref().is_none_or(|list| ctx.platform.is_some_and(|p| list.contains(&p)))
            && self.starts.is_none_or(|starts| starts <= ctx.now)
            && self.ends.is_none_or(|ends| ctx.now < ends)
    }
}

const MAX_ID_CHARS: usize = 64;
const MAX_TITLE_CHARS: usize = 80;
const MAX_BODY_CHARS: usize = 600;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Raw {
    id: String,
    title: String,
    body: String,
    severity: AnnouncementSeverity,
    versions: Option<String>,
    platforms: Option<Vec<Platform>>,
    starts_at: Option<String>,
    ends_at: Option<String>,
    link: Option<serde_json::Value>,
}

/// `None` when the item breaks a limit or a field fails to parse; the rest of the feed is kept.
pub(crate) fn parse(value: serde_json::Value) -> Option<Item> {
    let raw: Raw = serde_json::from_value(value).ok()?;
    let id_ok = raw.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !id_ok
        || !within(&raw.id, MAX_ID_CHARS)
        || !within(&raw.title, MAX_TITLE_CHARS)
        || !within(&raw.body, MAX_BODY_CHARS)
    {
        return None;
    }
    let versions = raw.versions.map(|text| VersionReq::parse(&text)).transpose().ok()?;
    let time = |text: Option<String>| text.map(|t| OffsetDateTime::parse(&t, &Rfc3339)).transpose().ok();
    let starts = time(raw.starts_at)?;
    let ends = time(raw.ends_at)?;
    Some(Item {
        announcement: Announcement {
            id: raw.id,
            title: raw.title,
            body: raw.body,
            severity: raw.severity,
            link: raw.link.and_then(link::parse),
        },
        versions,
        platforms: raw.platforms,
        starts,
        ends,
    })
}

fn within(text: &str, max_chars: usize) -> bool {
    (1..=max_chars).contains(&text.chars().count())
}
