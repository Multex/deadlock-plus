pub mod matches;
pub mod postgame;
pub mod shared_matches;

use std::path::{Component, Path, PathBuf};
use ts_rs::TS;

use serde::{Deserialize, Serialize};

const DEADLOCK_APP_ID: &str = "1422450";

/// Saved frametime runs, written by the kv store as `<store>.json`.
const FRAME_RUNS_FILE: &str = "frame-runs.json";

/// One JSON file per opened match, see [`matches`].
const MATCHES_DIR: &str = "matches";

/// One ping recording per match, written while the match runs.
pub const MATCH_PING_DIR: &str = "match-ping";

/// Extension of the recordings inside [`MATCH_PING_DIR`]; the folder also holds an index file.
const MATCH_PING_EXT: &str = "dpmp";
const MATCH_PING_INDEX: &str = "index.json";

/// The per-match MVP grades; clearing it only costs a regrade on the next background run.
const MVP_DIR: &str = "mvp";
const MVP_GRADES_DIR: &str = "grades";

/// Which files in the app data folder each entry owns. Whatever no entry lists falls into
/// `OtherAppFiles`, so a new file is counted the moment it appears.
const APP_FILES: &[(EntryId, &[&str])] = &[
    (EntryId::Settings, &["app-settings.json", "connection-settings.json", ".window-state.json"]),
    (EntryId::ServerPresets, &["presets.json"]),
    (EntryId::ReplayRules, &["demo-pins.json", "demo-cleanup-rules.json"]),
    (EntryId::ConnectionHistory, &["connection-history.jsonl"]),
    (EntryId::Notifications, &["alerts.json", "notifications.json"]),
    (EntryId::PatchNotesIndex, &["patch-notes-index.json"]),
    (EntryId::StatsCache, &["stats-cache.json"]),
    (EntryId::ServerListCache, &["server-picker-cache.json"]),
    (EntryId::ReplayInfoCache, &["demo-metadata.json"]),
    (EntryId::FrameRuns, &[FRAME_RUNS_FILE]),
    (EntryId::MatchCache, &[MATCHES_DIR]),
    (EntryId::PostgameDetail, &[postgame::POSTGAME_DIR]),
    (EntryId::MatchPing, &[MATCH_PING_DIR]),
    (EntryId::MvpGrades, &[MVP_DIR]),
    (EntryId::SharedMatches, &[shared_matches::SHARED_MATCHES_FILE]),
];

fn app_files(id: EntryId) -> Option<&'static [&'static str]> {
    APP_FILES.iter().find(|(entry, _)| *entry == id).map(|(_, files)| *files)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "kebab-case")]
pub enum EntryId {
    Replays,
    Addons,
    AddonsBackups,
    ConfigBackups,
    GameinfoBackups,
    HeroPresenceCache,
    ShaderCache,
    ConsoleLog,
    VoiceBanBackups,
    FrameRuns,
    Settings,
    ServerPresets,
    ReplayRules,
    ConnectionHistory,
    Notifications,
    PatchNotesIndex,
    StatsCache,
    ServerListCache,
    ReplayInfoCache,
    MatchCache,
    PostgameDetail,
    MatchPing,
    MvpGrades,
    SharedMatches,
    OtherAppFiles,
    Logs,
}

pub const ALL_ENTRIES: [EntryId; 26] = [
    EntryId::Replays,
    EntryId::Addons,
    EntryId::AddonsBackups,
    EntryId::ConfigBackups,
    EntryId::GameinfoBackups,
    EntryId::HeroPresenceCache,
    EntryId::ShaderCache,
    EntryId::ConsoleLog,
    EntryId::VoiceBanBackups,
    EntryId::FrameRuns,
    EntryId::Settings,
    EntryId::ServerPresets,
    EntryId::ReplayRules,
    EntryId::ConnectionHistory,
    EntryId::Notifications,
    EntryId::PatchNotesIndex,
    EntryId::StatsCache,
    EntryId::ServerListCache,
    EntryId::ReplayInfoCache,
    EntryId::MatchCache,
    EntryId::PostgameDetail,
    EntryId::MatchPing,
    EntryId::MvpGrades,
    EntryId::SharedMatches,
    EntryId::OtherAppFiles,
    EntryId::Logs,
];

#[derive(Debug, Default, Clone)]
pub struct Roots {
    pub install: Option<PathBuf>,
    pub userdata: Option<PathBuf>,
    pub app_data: Option<PathBuf>,
    pub logs: Option<PathBuf>,
}

impl Roots {
    fn citadel(&self) -> Option<PathBuf> {
        Some(self.install.as_ref()?.join("game").join("citadel"))
    }

    fn remote(&self) -> Option<PathBuf> {
        Some(self.userdata.as_ref()?.join(DEADLOCK_APP_ID).join("remote"))
    }

    fn allowed(&self) -> Vec<&Path> {
        [&self.install, &self.userdata, &self.app_data, &self.logs]
            .into_iter()
            .flatten()
            .map(PathBuf::as_path)
            .collect()
    }
}

