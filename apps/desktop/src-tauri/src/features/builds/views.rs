use dp_builds::file::Section;
use dp_builds::model::BuildView;
use dp_builds::queue::QueuedSaveView;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Serializes exactly as `dp_builds::file::Section`, which has no TypeScript binding of its own.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum BuildSection {
    Favorites,
    Unpublished,
    SavedLastUsed,
}

impl From<Section> for BuildSection {
    fn from(section: Section) -> Self {
        match section {
            Section::Favorites => BuildSection::Favorites,
            Section::Unpublished => BuildSection::Unpublished,
            Section::SavedLastUsed => BuildSection::SavedLastUsed,
        }
    }
}

impl From<BuildSection> for Section {
    fn from(section: BuildSection) -> Self {
        match section {
            BuildSection::Favorites => Section::Favorites,
            BuildSection::Unpublished => Section::Unpublished,
            BuildSection::SavedLastUsed => Section::SavedLastUsed,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LocalBuilds {
    pub account_id: u32,
    pub exists: bool,
    pub game_running: bool,
    pub builds: Vec<LocalBuild>,
    pub last_used: Vec<LastUsedBuild>,
    pub queue: Vec<QueuedSaveView>,
    pub next_local_id: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LocalBuild {
    pub section: BuildSection,
    pub build: BuildView,
    /// Hex of the exact blob in the file; sent back unchanged as the conflict base of an edit.
    pub base: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LastUsedBuild {
    pub hero_class: String,
    pub build_id: u32,
}

#[derive(Debug, Clone, PartialEq, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum SaveRequest {
    Edit {
        section: BuildSection,
        base: String,
        build: BuildView,
    },
    New {
        build: BuildView,
    },
    /// `source` is the hex blob of the build to copy.
    Copy {
        source: String,
        build: BuildView,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum SaveResult {
    Written { build_id: u32, backup: Option<String> },
    Unchanged { build_id: u32 },
    Queued { id: String, build_id: u32 },
    Conflict { conflicts: Vec<ConflictView> },
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ConflictView {
    /// The queued save that raised it; `None` for a save made right away.
    pub save_id: Option<String>,
    pub id: u32,
    pub section: BuildSection,
    pub ours: Option<BuildView>,
    pub game: Option<BuildView>,
    pub base: Option<BuildView>,
    /// Hex of what the file holds now, to retry an edit on top of it.
    pub game_blob: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum FlushView {
    Saved { build_ids: Vec<u32> },
    Conflict { conflicts: Vec<ConflictView> },
    GameRunning,
    Failed { code: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum ResolveChoice {
    Ours,
    Game,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct BuildBackup {
    pub path: String,
    pub timestamp: u64,
}
