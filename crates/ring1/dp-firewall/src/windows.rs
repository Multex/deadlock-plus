use std::collections::HashSet;
use std::sync::Mutex;

use windows::core::BSTR;
use windows::Win32::Foundation::VARIANT_TRUE;
use windows::Win32::NetworkManagement::WindowsFirewall::{
    INetFwPolicy2, INetFwRule, INetFwRules, NetFwPolicy2, NetFwRule, NET_FW_ACTION_BLOCK, NET_FW_RULE_DIR_OUT,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};

use super::{ExistingBlockRule, FirewallRuleSpec, RefreshReport};
use dp_sync::LockExt;

const RULE_NAME_PREFIX: &str = "deadlock_plus_";
const PROFILES_ALL: i32 = i32::MAX;
const PROTOCOL_TCP: i32 = 6;
const PROTOCOL_UDP: i32 = 17;

/// Holds a COM apartment on the creating thread. Every public function in this module creates one before it
/// calls `open_rules` and keeps it alive until it returns, which is what makes the unsafe COM calls below valid.
/// A guard must not cross threads: `CoUninitialize` has to run on the thread that initialised.
struct ComGuard {
    initialized: bool,
}

impl ComGuard {
    fn new() -> Self {
        // SAFETY: no reserved pointer is passed. Failure is recorded, so `Drop` only balances a successful call.
        let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        Self { initialized: hr.is_ok() }
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.initialized {
            // SAFETY: pairs the successful `CoInitializeEx` in `new`, on the same thread because the guard is a
            // stack local that is never moved to another thread.
            unsafe { CoUninitialize() };
        }
    }
}

/// Blocking TCP and UDP separately (instead of protocol Any) leaves ICMP open, so
/// ping still works against a blocked region.
fn block_rules(group_id: &str) -> Vec<(String, i32)> {
    vec![
        (format!("{RULE_NAME_PREFIX}{group_id}_tcp"), PROTOCOL_TCP),
        (format!("{RULE_NAME_PREFIX}{group_id}_udp"), PROTOCOL_UDP),
    ]
}

/// Earlier builds created one protocol-Any rule per group; it must still be
/// recognised and cleaned up so it doesn't silently block ICMP forever.
fn owned_rule_names(group_id: &str) -> Vec<String> {
    let mut names: Vec<String> = block_rules(group_id).into_iter().map(|(n, _)| n).collect();
    names.push(legacy_rule_name(group_id));
    names
}

fn legacy_rule_name(group_id: &str) -> String {
    format!("{RULE_NAME_PREFIX}{group_id}")
}

fn open_rules() -> windows::core::Result<INetFwRules> {
    // SAFETY: the caller holds a `ComGuard` (see its contract), so creating the `NetFwPolicy2` object is valid.
    let result = unsafe {
        let policy: INetFwPolicy2 = CoCreateInstance(&NetFwPolicy2, None, CLSCTX_ALL)?;
        policy.Rules()
    };
    if let Err(e) = &result {
        log::error!("could not open the Windows Firewall rules: {e}");
    }
    result
}

fn remove_rule_if_present(rules: &INetFwRules, name: &BSTR) {
    // SAFETY: `rules` and `name` are live for the call and the caller holds a `ComGuard` on this thread.
    unsafe {
        // Item() errors when the rule doesn't exist; that's an expected, not exceptional, outcome here.
        while rules.Item(name).is_ok() {
            if let Err(e) = rules.Remove(name) {
                log::warn!("could not remove firewall rule {name}: {e}");
                break;
            }
        }
    }
}

/// Serialises every rule write so a background refresh can never re-create a rule the
/// user just removed, or overwrite one mid-edit.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