struct Item {
    path: PathBuf,
    skip: Vec<&'static str>,
}

impl Item {
    fn whole(path: PathBuf) -> Self {
        Self { path, skip: Vec::new() }
    }
}

/// Only things the game or this app regenerates on its own. Everything under `addons` and the
/// `gameinfo.gi*` files belong to the game or the mod manager and are never offered.
pub fn is_clearable(id: EntryId) -> bool {
    matches!(
        id,
        EntryId::ShaderCache
            | EntryId::ConsoleLog
            | EntryId::VoiceBanBackups
            | EntryId::MatchCache
            | EntryId::PostgameDetail
            | EntryId::MatchPing
            | EntryId::MvpGrades
            | EntryId::SharedMatches
            | EntryId::Logs
    )
}

/// Matches `<name>.backup-<unix seconds>` with an optional `-<n>` suffix, as written by the
/// mute list editor. The name part must be present and the suffix purely numeric, so a user's
/// own `voice_ban.dt.backup-old` is never picked up.
pub fn is_our_backup(name: &str) -> bool {
    let Some((base, suffix)) = name.rsplit_once(".backup-") else {
        return false;
    };
    let mut parts = suffix.splitn(2, '-');
    let digits = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    !base.is_empty() && parts.next().is_some_and(digits) && parts.next().is_none_or(digits)
}

/// Lexical check: the path must sit strictly under `root` with no `..` segments.
pub fn within(root: &Path, path: &Path) -> bool {
    let clean = !path.components().any(|c| matches!(c, Component::ParentDir));
    clean && path != root && path.starts_with(root)
}

fn is_symlink(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink())
}

/// Symlinks and junctions count as zero and are not entered: the game's `replays` link would
/// otherwise be counted twice, and a link can point outside the folder being measured.
/// `skip_top_level` names direct children left out of the total.
pub fn dir_size(path: &Path, skip_top_level: &[&str]) -> u64 {
    fn walk(path: &Path, skip: &[&str]) -> u64 {
        let Ok(meta) = std::fs::symlink_metadata(path) else {
            return 0;
        };
        if meta.file_type().is_symlink() {
            return 0;
        }
        if meta.is_file() {
            return meta.len();
        }
        let Ok(read) = std::fs::read_dir(path) else {
            return 0;
        };
        read.filter_map(Result::ok)
            .filter(|e| !skip.iter().any(|s| e.file_name() == *s))
            .map(|e| walk(&e.path(), &[]))
            .sum()
    }
    walk(path, skip_top_level)
}

fn children_matching(dir: &Path, keep: impl Fn(&str, bool) -> bool) -> Vec<PathBuf> {
    let Ok(read) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    read.filter_map(Result::ok)
        .filter(|e| {
            let is_dir = e.file_type().is_ok_and(|t| t.is_dir());
            keep(&e.file_name().to_string_lossy(), is_dir)
        })
        .map(|e| e.path())
        .collect()
}

fn items(id: EntryId, roots: &Roots) -> Vec<Item> {
    let citadel = roots.citadel();
    let in_citadel = |name: &str| citadel.as_ref().map(|c| Item::whole(c.join(name)));
    if let Some(files) = app_files(id) {
        return roots.app_data.iter().flat_map(|d| files.iter().map(|f| Item::whole(d.join(f)))).collect();
    }
    match id {
        EntryId::Replays => in_citadel("addons").map(|i| Item::whole(i.path.join("replays"))).into_iter().collect(),
        EntryId::Addons => {
            in_citadel("addons").map(|i| Item { path: i.path, skip: vec!["replays"] }).into_iter().collect()
        }
        EntryId::AddonsBackups => in_citadel("addons-backups").into_iter().collect(),
        EntryId::HeroPresenceCache => in_citadel("hero_presence_cache.json").into_iter().collect(),
        EntryId::ShaderCache => in_citadel("shadercache").into_iter().collect(),
        EntryId::ConsoleLog => in_citadel("console.log").into_iter().collect(),
        EntryId::ConfigBackups => citadel
            .iter()
            .flat_map(|c| children_matching(c, |n, dir| dir && n.starts_with("_config_backup_")))
            .map(Item::whole)
            .collect(),
        EntryId::GameinfoBackups => citadel
            .iter()
            .flat_map(|c| children_matching(c, |n, dir| !dir && n.starts_with("gameinfo.gi.bak")))
            .map(Item::whole)
            .collect(),
        EntryId::VoiceBanBackups => roots
            .remote()
            .iter()
            .flat_map(|r| children_matching(r, |n, dir| !dir && is_our_backup(n)))
            .map(Item::whole)
            .collect(),
        EntryId::OtherAppFiles => {
            let skip = APP_FILES.iter().flat_map(|(_, files)| files.iter().copied()).collect();
            roots.app_data.clone().map(|path| Item { path, skip }).into_iter().collect()
        }
        EntryId::Logs => roots.logs.clone().map(Item::whole).into_iter().collect(),
        // Entries listed in `APP_FILES` returned above.
        _ => Vec::new(),
    }
}

