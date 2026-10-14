use super::*;
use crate::test_util::{block, vjs_c};
use crate::vpk;

const LEAKY_JS: &str = "var h = null;\nfunction f() { h = null; h = $.Schedule(1, f); }\nf();\n";

fn scratch(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("dlp-cmd-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn listing_reports_addons_and_dir() {
    let dir = scratch("list");
    std::fs::write(dir.join("pak01_dir.vpk"), b"x").unwrap();
    let listing = list_addons_from(Some(&dir));
    assert_eq!(listing.dir.as_deref(), Some(dir.to_string_lossy().as_ref()));
    assert_eq!(listing.addons.len(), 1);
    assert_eq!(listing.addons[0].file_name, "pak01_dir.vpk");
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn listing_without_a_game_dir_is_empty() {
    let listing = list_addons_from(None);
    assert!(listing.dir.is_none() && listing.addons.is_empty());
}

#[test]
fn scan_names_the_addon_and_reports_findings() {
    let dir = scratch("scan");
    let script =
        vjs_c(&[block(b"RED2", b"SearchPath\0citadel_addons/build_thing\0"), block(b"DATA", LEAKY_JS.as_bytes())]);
    let bytes = vpk::write(&[("panorama/scripts/a.vjs_c", &script)]);
    std::fs::write(dir.join("pak01_dir.vpk"), bytes).unwrap();
    let scan = scan_addon_in(&dir, "pak01_dir.vpk").unwrap();
    assert_eq!(scan.file_name, "pak01_dir.vpk");
    assert_eq!(scan.label, "build_thing");
    assert_eq!(scan.scripts_scanned, 1);
    assert_eq!(scan.scripts.len(), 1);
    assert_eq!(scan.scripts[0].path, "panorama/scripts/a.vjs_c");
    assert_eq!(scan.scripts[0].findings[0].function, "f");
    std::fs::remove_dir_all(dir).unwrap();
}

fn error_code(result: Result<AddonScan, impl serde::Serialize>) -> serde_json::Value {
    serde_json::to_value(result.expect_err("scan should fail")).unwrap()
}

#[test]
fn scan_rejects_names_outside_the_addons_dir() {
    let dir = scratch("reject");
    assert_eq!(error_code(scan_addon_in(&dir, "../pak01_dir.vpk")), "diagnostics.mod_unreadable");
    assert_eq!(error_code(scan_addon_in(&dir, "missing_dir.vpk")), "diagnostics.mod_unreadable");
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn scan_reports_a_corrupt_vpk_as_an_error() {
    let dir = scratch("corrupt");
    std::fs::write(dir.join("pak01_dir.vpk"), b"not a vpk at all").unwrap();
    assert_eq!(error_code(scan_addon_in(&dir, "pak01_dir.vpk")), "diagnostics.mod_unreadable");
    std::fs::remove_dir_all(dir).unwrap();
}

#[derive(Default)]
struct Recorder {
    listed: Option<usize>,
    progress: Vec<(usize, usize, Option<String>)>,
    checkpoints: usize,
    cancel_at: Option<usize>,
    scans: Vec<String>,
    failures: Vec<String>,
    failure_json: Vec<serde_json::Value>,
}

impl ScanObserver for Recorder {
    fn listed(&mut self, listing: &AddonListing) {
        self.listed = Some(listing.addons.len());
    }

    fn progress(&mut self, done: usize, total: usize, label: Option<&str>) {
        self.progress.push((done, total, label.map(str::to_string)));
    }

    fn checkpoint(&mut self) -> Flow {
        self.checkpoints += 1;
        if self.cancel_at == Some(self.checkpoints) {
            Flow::Cancelled
        } else {
            Flow::Continue
        }
    }

    fn scanned(&mut self, scan: AddonScan) {
        self.scans.push(scan.file_name);
    }

    fn failed(&mut self, failure: AddonFailure) {
        self.failure_json.push(serde_json::to_value(&failure).unwrap());
        self.failures.push(failure.file_name);
    }
}

fn write_addon(dir: &Path, file: &str) {
    let script = vjs_c(&[block(b"DATA", LEAKY_JS.as_bytes())]);
    std::fs::write(dir.join(file), vpk::write(&[("panorama/scripts/a.vjs_c", &script)])).unwrap();
}

#[test]
fn scan_all_reports_progress_and_results_per_addon() {
    let dir = scratch("all");
    write_addon(&dir, "pak01_dir.vpk");
    std::fs::write(dir.join("pak02_dir.vpk"), b"not a vpk at all").unwrap();
    let mut rec = Recorder::default();
    assert_eq!(scan_all(Some(&dir), &mut rec), Flow::Continue);

    assert_eq!(rec.listed, Some(2));
    assert_eq!(rec.checkpoints, 2);
    assert_eq!(rec.scans, ["pak01_dir.vpk"]);
    assert_eq!(rec.failures, ["pak02_dir.vpk"]);
    assert_eq!(
        rec.failure_json,
        [serde_json::json!({ "fileName": "pak02_dir.vpk", "error": "diagnostics.mod_unreadable" })]
    );
    let name = |n: &str| Some(n.to_string());
    assert_eq!(
        rec.progress,
        [
            (0, 2, None),
            (0, 2, name("pak01_dir.vpk")),
            (1, 2, name("pak01_dir.vpk")),
            (1, 2, name("pak02_dir.vpk")),
            (2, 2, name("pak02_dir.vpk")),
        ]
    );
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn scan_all_stops_at_a_cancelled_checkpoint() {
    let dir = scratch("cancel");
    write_addon(&dir, "pak01_dir.vpk");
    write_addon(&dir, "pak02_dir.vpk");
    let mut rec = Recorder { cancel_at: Some(2), ..Recorder::default() };
    assert_eq!(scan_all(Some(&dir), &mut rec), Flow::Cancelled);

    assert_eq!(rec.scans, ["pak01_dir.vpk"]);
    assert_eq!(rec.checkpoints, 2);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn scan_all_without_a_folder_lists_nothing() {
    let mut rec = Recorder::default();
    assert_eq!(scan_all(None, &mut rec), Flow::Continue);
    assert_eq!(rec.listed, Some(0));
    assert_eq!(rec.progress, [(0, 0, None)]);
    assert_eq!(rec.checkpoints, 0);
}
