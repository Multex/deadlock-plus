use std::path::Path;

use serde::Serialize;
use ts_rs::TS;

use crate::addons::{label, list_addons_in, resolve_addon};
use crate::rules::Finding;
use crate::scripts::scan_vpk;

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AddonInfo {
    pub file_name: String,
    pub mod_id: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AddonListing {
    pub dir: Option<String>,
    pub addons: Vec<AddonInfo>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ScriptReport {
    pub path: String,
    pub findings: Vec<Finding>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AddonScan {
    pub file_name: String,
    pub label: String,
    pub scripts_scanned: usize,
    pub scripts: Vec<ScriptReport>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AddonFailure {
    pub file_name: String,
    pub error: AddonError,
}

/// Serializes as the app's error code; the UI shows `errors.<code>` from the catalog.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub enum AddonError {
    #[serde(rename = "diagnostics.mod_unreadable")]
    Unreadable,
}

#[derive(Debug, Clone, Default, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AddonScanReport {
    pub listing: Option<AddonListing>,
    pub scans: Vec<AddonScan>,
    pub failures: Vec<AddonFailure>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flow {
    Continue,
    Cancelled,
}

/// Receives the results of `scan_all` as they happen. `checkpoint` may block (to pause the scan)
/// and returns `Flow::Cancelled` to stop it.
pub trait ScanObserver {
    fn listed(&mut self, listing: &AddonListing);
    fn progress(&mut self, done: usize, total: usize, label: Option<&str>);
    fn checkpoint(&mut self) -> Flow;
    fn scanned(&mut self, scan: AddonScan);
    fn failed(&mut self, failure: AddonFailure);
}

pub fn list_addons_from(dir: Option<&Path>) -> AddonListing {
    let Some(dir) = dir else {
        return AddonListing { dir: None, addons: Vec::new() };
    };
    let addons = list_addons_in(dir)
        .into_iter()
        .map(|a| AddonInfo { file_name: a.file_name, mod_id: a.mod_id, enabled: a.enabled })
        .collect();
    AddonListing { dir: Some(dir.to_string_lossy().into_owned()), addons }
}

pub fn scan_addon_in(dir: &Path, file_name: &str) -> Result<AddonScan, AddonError> {
    let Some(path) = resolve_addon(dir, file_name) else {
        log::warn!("addon scan: no addon named {file_name}");
        return Err(AddonError::Unreadable);
    };
    let scan = scan_vpk(&path).map_err(|e| {
        log::warn!("addon scan: could not read {file_name}: {e}");
        AddonError::Unreadable
    })?;
    let mod_id = list_addons_in(dir).into_iter().find(|a| a.file_name == file_name).and_then(|a| a.mod_id);
    Ok(AddonScan {
        file_name: file_name.to_string(),
        label: label(scan.search_path.as_deref(), mod_id.as_deref(), file_name),
        scripts_scanned: scan.scripts_scanned,
        scripts: scan.flagged.into_iter().map(|s| ScriptReport { path: s.path, findings: s.findings }).collect(),
    })
}

/// Scans every addon in `dir`, checkpointing before each addon.
pub fn scan_all(dir: Option<&Path>, observer: &mut impl ScanObserver) -> Flow {
    let listing = list_addons_from(dir);
    let names: Vec<String> = listing.addons.iter().map(|a| a.file_name.clone()).collect();
    observer.listed(&listing);
    let total = names.len();
    observer.progress(0, total, None);
    let Some(dir) = dir else {
        return Flow::Continue;
    };

    for (i, name) in names.iter().enumerate() {
        if observer.checkpoint() == Flow::Cancelled {
            return Flow::Cancelled;
        }
        observer.progress(i, total, Some(name));
        match scan_addon_in(dir, name) {
            Ok(scan) => observer.scanned(scan),
            Err(error) => observer.failed(AddonFailure { file_name: name.clone(), error }),
        }
        observer.progress(i + 1, total, Some(name));
    }
    Flow::Continue
}

#[cfg(test)]
mod tests;