/// Folder shown and opened for "reveal": the thing itself for single-target entries, the folder
/// holding the matches for the backup entries.
pub fn location(id: EntryId, roots: &Roots) -> Option<PathBuf> {
    match id {
        EntryId::ConfigBackups | EntryId::GameinfoBackups => roots.citadel(),
        EntryId::VoiceBanBackups => roots.remote(),
        _ if app_files(id).is_some_and(|files| files.len() > 1) => roots.app_data.clone(),
        _ => items(id, roots).into_iter().next().map(|i| i.path),
    }
}

pub fn entry_size(id: EntryId, roots: &Roots) -> u64 {
    items(id, roots).iter().map(|i| dir_size(&i.path, &i.skip)).sum()
}

/// The things a user would count in an entry: a collection's children, or the matched backups.
/// `None` for entries that are a single file or an opaque tree, where a count means nothing.
fn units(id: EntryId, roots: &Roots) -> Option<Vec<PathBuf>> {
    match id {
        EntryId::Replays | EntryId::AddonsBackups | EntryId::MatchCache | EntryId::PostgameDetail | EntryId::Logs => {
            items(id, roots).into_iter().next().map(|i| children_matching(&i.path, |_, _| true))
        }
        EntryId::MatchPing => items(id, roots).into_iter().next().map(|i| match_ping_recordings(&i.path)),
        EntryId::MvpGrades => {
            items(id, roots).into_iter().next().map(|i| children_matching(&i.path.join(MVP_GRADES_DIR), |_, _| true))
        }
        EntryId::ConfigBackups | EntryId::GameinfoBackups | EntryId::VoiceBanBackups => {
            location(id, roots).map(|_| items(id, roots).into_iter().map(|i| i.path).collect())
        }
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct EntryStats {
    pub bytes: u64,
    pub count: Option<u32>,
    pub oldest_secs: Option<u64>,
}

pub fn entry_stats(id: EntryId, roots: &Roots) -> EntryStats {
    let units = units(id, roots);
    let oldest_secs = units.as_ref().and_then(|u| {
        u.iter()
            .filter_map(|p| std::fs::symlink_metadata(p).ok()?.modified().ok())
            .filter_map(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .min()
    });
    EntryStats { bytes: entry_size(id, roots), count: units.map(|u| u.len() as u32), oldest_secs }
}

fn match_ping_recordings(dir: &Path) -> Vec<PathBuf> {
    children_matching(dir, |name, is_dir| !is_dir && Path::new(name).extension().is_some_and(|e| e == MATCH_PING_EXT))
}

/// Recordings not named in `keep`, plus the index once no recording is left for it to point at.
fn match_ping_paths(dir: &Path, keep: &[String]) -> Vec<PathBuf> {
    let kept = |p: &PathBuf| p.file_stem().is_some_and(|s| keep.iter().any(|k| s == k.as_str()));
    let (kept, removable): (Vec<_>, Vec<_>) = match_ping_recordings(dir).into_iter().partition(kept);
    let mut paths = removable;
    if kept.is_empty() {
        paths.push(dir.join(MATCH_PING_INDEX));
    }
    paths.retain(|p| p.is_file());
    paths
}

/// What "clear" would remove. Shader cache and match cache clear the contents and keeps the folder itself, so
/// the game does not have to recreate it.
fn clear_paths(id: EntryId, roots: &Roots, keep: &[String]) -> Result<Vec<PathBuf>, String> {
    if !is_clearable(id) {
        return Err("This can't be cleared from here.".into());
    }
    let citadel = roots.citadel();
    let paths: Vec<PathBuf> = match id {
        EntryId::ShaderCache => {
            citadel.iter().flat_map(|c| children_matching(&c.join("shadercache"), |_, _| true)).collect()
        }
        EntryId::ConsoleLog => citadel.iter().map(|c| c.join("console.log")).filter(|p| p.is_file()).collect(),
        EntryId::MatchCache | EntryId::PostgameDetail | EntryId::MvpGrades => {
            items(id, roots).iter().flat_map(|i| children_matching(&i.path, |_, _| true)).collect()
        }
        EntryId::MatchPing => items(id, roots).iter().flat_map(|i| match_ping_paths(&i.path, keep)).collect(),
        // The active `latest.log`/`debug.log`/`trace.log` stay open for the running process; only
        // already-rolled archives can be removed on demand.
        EntryId::Logs => roots
            .logs
            .iter()
            .flat_map(|d| children_matching(d, |n, is_dir| !is_dir && n.ends_with(".log.gz")))
            .collect(),
        _ => items(id, roots).into_iter().map(|i| i.path).collect(),
    };
    let allowed = roots.allowed();
    Ok(paths.into_iter().filter(|p| !is_symlink(p) && allowed.iter().any(|r| within(r, p))).collect())
}

#[derive(Debug, Default)]
pub struct ClearReport {
    pub freed_bytes: u64,
    pub removed: usize,
    pub failed: Vec<String>,
}

pub fn clear(id: EntryId, roots: &Roots) -> Result<ClearReport, String> {
    clear_except(id, roots, &[])
}

/// Like [`clear`], but leaves alone the match ping recordings whose file stem is in `keep`.
pub fn clear_except(id: EntryId, roots: &Roots, keep: &[String]) -> Result<ClearReport, String> {
    let mut report = ClearReport::default();
    for path in clear_paths(id, roots, keep)? {
        let size = dir_size(&path, &[]);
        let result = if path.is_dir() { std::fs::remove_dir_all(&path) } else { std::fs::remove_file(&path) };
        match result {
            Ok(()) => {
                report.freed_bytes += size;
                report.removed += 1;
            }
            Err(e) => {
                let name = path.file_name().unwrap_or_default().to_string_lossy();
                log::warn!("could not clear {name}: {e}");
                report.failed.push(name.into_owned());
            }
        }
    }
    log::info!(
        "storage cleared ({id:?}): {} removed, {} bytes freed, {} failed",
        report.removed,
        report.freed_bytes,
        report.failed.len()
    );
    Ok(report)
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct EntryInfo {
    pub id: EntryId,
    pub path: Option<String>,
    pub clearable: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-storage-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![0u8; bytes]).unwrap();
    }

    /// A fake install, account folder and app data folder with a known byte count in each place.
    fn fixture(name: &str) -> (PathBuf, Roots) {
        let base = temp_dir(name);
        let citadel = base.join("install").join("game").join("citadel");
        write(&citadel.join("shadercache").join("a.bin"), 10);
        write(&citadel.join("shadercache").join("sub").join("b.bin"), 20);
        write(&citadel.join("console.log"), 5);
        write(&citadel.join("hero_presence_cache.json"), 3);
        write(&citadel.join("gameinfo.gi"), 100);
        write(&citadel.join("gameinfo.gi.bak"), 7);
        write(&citadel.join("gameinfo.gi.bak2"), 8);
        write(&citadel.join("_config_backup_20260813").join("x.cfg"), 11);
        write(&citadel.join("pak01_dir.vpk"), 1000);
        write(&citadel.join("addons").join("replays").join("1.dem"), 400);
        write(&citadel.join("addons").join("pak01_dir.vpk"), 60);
        write(&citadel.join("addons-backups").join("old.vpk"), 30);
        let remote = base.join("userdata").join("42").join(DEADLOCK_APP_ID).join("remote");
        write(&remote.join("voice_ban.dt"), 50);
        write(&remote.join("voice_ban.dt.backup-100"), 4);
        write(&remote.join("voice_ban.dt.backup-100-2"), 6);
        write(&remote.join("voice_ban.dt.backup-old"), 9);
        let appdata = base.join("appdata");
        for (name, bytes) in [
            ("app-settings.json", 1),
            ("connection-settings.json", 2),
            (".window-state.json", 3),
            ("presets.json", 4),
            ("demo-pins.json", 5),
            ("demo-cleanup-rules.json", 6),
            ("connection-history.jsonl", 7),
            ("alerts.json", 8),
            ("notifications.json", 9),
            ("patch-notes-index.json", 1000),
            ("stats-cache.json", 11),
            ("server-picker-cache.json", 12),
            ("demo-metadata.json", 13),
            ("maintenance.json", 14),
            ("demo-keep.json", 15),
            (FRAME_RUNS_FILE, 25),
            (shared_matches::SHARED_MATCHES_FILE, 17),
        ] {
            write(&appdata.join(name), bytes);
        }
        write(&appdata.join(MATCHES_DIR).join("100.json"), 40);
        write(&appdata.join(MATCHES_DIR).join("200.json"), 60);
        write(&appdata.join(postgame::POSTGAME_DIR).join("300.json"), 70);
        write(&appdata.join(MVP_DIR).join(MVP_GRADES_DIR).join("5.json"), 20);
        write(&appdata.join(MVP_DIR).join(MVP_GRADES_DIR).join("6.json"), 10);
        write(&appdata.join(MATCH_PING_DIR).join("m1-1.dpmp"), 16);
        write(&appdata.join(MATCH_PING_DIR).join("m1-2.dpmp"), 26);
        write(&appdata.join(MATCH_PING_DIR).join("index.json"), 2);
        write(&base.join("logs").join("debug.log"), 40);
        write(&base.join("logs").join("2026-09-01-1.log.gz"), 15);
        let roots = Roots {
            install: Some(base.join("install")),
            userdata: Some(base.join("userdata").join("42")),
            app_data: Some(base.join("appdata")),
            logs: Some(base.join("logs")),
        };
        (base, roots)
    }

    #[test]
    fn dir_size_adds_nested_files() {
        let (base, _) = fixture("nested");
        assert_eq!(dir_size(&base.join("install").join("game").join("citadel").join("shadercache"), &[]), 30);
    }

    #[test]
    fn dir_size_of_a_file_is_its_length_and_of_a_missing_path_is_zero() {
        let (base, _) = fixture("single");
        let citadel = base.join("install").join("game").join("citadel");
        assert_eq!(dir_size(&citadel.join("console.log"), &[]), 5);
        assert_eq!(dir_size(&citadel.join("nope"), &[]), 0);
    }

    #[test]
    fn dir_size_leaves_out_named_top_level_children_only() {
        let base = temp_dir("skip");
        write(&base.join("replays").join("a"), 100);
        write(&base.join("keep").join("replays").join("a"), 7);
        write(&base.join("keep").join("b"), 1);
        assert_eq!(dir_size(&base, &["replays"]), 8);
    }

    #[test]
    fn dir_size_does_not_follow_symlinks() {
        let base = temp_dir("link");
        write(&base.join("real").join("big"), 500);
        write(&base.join("outer").join("small"), 1);
        #[cfg(windows)]
        let made = std::os::windows::fs::symlink_dir(base.join("real"), base.join("outer").join("link")).is_ok();
        #[cfg(unix)]
        let made = std::os::unix::fs::symlink(base.join("real"), base.join("outer").join("link")).is_ok();
        if !made {
            eprintln!("symlinks unavailable here; skipping");
            return;
        }
        assert_eq!(dir_size(&base.join("outer"), &[]), 1);
    }

    #[test]
    fn addons_size_excludes_replays_so_nothing_is_counted_twice() {
        let (_, roots) = fixture("addons");
        assert_eq!(entry_size(EntryId::Addons, &roots), 60);
        assert_eq!(entry_size(EntryId::Replays, &roots), 400);
    }

    #[test]
    fn single_and_matching_entries_sum_their_targets() {
        let (_, roots) = fixture("sums");
        assert_eq!(entry_size(EntryId::ShaderCache, &roots), 30);
        assert_eq!(entry_size(EntryId::ConsoleLog, &roots), 5);
        assert_eq!(entry_size(EntryId::HeroPresenceCache, &roots), 3);
        assert_eq!(entry_size(EntryId::AddonsBackups, &roots), 30);
        assert_eq!(entry_size(EntryId::GameinfoBackups, &roots), 15);
        assert_eq!(entry_size(EntryId::ConfigBackups, &roots), 11);
        assert_eq!(entry_size(EntryId::VoiceBanBackups, &roots), 10);
        assert_eq!(entry_size(EntryId::FrameRuns, &roots), 25);
        assert_eq!(entry_size(EntryId::Settings, &roots), 6);
        assert_eq!(entry_size(EntryId::ServerPresets, &roots), 4);
        assert_eq!(entry_size(EntryId::ReplayRules, &roots), 11);
        assert_eq!(entry_size(EntryId::ConnectionHistory, &roots), 7);
        assert_eq!(entry_size(EntryId::Notifications, &roots), 17);
        assert_eq!(entry_size(EntryId::PatchNotesIndex, &roots), 1000);
        assert_eq!(entry_size(EntryId::StatsCache, &roots), 11);
        assert_eq!(entry_size(EntryId::ServerListCache, &roots), 12);
        assert_eq!(entry_size(EntryId::ReplayInfoCache, &roots), 13);
        assert_eq!(entry_size(EntryId::MatchCache, &roots), 100);
        assert_eq!(entry_size(EntryId::PostgameDetail, &roots), 70);
        assert_eq!(entry_size(EntryId::MatchPing, &roots), 44);
        assert_eq!(entry_size(EntryId::MvpGrades, &roots), 30);
        assert_eq!(entry_size(EntryId::SharedMatches, &roots), 17);
        assert_eq!(entry_size(EntryId::OtherAppFiles, &roots), 29);
        assert_eq!(entry_size(EntryId::Logs, &roots), 55);
    }

    #[test]
    fn entries_without_their_root_are_empty_not_errors() {
        let roots = Roots::default();
        for id in ALL_ENTRIES {
            assert_eq!(entry_size(id, &roots), 0);
            assert_eq!(location(id, &roots), None);
        }
    }

    #[test]
    fn backup_names_need_a_name_and_numeric_suffixes() {
        for ok in ["voice_ban.dt.backup-1700000000", "voice_ban.dt.backup-42-3", "a.backup-1"] {
            assert!(is_our_backup(ok), "{ok}");
        }
        for bad in [
            "voice_ban.dt",
            "voice_ban.dt.backup-old",
            ".backup-1",
            "x.backup-",
            "x.backup-1-",
            "x.backup-1-a",
            "x.backup-1-2-3",
            "x.backup-1x",
            "x.backup",
        ] {
            assert!(!is_our_backup(bad), "{bad}");
        }
    }

    #[test]
    fn within_requires_a_strict_descendant_without_parent_segments() {
        let root = Path::new("R:/game");
        assert!(within(root, &root.join("a").join("b")));
        assert!(!within(root, root));
        assert!(!within(root, Path::new("R:/other/a")));
        assert!(!within(root, &root.join("..").join("x")));
        assert!(!within(root, Path::new("R:/game-two/a")));
    }

    #[test]
    fn only_regenerable_entries_are_clearable() {
        let clearable: Vec<_> = ALL_ENTRIES.into_iter().filter(|id| is_clearable(*id)).collect();
        assert_eq!(
            clearable,
            vec![
                EntryId::ShaderCache,
                EntryId::ConsoleLog,
                EntryId::VoiceBanBackups,
                EntryId::MatchCache,
                EntryId::PostgameDetail,
                EntryId::MatchPing,
                EntryId::MvpGrades,
                EntryId::SharedMatches,
                EntryId::Logs
            ]
        );
    }

    #[test]
    fn clearing_a_read_only_entry_is_refused_and_touches_nothing() {
        let (base, roots) = fixture("refuse");
        for id in ALL_ENTRIES.into_iter().filter(|id| !is_clearable(*id)) {
            assert!(clear(id, &roots).is_err(), "{id:?}");
        }
        let citadel = base.join("install").join("game").join("citadel");
        assert!(citadel.join("gameinfo.gi.bak").exists());
        assert!(citadel.join("addons").join("replays").join("1.dem").exists());
        assert!(citadel.join("addons-backups").join("old.vpk").exists());
    }

    #[test]
    fn clearing_the_shader_cache_empties_it_but_keeps_the_folder() {
        let (base, roots) = fixture("shader");
        let report = clear(EntryId::ShaderCache, &roots).unwrap();
        let dir = base.join("install").join("game").join("citadel").join("shadercache");
        assert_eq!((report.freed_bytes, report.removed), (30, 2));
        assert!(dir.is_dir());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
    }

    #[test]
    fn clearing_the_console_log_leaves_neighbours_alone() {
        let (base, roots) = fixture("log");
        let report = clear(EntryId::ConsoleLog, &roots).unwrap();
        let citadel = base.join("install").join("game").join("citadel");
        assert_eq!(report.freed_bytes, 5);
        assert!(!citadel.join("console.log").exists());
        assert!(citadel.join("gameinfo.gi").exists());
        assert!(citadel.join("shadercache").join("a.bin").exists());
    }

    #[test]
    fn clearing_logs_removes_archives_but_leaves_the_active_file_open_for_writing() {
        let (base, roots) = fixture("logs");
        let report = clear(EntryId::Logs, &roots).unwrap();
        let logs = base.join("logs");
        assert_eq!((report.freed_bytes, report.removed), (15, 1));
        assert!(logs.join("debug.log").exists());
        assert!(!logs.join("2026-09-01-1.log.gz").exists());
    }

    #[test]
    fn clearing_mute_backups_removes_only_our_numbered_backups() {
        let (base, roots) = fixture("vb");
        let report = clear(EntryId::VoiceBanBackups, &roots).unwrap();
        let remote = base.join("userdata").join("42").join(DEADLOCK_APP_ID).join("remote");
        assert_eq!((report.freed_bytes, report.removed), (10, 2));
        assert!(remote.join("voice_ban.dt").exists());
        assert!(remote.join("voice_ban.dt.backup-old").exists());
        assert!(!remote.join("voice_ban.dt.backup-100").exists());
        assert!(!remote.join("voice_ban.dt.backup-100-2").exists());
    }

    #[test]
    fn clearing_the_match_cache_removes_every_entry_but_keeps_the_folder() {
        let (base, roots) = fixture("matches");
        let report = clear(EntryId::MatchCache, &roots).unwrap();
        let dir = base.join("appdata").join(MATCHES_DIR);
        assert_eq!((report.freed_bytes, report.removed), (100, 2));
        assert!(dir.is_dir());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        assert!(base.join("appdata").join("app-settings.json").exists());
    }

    #[test]
    fn the_match_cache_is_listed_with_its_folder_and_count() {
        let (base, roots) = fixture("matches-list");
        assert_eq!(location(EntryId::MatchCache, &roots), Some(base.join("appdata").join(MATCHES_DIR)));
        assert_eq!(entry_stats(EntryId::MatchCache, &roots).count, Some(2));
    }

    #[test]
    fn clearing_the_match_cache_leaves_the_postgame_files() {
        let (base, roots) = fixture("matches-keep-postgame");
        clear(EntryId::MatchCache, &roots).unwrap();
        assert!(base.join("appdata").join(postgame::POSTGAME_DIR).join("300.json").is_file());
    }

    #[test]
    fn clearing_the_postgame_entry_removes_only_its_files_and_keeps_the_folder() {
        let (base, roots) = fixture("postgame-clear");
        let report = clear(EntryId::PostgameDetail, &roots).unwrap();
        let dir = base.join("appdata").join(postgame::POSTGAME_DIR);
        assert_eq!((report.freed_bytes, report.removed), (70, 1));
        assert!(dir.is_dir());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        assert_eq!(fs::read_dir(base.join("appdata").join(MATCHES_DIR)).unwrap().count(), 2);
    }

    #[test]
    fn the_postgame_entry_is_listed_with_its_folder_and_count() {
        let (base, roots) = fixture("postgame-list");
        assert_eq!(location(EntryId::PostgameDetail, &roots), Some(base.join("appdata").join(postgame::POSTGAME_DIR)));
        assert_eq!(entry_stats(EntryId::PostgameDetail, &roots).count, Some(1));
    }

    #[test]
    fn the_mvp_entry_is_listed_with_its_folder_and_counts_grades_only() {
        let (base, roots) = fixture("mvp-list");
        assert_eq!(location(EntryId::MvpGrades, &roots), Some(base.join("appdata").join(MVP_DIR)));
        assert_eq!(entry_stats(EntryId::MvpGrades, &roots).count, Some(2));
    }

    #[test]
    fn clearing_the_mvp_entry_removes_the_grades_but_keeps_the_folder() {
        let (base, roots) = fixture("mvp-clear");
        let report = clear(EntryId::MvpGrades, &roots).unwrap();
        let dir = base.join("appdata").join(MVP_DIR);
        assert_eq!((report.freed_bytes, report.removed), (30, 1));
        assert!(dir.is_dir());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        assert!(base.join("appdata").join(postgame::POSTGAME_DIR).join("300.json").is_file());
    }

    #[test]
    fn every_entry_is_listed_once_shared_matches_included() {
        assert_eq!(ALL_ENTRIES.len(), 26);
        assert_eq!(ALL_ENTRIES.iter().filter(|id| **id == EntryId::SharedMatches).count(), 1);
    }

    #[test]
    fn the_shared_matches_entry_is_its_own_file_with_no_count() {
        let (base, roots) = fixture("shared-list");
        let file = base.join("appdata").join(shared_matches::SHARED_MATCHES_FILE);
        assert_eq!(location(EntryId::SharedMatches, &roots), Some(file.clone()));
        assert_eq!(shared_matches::path(&base.join("appdata")), file);
        assert_eq!(entry_stats(EntryId::SharedMatches, &roots).count, None);
    }

    #[test]
    fn clearing_the_shared_matches_entry_removes_only_its_file() {
        let (base, roots) = fixture("shared-clear");
        let report = clear(EntryId::SharedMatches, &roots).unwrap();
        let appdata = base.join("appdata");
        assert_eq!((report.freed_bytes, report.removed), (17, 1));
        assert!(!appdata.join(shared_matches::SHARED_MATCHES_FILE).exists());
        assert!(appdata.join(FRAME_RUNS_FILE).is_file());
        assert!(appdata.join(postgame::POSTGAME_DIR).join("300.json").is_file());
    }

    #[test]
    fn the_match_ping_entry_is_listed_with_its_folder_and_counts_recordings_only() {
        let (base, roots) = fixture("ping-list");
        assert_eq!(location(EntryId::MatchPing, &roots), Some(base.join("appdata").join(MATCH_PING_DIR)));
        assert_eq!(entry_stats(EntryId::MatchPing, &roots).count, Some(2));
    }

    #[test]
    fn clearing_match_pings_removes_recordings_and_index_but_keeps_the_folder() {
        let (base, roots) = fixture("ping-clear");
        let report = clear(EntryId::MatchPing, &roots).unwrap();
        let dir = base.join("appdata").join(MATCH_PING_DIR);
        assert_eq!((report.freed_bytes, report.removed), (44, 3));
        assert!(dir.is_dir());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        assert!(base.join("appdata").join(postgame::POSTGAME_DIR).join("300.json").is_file());
    }

    #[test]
    fn clearing_match_pings_keeps_a_recording_in_progress_and_the_index() {
        let (base, roots) = fixture("ping-keep");
        let report = clear_except(EntryId::MatchPing, &roots, &["m1-2".to_owned()]).unwrap();
        let dir = base.join("appdata").join(MATCH_PING_DIR);
        assert_eq!((report.freed_bytes, report.removed), (16, 1));
        assert!(dir.join("m1-2.dpmp").is_file());
        assert!(dir.join("index.json").is_file());
        assert!(!dir.join("m1-1.dpmp").exists());
    }

    #[test]
    fn clearing_clears_nothing_when_there_is_no_app_data_folder() {
        let report = clear(EntryId::MatchCache, &Roots::default()).unwrap();
        assert_eq!((report.freed_bytes, report.removed), (0, 0));
    }

    #[test]
    fn clearing_with_nothing_there_frees_nothing() {
        let report = clear(EntryId::ShaderCache, &Roots::default()).unwrap();
        assert_eq!((report.freed_bytes, report.removed), (0, 0));
    }

    #[test]
    fn a_path_outside_every_root_is_dropped_from_the_clear_list() {
        let (base, mut roots) = fixture("guard");
        roots.install = Some(base.join("install"));
        let outside = base.join("outside");
        write(&outside.join("x"), 1);
        // A userdata root pointing somewhere unrelated still only ever yields backups inside it.
        roots.userdata = Some(outside.clone());
        assert!(clear_paths(EntryId::VoiceBanBackups, &roots, &[]).unwrap().is_empty());
        assert!(outside.join("x").exists());
    }

    #[test]
    fn frame_runs_are_listed_but_never_clearable_or_double_counted() {
        let (base, roots) = fixture("runs");
        assert!(!is_clearable(EntryId::FrameRuns));
        assert!(clear(EntryId::FrameRuns, &roots).is_err());
        assert!(base.join("appdata").join(FRAME_RUNS_FILE).exists());
        assert_eq!(location(EntryId::FrameRuns, &roots), Some(base.join("appdata").join(FRAME_RUNS_FILE)));
    }

    #[test]
    fn stats_count_units_for_collections_and_backups_only() {
        let (_, roots) = fixture("stats");
        let count = |id| entry_stats(id, &roots).count;
        assert_eq!(count(EntryId::Replays), Some(1));
        assert_eq!(count(EntryId::AddonsBackups), Some(1));
        assert_eq!(count(EntryId::Logs), Some(2));
        assert_eq!(count(EntryId::VoiceBanBackups), Some(2));
        assert_eq!(count(EntryId::ConfigBackups), Some(1));
        assert_eq!(count(EntryId::GameinfoBackups), Some(2));
        for id in [EntryId::ShaderCache, EntryId::ConsoleLog, EntryId::Addons, EntryId::Settings, EntryId::FrameRuns] {
            assert_eq!(count(id), None, "{id:?}");
        }
    }

    #[test]
    fn stats_bytes_match_entry_size() {
        let (_, roots) = fixture("stats-bytes");
        for id in ALL_ENTRIES {
            assert_eq!(entry_stats(id, &roots).bytes, entry_size(id, &roots), "{id:?}");
        }
    }

    #[test]
    fn stats_report_the_oldest_unit_and_skip_it_when_there_are_none() {
        let (base, roots) = fixture("stats-age");
        let old = base.join("logs").join("2026-09-01-1.log.gz");
        let long_ago = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_000_000);
        fs::File::options().write(true).open(&old).unwrap().set_modified(long_ago).unwrap();
        assert_eq!(entry_stats(EntryId::Logs, &roots).oldest_secs, Some(1_000_000));
        assert_eq!(entry_stats(EntryId::ShaderCache, &roots).oldest_secs, None);
        assert_eq!(entry_stats(EntryId::Replays, &Roots::default()).oldest_secs, None);
        assert_eq!(entry_stats(EntryId::Replays, &Roots::default()).count, None);
    }

    #[test]
    fn stats_units_leave_out_skipped_children() {
        let (_, roots) = fixture("stats-skip");
        assert_eq!(entry_stats(EntryId::Addons, &roots).bytes, 60);
        assert_eq!(entry_stats(EntryId::Addons, &roots).count, None);
    }

    #[test]
    fn app_data_entries_partition_the_folder_with_nothing_counted_twice() {
        let (base, roots) = fixture("partition");
        let app_entries = [
            EntryId::Settings,
            EntryId::ServerPresets,
            EntryId::ReplayRules,
            EntryId::ConnectionHistory,
            EntryId::Notifications,
            EntryId::PatchNotesIndex,
            EntryId::StatsCache,
            EntryId::ServerListCache,
            EntryId::ReplayInfoCache,
            EntryId::FrameRuns,
            EntryId::MatchCache,
            EntryId::PostgameDetail,
            EntryId::MatchPing,
            EntryId::MvpGrades,
            EntryId::SharedMatches,
            EntryId::OtherAppFiles,
        ];
        let sum: u64 = app_entries.iter().map(|id| entry_size(*id, &roots)).sum();
        assert_eq!(sum, dir_size(&base.join("appdata"), &[]));
    }

    #[test]
    fn app_data_entries_are_never_clearable() {
        for id in [EntryId::Settings, EntryId::PatchNotesIndex, EntryId::StatsCache, EntryId::OtherAppFiles] {
            assert!(!is_clearable(id), "{id:?}");
        }
    }

    #[test]
    fn multi_file_app_entries_point_at_the_folder_and_single_file_ones_at_the_file() {
        let (base, roots) = fixture("app-loc");
        let appdata = base.join("appdata");
        assert_eq!(location(EntryId::Settings, &roots), Some(appdata.clone()));
        assert_eq!(location(EntryId::PatchNotesIndex, &roots), Some(appdata.join("patch-notes-index.json")));
    }

    #[test]
    fn locations_point_at_the_folder_holding_the_files() {
        let (base, roots) = fixture("loc");
        let citadel = base.join("install").join("game").join("citadel");
        assert_eq!(location(EntryId::GameinfoBackups, &roots), Some(citadel.clone()));
        assert_eq!(location(EntryId::ShaderCache, &roots), Some(citadel.join("shadercache")));
        assert_eq!(location(EntryId::Replays, &roots), Some(citadel.join("addons").join("replays")));
    }
}