fn add_block_rule(rules: &INetFwRules, name: &str, protocol: i32, spec: &FirewallRuleSpec) -> Result<(), String> {
    // SAFETY: the caller holds a `ComGuard` on this thread. `rule` is a fresh object that only this function can
    // reach until `rules.Add` copies it into the collection, and the string arguments are temporaries that live
    // through each call.
    unsafe {
        let rule: INetFwRule = CoCreateInstance(&NetFwRule, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
        rule.SetName(&BSTR::from(name)).map_err(|e| e.to_string())?;
        rule.SetDescription(&BSTR::from(spec.description.as_str())).map_err(|e| e.to_string())?;
        rule.SetDirection(NET_FW_RULE_DIR_OUT).map_err(|e| e.to_string())?;
        rule.SetAction(NET_FW_ACTION_BLOCK).map_err(|e| e.to_string())?;
        rule.SetProtocol(protocol).map_err(|e| e.to_string())?;
        rule.SetRemoteAddresses(&BSTR::from(spec.relay_ips.join(",").as_str())).map_err(|e| e.to_string())?;
        rule.SetProfiles(PROFILES_ALL).map_err(|e| e.to_string())?;
        rule.SetEnabled(VARIANT_TRUE).map_err(|e| e.to_string())?;
        rules.Add(&rule).map_err(|e| e.to_string())
    }
}

pub fn block_groups(specs: &[FirewallRuleSpec]) -> Result<(), String> {
    let _write = WRITE_LOCK.lock_or_recover();
    let _com = ComGuard::new();
    let rules = open_rules().map_err(|e| e.to_string())?;

    for spec in specs {
        for name in owned_rule_names(&spec.group_id) {
            remove_rule_if_present(&rules, &BSTR::from(name));
        }
        for (name, protocol) in block_rules(&spec.group_id) {
            add_block_rule(&rules, &name, protocol, spec)?;
        }
    }

    Ok(())
}

pub fn unblock_groups(group_ids: &[String]) -> Result<(), String> {
    let _write = WRITE_LOCK.lock_or_recover();
    let _com = ComGuard::new();
    let rules = open_rules().map_err(|e| e.to_string())?;

    for group_id in group_ids {
        for name in owned_rule_names(group_id) {
            remove_rule_if_present(&rules, &BSTR::from(name));
        }
    }

    Ok(())
}

/// Returns the subset of `group_ids` that currently have an active block rule.
/// Used to reconcile UI state with the real firewall on startup (e.g. if the
/// app's settings file was deleted but rules from a previous run still exist).
pub fn list_blocked(group_ids: &[String]) -> Result<Vec<String>, String> {
    let _com = ComGuard::new();
    let rules = open_rules().map_err(|e| e.to_string())?;

    let blocked = group_ids
        .iter()
        // SAFETY: `ComGuard` above is still in scope; `rules` and the temporary `BSTR` outlive each call.
        .filter(|id| owned_rule_names(id).iter().any(|n| unsafe { rules.Item(&BSTR::from(n.as_str())).is_ok() }))
        .cloned()
        .collect();

    Ok(blocked)
}

/// Looks up enabled outbound block rules by exact name and returns their remote IPs.
/// Used to detect rules created by other tools; missing rules are skipped.
pub fn read_block_rules(names: &[String]) -> Result<Vec<ExistingBlockRule>, String> {
    let _com = ComGuard::new();
    let rules = open_rules().map_err(|e| e.to_string())?;
    let mut found = Vec::new();

    for name in names {
        // SAFETY: every `unsafe` in this loop is a COM call on interfaces owned by this function, made while its
        // `ComGuard` is in scope.
        let Ok(rule) = (unsafe { rules.Item(&BSTR::from(name.as_str())) }) else {
            continue;
        };
        let is_block = unsafe { rule.Action().map(|a| a == NET_FW_ACTION_BLOCK).unwrap_or(false) };
        let enabled = unsafe { rule.Enabled().map(|e| e.as_bool()).unwrap_or(false) };
        if !is_block || !enabled {
            continue;
        }

        let Ok(addresses) = (unsafe { rule.RemoteAddresses() }) else {
            continue;
        };

        found
            .push(ExistingBlockRule { name: name.clone(), remote_ips: parse_remote_addresses(&addresses.to_string()) });
    }

    Ok(found)
}

fn parse_remote_addresses(addresses: &str) -> Vec<String> {
    addresses
        .split(',')
        .map(|a| a.split('/').next().unwrap_or("").trim().to_string())
        .filter(|a| !a.is_empty())
        .collect()
}

fn rule_ips_match(existing: &[String], wanted: &[String]) -> bool {
    let existing: HashSet<&String> = existing.iter().collect();
    let wanted: HashSet<&String> = wanted.iter().collect();
    existing == wanted
}

#[derive(Debug, PartialEq, Eq)]
enum RuleAction {
    Keep,
    Update,
    Create,
}

struct RuleSnapshot {
    ips: Vec<String>,
    enabled: bool,
}

fn rule_action(existing: Option<&RuleSnapshot>, wanted: &[String]) -> RuleAction {
    match existing {
        None => RuleAction::Create,
        Some(rule) if rule.enabled && rule_ips_match(&rule.ips, wanted) => RuleAction::Keep,
        Some(_) => RuleAction::Update,
    }
}

/// A rule whose properties can't be read counts as disabled with no IPs, so it gets rewritten.
fn snapshot_rule(rule: &INetFwRule) -> RuleSnapshot {
    // SAFETY: `rule` is a live interface borrowed from a caller that holds a `ComGuard` on this thread.
    let enabled = unsafe { rule.Enabled().map(|e| e.as_bool()).unwrap_or(false) };
    let ips = unsafe { rule.RemoteAddresses() }.map(|a| parse_remote_addresses(&a.to_string())).unwrap_or_default();
    RuleSnapshot { ips, enabled }
}

/// Brings every group we already block back in line with `specs` (Valve changed its relay
/// IPs, a rule was disabled, or one protocol's rule is missing). Existing rules are edited
/// in place, so a block is never lifted while it is being corrected. Groups with no rule
/// of ours are left alone: this never turns on a block the user didn't ask for.
///
/// `prompt` is ignored: these COM calls run with the app's own rights and never ask for one.
pub fn refresh_stale_groups(specs: &[FirewallRuleSpec], _prompt: bool) -> Result<RefreshReport, String> {
    let _write = WRITE_LOCK.lock_or_recover();
    let _com = ComGuard::new();
    let rules = open_rules().map_err(|e| e.to_string())?;
    let mut report = RefreshReport::default();

    for spec in specs {
        // SAFETY: `ComGuard` above is still in scope; `rules` and the temporary `BSTR` outlive each call.
        let is_blocked =
            owned_rule_names(&spec.group_id).iter().any(|n| unsafe { rules.Item(&BSTR::from(n.as_str())).is_ok() });
        if !is_blocked {
            continue;
        }
        match refresh_group(&rules, spec) {
            Ok(true) => report.updated.push(spec.group_id.clone()),
            Ok(false) => {}
            Err(e) => {
                log::warn!("could not refresh the block for {}: {e}", spec.group_id);
                report.failed.push(spec.group_id.clone());
            }
        }
    }

    Ok(report)
}

fn group_is_stale(rules: &[Option<RuleSnapshot>], legacy_present: bool, wanted: &[String]) -> bool {
    legacy_present || rules.iter().any(|rule| rule_action(rule.as_ref(), wanted) != RuleAction::Keep)
}

/// Groups we already block whose rules would change on a refresh. Read-only.
pub fn stale_groups(specs: &[FirewallRuleSpec]) -> Result<Vec<String>, String> {
    let _com = ComGuard::new();
    let rules = open_rules().map_err(|e| e.to_string())?;
    let mut stale = Vec::new();

    for spec in specs {
        // SAFETY: `ComGuard` above is still in scope; `rules` and the temporary `BSTR` outlive each call.
        let lookup = |name: &str| unsafe { rules.Item(&BSTR::from(name)) }.ok();
        let is_blocked = owned_rule_names(&spec.group_id).iter().any(|n| lookup(n).is_some());
        if !is_blocked {
            continue;
        }
        let snapshots: Vec<Option<RuleSnapshot>> =
            block_rules(&spec.group_id).iter().map(|(name, _)| lookup(name).map(|r| snapshot_rule(&r))).collect();
        let legacy_present = lookup(&legacy_rule_name(&spec.group_id)).is_some();
        if group_is_stale(&snapshots, legacy_present, &spec.relay_ips) {
            stale.push(spec.group_id.clone());
        }
    }

    Ok(stale)
}

fn refresh_group(rules: &INetFwRules, spec: &FirewallRuleSpec) -> Result<bool, String> {
    let mut changed = false;

    for (name, protocol) in block_rules(&spec.group_id) {
        // SAFETY: the caller holds a `ComGuard` on this thread; `rules` and the `BSTR` outlive the call.
        let existing = unsafe { rules.Item(&BSTR::from(name.as_str())) }.ok();
        let snapshot = existing.as_ref().map(snapshot_rule);
        match rule_action(snapshot.as_ref(), &spec.relay_ips) {
            RuleAction::Keep => {}
            RuleAction::Update => {
                let rule = existing.as_ref().expect("an Update action implies the rule exists");
                // SAFETY: `rule` is a live interface, so the setters are valid under the caller's `ComGuard`.
                unsafe {
                    rule.SetRemoteAddresses(&BSTR::from(spec.relay_ips.join(",").as_str()))
                        .map_err(|e| e.to_string())?;
                    rule.SetEnabled(VARIANT_TRUE).map_err(|e| e.to_string())?;
                }
                changed = true;
            }
            RuleAction::Create => {
                add_block_rule(rules, &name, protocol, spec)?;
                changed = true;
            }
        }
    }

    let legacy = BSTR::from(legacy_rule_name(&spec.group_id));
    // SAFETY: same contract as the lookups above; `legacy` lives through the call.
    if unsafe { rules.Item(&legacy).is_ok() } {
        remove_rule_if_present(rules, &legacy);
        changed = true;
    }

    Ok(changed)
}

pub fn remove_rules_by_name(names: &[String]) -> Result<(), String> {
    let _write = WRITE_LOCK.lock_or_recover();
    let _com = ComGuard::new();
    let rules = open_rules().map_err(|e| e.to_string())?;
    for name in names {
        remove_rule_if_present(&rules, &BSTR::from(name.as_str()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn block_rules_split_tcp_and_udp() {
        let rules = block_rules("fra");
        assert_eq!(
            rules,
            vec![
                ("deadlock_plus_fra_tcp".to_string(), PROTOCOL_TCP),
                ("deadlock_plus_fra_udp".to_string(), PROTOCOL_UDP)
            ]
        );
    }

    fn ips(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn rule_ips_match_ignores_order_and_duplicates() {
        assert!(rule_ips_match(&ips(&["2.2.2.2", "1.1.1.1", "1.1.1.1"]), &ips(&["1.1.1.1", "2.2.2.2"])));
    }

    #[test]
    fn rule_ips_match_detects_a_swapped_relay() {
        assert!(!rule_ips_match(&ips(&["1.1.1.1", "2.2.2.2"]), &ips(&["1.1.1.1", "9.9.9.9"])));
    }

    #[test]
    fn rule_ips_match_detects_added_and_dropped_relays() {
        assert!(!rule_ips_match(&ips(&["1.1.1.1"]), &ips(&["1.1.1.1", "2.2.2.2"])));
        assert!(!rule_ips_match(&ips(&["1.1.1.1", "2.2.2.2"]), &ips(&["1.1.1.1"])));
    }

    fn snapshot(list: &[&str], enabled: bool) -> RuleSnapshot {
        RuleSnapshot { ips: ips(list), enabled }
    }

    #[test]
    fn rule_action_keeps_a_rule_that_already_matches() {
        let rule = snapshot(&["1.1.1.1", "2.2.2.2"], true);
        assert_eq!(rule_action(Some(&rule), &ips(&["2.2.2.2", "1.1.1.1"])), RuleAction::Keep);
    }

    #[test]
    fn rule_action_updates_a_rule_with_old_ips_in_place() {
        let rule = snapshot(&["1.1.1.1"], true);
        assert_eq!(rule_action(Some(&rule), &ips(&["9.9.9.9"])), RuleAction::Update);
    }

    #[test]
    fn rule_action_updates_a_rule_someone_disabled() {
        let rule = snapshot(&["1.1.1.1"], false);
        assert_eq!(rule_action(Some(&rule), &ips(&["1.1.1.1"])), RuleAction::Update);
    }

    #[test]
    fn rule_action_creates_a_missing_rule() {
        assert_eq!(rule_action(None, &ips(&["1.1.1.1"])), RuleAction::Create);
    }

    #[test]
    fn parse_remote_addresses_strips_masks() {
        assert_eq!(parse_remote_addresses("1.1.1.1/255.255.255.255, 2.2.2.2"), ips(&["1.1.1.1", "2.2.2.2"]));
    }

    #[test]
    fn owned_rule_names_include_the_single_any_rule_from_older_builds() {
        let names = owned_rule_names("fra");
        assert!(names.contains(&"deadlock_plus_fra".to_string()));
        assert!(names.contains(&"deadlock_plus_fra_tcp".to_string()));
        assert!(names.contains(&"deadlock_plus_fra_udp".to_string()));
    }

    fn snap(ips: &[&str], enabled: bool) -> Option<RuleSnapshot> {
        Some(RuleSnapshot { ips: ips.iter().map(|s| s.to_string()).collect(), enabled })
    }

    #[test]
    fn group_is_current_when_every_rule_matches() {
        let rules = [snap(&["1.1.1.1", "2.2.2.2"], true), snap(&["2.2.2.2", "1.1.1.1"], true)];
        assert!(!group_is_stale(&rules, false, &ips(&["1.1.1.1", "2.2.2.2"])));
    }

    #[test]
    fn group_is_stale_when_a_relay_changed() {
        let rules = [snap(&["1.1.1.1"], true), snap(&["1.1.1.1"], true)];
        assert!(group_is_stale(&rules, false, &ips(&["1.1.1.1", "3.3.3.3"])));
    }

    #[test]
    fn group_is_stale_when_a_rule_is_disabled_or_missing() {
        let wanted = ips(&["1.1.1.1"]);
        assert!(group_is_stale(&[snap(&["1.1.1.1"], false), snap(&["1.1.1.1"], true)], false, &wanted));
        assert!(group_is_stale(&[snap(&["1.1.1.1"], true), None], false, &wanted));
    }

    #[test]
    fn group_is_stale_when_the_legacy_rule_is_left_over() {
        let rules = [snap(&["1.1.1.1"], true), snap(&["1.1.1.1"], true)];
        assert!(group_is_stale(&rules, true, &ips(&["1.1.1.1"])));
    }

    #[test]
    fn stale_groups_of_an_unblocked_group_is_empty() {
        let spec = FirewallRuleSpec {
            group_id: "dp-test-stale-groups-no-rules".into(),
            description: String::new(),
            relay_ips: ips(&["1.1.1.1"]),
        };
        assert_eq!(stale_groups(&[spec]).unwrap(), Vec::<String>::new());
    }
}
