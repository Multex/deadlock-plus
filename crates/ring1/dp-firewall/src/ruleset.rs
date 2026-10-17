use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

use super::{FirewallRuleSpec, RefreshReport};
use dp_sync::LockExt;

const STATE_FILE: &str = "firewall-blocks.json";

pub trait Backend {
    /// The full ruleset for `groups`; an empty slice must produce a script that removes every rule.
    fn render(&self, groups: &[FirewallRuleSpec]) -> String;
    /// Runs `script` with the rights it needs, replacing what was applied before.
    fn apply(&self, script: &str) -> Result<(), String>;
    /// Changes on every boot.
    fn boot_id(&self) -> Option<String>;
    /// True when `apply` would ask the user for a password.
    fn needs_prompt(&self) -> bool;
}

#[derive(Default, Serialize, Deserialize)]
struct State {
    boot_id: Option<String>,
    groups: Vec<FirewallRuleSpec>,
}

fn same_ips(a: &[String], b: &[String]) -> bool {
    a.iter().collect::<HashSet<_>>() == b.iter().collect::<HashSet<_>>()
}

fn upsert(groups: &mut Vec<FirewallRuleSpec>, specs: &[FirewallRuleSpec]) {
    for spec in specs {
        match groups.iter_mut().find(|g| g.group_id == spec.group_id) {
            Some(existing) => *existing = spec.clone(),
            None => groups.push(spec.clone()),
        }
    }
}

/// Brings groups we already block in line with `specs`; never adds a group.
fn refresh(groups: &mut [FirewallRuleSpec], specs: &[FirewallRuleSpec]) -> Vec<String> {
    let mut updated = Vec::new();
    for group in groups.iter_mut() {
        if let Some(spec) = specs.iter().find(|s| s.group_id == group.group_id) {
            if !same_ips(&group.relay_ips, &spec.relay_ips) {
                *group = spec.clone();
                updated.push(group.group_id.clone());
            }
        }
    }
    updated
}

pub struct Ruleset<B> {
    backend: B,
    dir: OnceLock<PathBuf>,
    write: Mutex<()>,
}

impl<B: Backend> Ruleset<B> {
    pub const fn new(backend: B) -> Self {
        Self { backend, dir: OnceLock::new(), write: Mutex::new(()) }
    }

    pub fn init(&self, dir: &Path) {
        let _ = self.dir.set(dir.to_path_buf());
    }

    fn path(&self) -> Result<PathBuf, String> {
        self.dir.get().map(|d| d.join(STATE_FILE)).ok_or_else(|| "the firewall state folder is not set".to_string())
    }

    fn load(&self) -> Result<Vec<FirewallRuleSpec>, String> {
        let Ok(bytes) = std::fs::read(self.path()?) else {
            return Ok(Vec::new());
        };
        let Ok(state) = serde_json::from_slice::<State>(&bytes) else {
            log::warn!("firewall state file is unreadable, treating nothing as blocked");
            return Ok(Vec::new());
        };
        let boot = self.backend.boot_id();
        if boot.is_some() && state.boot_id.is_some() && boot != state.boot_id {
            return Ok(Vec::new());
        }
        Ok(state.groups)
    }

    fn commit(&self, groups: Vec<FirewallRuleSpec>) -> Result<(), String> {
        let path = self.path()?;
        self.backend.apply(&self.backend.render(&groups))?;
        let state = State { boot_id: self.backend.boot_id(), groups };
        let bytes = serde_json::to_vec_pretty(&state).map_err(|e| e.to_string())?;
        dp_atomic::write_atomic(&path, &bytes).map_err(|e| {
            format!("the rules were applied but could not be recorded, so they may show as unblocked: {e}")
        })
    }

    pub fn block_groups(&self, specs: &[FirewallRuleSpec]) -> Result<(), String> {
        let _write = self.write.lock_or_recover();
        let mut groups = self.load()?;
        upsert(&mut groups, specs);
        self.commit(groups)
    }

    pub fn unblock_groups(&self, group_ids: &[String]) -> Result<(), String> {
        let _write = self.write.lock_or_recover();
        let mut groups = self.load()?;
        groups.retain(|g| !group_ids.contains(&g.group_id));
        self.commit(groups)
    }

    pub fn list_blocked(&self, group_ids: &[String]) -> Result<Vec<String>, String> {
        let blocked: HashSet<String> = self.load()?.into_iter().map(|g| g.group_id).collect();
        Ok(group_ids.iter().filter(|id| blocked.contains(*id)).cloned().collect())
    }

