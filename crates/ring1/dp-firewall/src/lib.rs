use serde::{Deserialize, Serialize};

pub mod validate;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use self::windows::*;

// The nftables backend only uses std, so it compiles and runs its tests on every host.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod nft;
#[cfg_attr(windows, allow(dead_code))]
mod ruleset;

#[cfg(target_os = "linux")]
mod native {
    use std::path::Path;

    use super::ruleset::Ruleset;
    use super::{ExistingBlockRule, FirewallRuleSpec, RefreshReport};

    static RULES: Ruleset<super::nft::Nft> = Ruleset::new(super::nft::Nft);

    pub const SUPPORTED: bool = true;

    /// Where the set of blocked groups is remembered.
    pub fn init(dir: &Path) {
        RULES.init(dir);
    }

    pub fn block_groups(specs: &[FirewallRuleSpec]) -> Result<(), String> {
        RULES.block_groups(specs)
    }

    pub fn unblock_groups(group_ids: &[String]) -> Result<(), String> {
        RULES.unblock_groups(group_ids)
    }

    pub fn list_blocked(group_ids: &[String]) -> Result<Vec<String>, String> {
        RULES.list_blocked(group_ids)
    }

    pub fn refresh_stale_groups(specs: &[FirewallRuleSpec], prompt: bool) -> Result<RefreshReport, String> {
        RULES.refresh_stale_groups(specs, prompt)
    }

    /// Rules made by other tools are Windows Firewall entries; there is nothing comparable to import.
    pub fn read_block_rules(_names: &[String]) -> Result<Vec<ExistingBlockRule>, String> {
        Ok(Vec::new())
    }

    pub fn remove_rules_by_name(_names: &[String]) -> Result<(), String> {
        Ok(())
    }
}
#[cfg(target_os = "linux")]
pub use native::*;

// Compiled everywhere so its tests run on every host; only used where there is no backend.
#[cfg_attr(any(windows, target_os = "linux"), allow(dead_code))]
mod unsupported;
#[cfg(not(any(windows, target_os = "linux")))]
pub use unsupported::*;

#[cfg(windows)]
pub const SUPPORTED: bool = true;

#[cfg(windows)]
pub fn init(_dir: &std::path::Path) {}

#[derive(Clone, Serialize, Deserialize)]
pub struct FirewallRuleSpec {
    pub group_id: String,
    pub description: String,
    pub relay_ips: Vec<String>,
}

pub struct ExistingBlockRule {
    pub name: String,
    pub remote_ips: Vec<String>,
}

#[derive(Debug, Default)]
pub struct RefreshReport {
    pub updated: Vec<String>,
    pub failed: Vec<String>,
}