    /// With `prompt` false, a refresh that would ask for a password applies nothing and reports
    /// the changed groups as failed instead.
    pub fn refresh_stale_groups(&self, specs: &[FirewallRuleSpec], prompt: bool) -> Result<RefreshReport, String> {
        let _write = self.write.lock_or_recover();
        let mut groups = self.load()?;
        let updated = refresh(&mut groups, specs);
        if updated.is_empty() {
            return Ok(RefreshReport::default());
        }
        if !prompt && self.backend.needs_prompt() {
            return Ok(RefreshReport { updated: Vec::new(), failed: updated });
        }
        match self.commit(groups) {
            Ok(()) => Ok(RefreshReport { updated, failed: Vec::new() }),
            Err(e) => {
                log::warn!("could not refresh the server blocks: {e}");
                Ok(RefreshReport { updated: Vec::new(), failed: updated })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fake {
        applied: Mutex<Vec<String>>,
        fail: Mutex<bool>,
        boot: Mutex<Option<String>>,
        prompts: Mutex<bool>,
    }

    impl Fake {
        fn new() -> Self {
            Self {
                applied: Mutex::default(),
                fail: Mutex::new(false),
                boot: Mutex::new(Some("boot-1".into())),
                prompts: Mutex::new(false),
            }
        }
    }

    impl Backend for &Fake {
        fn render(&self, groups: &[FirewallRuleSpec]) -> String {
            groups.iter().map(|g| g.group_id.as_str()).collect::<Vec<_>>().join(",")
        }
        fn apply(&self, script: &str) -> Result<(), String> {
            if *self.fail.lock().unwrap() {
                return Err("denied".into());
            }
            self.applied.lock().unwrap().push(script.to_string());
            Ok(())
        }
        fn boot_id(&self) -> Option<String> {
            self.boot.lock().unwrap().clone()
        }
        fn needs_prompt(&self) -> bool {
            *self.prompts.lock().unwrap()
        }
    }

    fn spec(id: &str, ips: &[&str]) -> FirewallRuleSpec {
        FirewallRuleSpec {
            group_id: id.into(),
            description: id.into(),
            relay_ips: ips.iter().map(|s| s.to_string()).collect(),
        }
    }

    fn ids(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    fn ruleset<'a>(fake: &'a Fake, name: &str) -> Ruleset<&'a Fake> {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-ruleset-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let rs = Ruleset::new(fake);
        rs.init(&dir);
        rs
    }

    #[test]
    fn blocking_applies_the_whole_set_and_lists_it() {
        let fake = Fake::new();
        let rs = ruleset(&fake, "block");
        rs.block_groups(&[spec("fra", &["1.1.1.1"])]).unwrap();
        rs.block_groups(&[spec("sto", &["2.2.2.2"])]).unwrap();
        assert_eq!(*fake.applied.lock().unwrap(), ["fra", "fra,sto"]);
        assert_eq!(rs.list_blocked(&ids(&["sto", "par", "fra"])).unwrap(), ids(&["sto", "fra"]));
    }

    #[test]
    fn blocking_a_group_again_replaces_it_instead_of_duplicating() {
        let fake = Fake::new();
        let rs = ruleset(&fake, "replace");
        rs.block_groups(&[spec("fra", &["1.1.1.1"])]).unwrap();
        rs.block_groups(&[spec("fra", &["9.9.9.9"])]).unwrap();
        assert_eq!(fake.applied.lock().unwrap().last().unwrap(), "fra");
        assert_eq!(rs.list_blocked(&ids(&["fra"])).unwrap(), ids(&["fra"]));
    }

    #[test]
    fn unblocking_the_last_group_applies_an_empty_set() {
        let fake = Fake::new();
        let rs = ruleset(&fake, "unblock");
        rs.block_groups(&[spec("fra", &["1.1.1.1"])]).unwrap();
        rs.unblock_groups(&ids(&["fra"])).unwrap();
        assert_eq!(fake.applied.lock().unwrap().last().unwrap(), "");
        assert!(rs.list_blocked(&ids(&["fra"])).unwrap().is_empty());
    }

    #[test]
    fn a_failed_apply_records_nothing() {
        let fake = Fake::new();
        let rs = ruleset(&fake, "fail");
        *fake.fail.lock().unwrap() = true;
        assert_eq!(rs.block_groups(&[spec("fra", &["1.1.1.1"])]).unwrap_err(), "denied");
        assert!(rs.list_blocked(&ids(&["fra"])).unwrap().is_empty());
    }

    #[test]
    fn a_new_boot_forgets_the_old_blocks() {
        let fake = Fake::new();
        let rs = ruleset(&fake, "boot");
        rs.block_groups(&[spec("fra", &["1.1.1.1"])]).unwrap();
        *fake.boot.lock().unwrap() = Some("boot-2".into());
        assert!(rs.list_blocked(&ids(&["fra"])).unwrap().is_empty());
    }

    #[test]
    fn refresh_updates_moved_relays_and_leaves_unblocked_groups_alone() {
        let fake = Fake::new();
        let rs = ruleset(&fake, "refresh");
        rs.block_groups(&[spec("fra", &["1.1.1.1"])]).unwrap();
        let report =
            rs.refresh_stale_groups(&[spec("fra", &["1.1.1.1", "3.3.3.3"]), spec("sto", &["2.2.2.2"])], true).unwrap();
        assert_eq!(report.updated, ids(&["fra"]));
        assert_eq!(fake.applied.lock().unwrap().last().unwrap(), "fra");
        assert!(rs.list_blocked(&ids(&["sto"])).unwrap().is_empty());
    }

    #[test]
    fn refresh_does_nothing_when_the_relays_match_in_any_order() {
        let fake = Fake::new();
        let rs = ruleset(&fake, "noop");
        rs.block_groups(&[spec("fra", &["1.1.1.1", "2.2.2.2"])]).unwrap();
        let report = rs.refresh_stale_groups(&[spec("fra", &["2.2.2.2", "1.1.1.1"])], true).unwrap();
        assert!(report.updated.is_empty());
        assert_eq!(fake.applied.lock().unwrap().len(), 1);
    }

    #[test]
    fn a_failed_refresh_is_reported_not_raised() {
        let fake = Fake::new();
        let rs = ruleset(&fake, "refresh-fail");
        rs.block_groups(&[spec("fra", &["1.1.1.1"])]).unwrap();
        *fake.fail.lock().unwrap() = true;
        let report = rs.refresh_stale_groups(&[spec("fra", &["9.9.9.9"])], true).unwrap();
        assert_eq!(report.failed, ids(&["fra"]));
    }

    #[test]
    fn an_unattended_refresh_that_would_prompt_applies_nothing_and_reports_stale() {
        let fake = Fake::new();
        let rs = ruleset(&fake, "unattended-prompt");
        rs.block_groups(&[spec("fra", &["1.1.1.1"])]).unwrap();
        *fake.prompts.lock().unwrap() = true;
        let report = rs.refresh_stale_groups(&[spec("fra", &["9.9.9.9"])], false).unwrap();
        assert!(report.updated.is_empty());
        assert_eq!(report.failed, ids(&["fra"]));
        assert_eq!(fake.applied.lock().unwrap().len(), 1, "only the block itself was applied");

        let report = rs.refresh_stale_groups(&[spec("fra", &["9.9.9.9"])], true).unwrap();
        assert_eq!(report.updated, ids(&["fra"]), "the stale block was not recorded as fixed");
    }

    #[test]
    fn an_unattended_refresh_applies_when_no_prompt_is_needed() {
        let fake = Fake::new();
        let rs = ruleset(&fake, "unattended-root");
        rs.block_groups(&[spec("fra", &["1.1.1.1"])]).unwrap();
        let report = rs.refresh_stale_groups(&[spec("fra", &["9.9.9.9"])], false).unwrap();
        assert_eq!(report.updated, ids(&["fra"]));
        assert_eq!(fake.applied.lock().unwrap().len(), 2);
    }

    #[test]
    fn a_refresh_the_user_asked_for_may_prompt() {
        let fake = Fake::new();
        let rs = ruleset(&fake, "user-prompt");
        rs.block_groups(&[spec("fra", &["1.1.1.1"])]).unwrap();
        *fake.prompts.lock().unwrap() = true;
        let report = rs.refresh_stale_groups(&[spec("fra", &["9.9.9.9"])], true).unwrap();
        assert_eq!(report.updated, ids(&["fra"]));
        assert_eq!(fake.applied.lock().unwrap().len(), 2);
    }

    #[test]
    fn an_unattended_refresh_with_nothing_stale_reports_nothing() {
        let fake = Fake::new();
        let rs = ruleset(&fake, "unattended-noop");
        rs.block_groups(&[spec("fra", &["1.1.1.1"])]).unwrap();
        *fake.prompts.lock().unwrap() = true;
        let report = rs.refresh_stale_groups(&[spec("fra", &["1.1.1.1"])], false).unwrap();
        assert!(report.updated.is_empty() && report.failed.is_empty());
    }
}
