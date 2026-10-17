use std::collections::HashSet;

use crate::definitions::GameDefinition;
use crate::sdr::{ServerData, ServerGroup};
use dp_firewall::{self as firewall, ExistingBlockRule, FirewallRuleSpec};

/// Rule-name prefixes of other tools, each followed by the region description with
/// spaces removed. Matching is done by blocked IPs, so it works regardless of how
/// the other tool clustered regions.
const SOURCES: &[(&str, &str)] = &[("server_picker_x_", "ServerPickerX"), ("CS2ServerPicker_", "CS2ServerPicker")];

pub struct ScanResult {
    pub rules: Vec<ExistingBlockRule>,
    pub sources: Vec<String>,
    pub covered_group_ids: Vec<String>,
    covered_ips: HashSet<String>,
}

fn candidate_rule_names(descriptions: &[String]) -> Vec<String> {
    let mut names: Vec<String> = SOURCES
        .iter()
        .flat_map(|(prefix, _)| descriptions.iter().map(move |d| format!("{prefix}{}", d.replace(' ', ""))))
        .collect();
    names.sort();
    names.dedup();
    names
}

/// Whether a firewall rule name belongs to one of the known other tools.
pub fn is_external_rule_name(name: &str) -> bool {
    source_label(name).is_some()
}

fn source_label(rule_name: &str) -> Option<&'static str> {
    SOURCES.iter().find(|(prefix, _)| rule_name.starts_with(prefix)).map(|(_, label)| *label)
}

fn covered_groups<'a>(groups: &'a [ServerGroup], blocked_ips: &HashSet<String>) -> Vec<&'a ServerGroup> {
    groups.iter().filter(|g| g.relay_ips.iter().all(|ip| blocked_ips.contains(ip))).collect()
}

pub fn scan(data: &ServerData, def: &GameDefinition) -> Result<ScanResult, String> {
    let mut descriptions: Vec<String> = data.unclustered.iter().map(|g| g.description.clone()).collect();
    descriptions.extend(def.server_picker_x_clusters.iter().cloned());

    let rules = firewall::read_block_rules(&candidate_rule_names(&descriptions))?;
    let blocked_ips: HashSet<String> = rules.iter().flat_map(|r| r.remote_ips.iter().cloned()).collect();

    let covered = covered_groups(&data.clustered, &blocked_ips);
    let covered_ips = covered.iter().flat_map(|g| g.relay_ips.iter().cloned()).collect();
    let covered_group_ids = covered.iter().map(|g| g.id.clone()).collect();

    let mut sources: Vec<String> = rules.iter().filter_map(|r| source_label(&r.name)).map(String::from).collect();
    sources.sort();
    sources.dedup();

    Ok(ScanResult { rules, sources, covered_group_ids, covered_ips })
}

pub struct ImportPlan {
    pub specs: Vec<FirewallRuleSpec>,
    pub removable: Vec<String>,
    pub group_ids: Vec<String>,
}

/// The blocks to recreate as our own rules and the external rules that are entirely
/// accounted for by them, so nothing they blocked gets silently lifted.
pub fn import_plan(data: &ServerData, scan: &ScanResult) -> ImportPlan {
    let specs = data
        .clustered
        .iter()
        .filter(|g| scan.covered_group_ids.contains(&g.id))
        .map(|g| FirewallRuleSpec {
            group_id: g.id.clone(),
            description: g.description.clone(),
            relay_ips: g.relay_ips.clone(),
        })
        .collect();

    let removable = scan
        .rules
        .iter()
        .filter(|r| r.remote_ips.iter().all(|ip| scan.covered_ips.contains(ip)))
        .map(|r| r.name.clone())
        .collect();

    ImportPlan { specs, removable, group_ids: scan.covered_group_ids.clone() }
}

/// Recreates the covered blocks as our own rules, then removes only the external rules
/// the plan marks as fully accounted for.
pub fn import(data: &ServerData, scan: &ScanResult) -> Result<Vec<String>, String> {
    let plan = import_plan(data, scan);
    firewall::block_groups(&plan.specs)?;
    firewall::remove_rules_by_name(&plan.removable)?;
    Ok(plan.group_ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_rule_names_match_known_prefixes_only() {
        assert!(is_external_rule_name("server_picker_x_Frankfurt"));
        assert!(is_external_rule_name("CS2ServerPicker_Frankfurt"));
        for bad in [
            "",
            "deadlock_plus_fra_tcp",
            "Server_Picker_X_a",
            "xserver_picker_x_a",
            "CS2ServerPicker",
            "Core Networking",
        ] {
            assert!(!is_external_rule_name(bad), "{bad:?}");
        }
    }

    fn group(id: &str, desc: &str, ips: &[&str]) -> ServerGroup {
        ServerGroup {
            id: id.into(),
            description: desc.into(),
            is_cluster: false,
            country_code: None,
            relay_ips: ips.iter().map(|s| s.to_string()).collect(),
            member_ids: Vec::new(),
            routing_note: None,
        }
    }

    #[test]
    fn candidate_names_cover_every_source_and_strip_spaces() {
        let names = candidate_rule_names(&["Hong Kong".to_string()]);
        assert!(names.contains(&"server_picker_x_HongKong".to_string()));
        assert!(names.contains(&"CS2ServerPicker_HongKong".to_string()));
    }

    #[test]
    fn source_label_matches_rule_prefix() {
        assert_eq!(source_label("CS2ServerPicker_Frankfurt"), Some("CS2ServerPicker"));
        assert_eq!(source_label("server_picker_x_Frankfurt"), Some("ServerPickerX"));
        assert_eq!(source_label("deadlock_plus_fra"), None);
    }

    #[test]
    fn group_is_covered_only_when_every_relay_is_blocked() {
        let groups = vec![group("a", "A", &["1.1.1.1", "2.2.2.2"]), group("b", "B", &["3.3.3.3", "4.4.4.4"])];
        let blocked: HashSet<String> = ["1.1.1.1", "2.2.2.2", "3.3.3.3"].iter().map(|s| s.to_string()).collect();
        let covered = covered_groups(&groups, &blocked);
        assert_eq!(covered.iter().map(|g| g.id.as_str()).collect::<Vec<_>>(), vec!["a"]);
    }

    fn rule(name: &str, ips: &[&str]) -> ExistingBlockRule {
        ExistingBlockRule { name: name.into(), remote_ips: ips.iter().map(|s| s.to_string()).collect() }
    }

    #[test]
    fn import_plan_recreates_covered_groups_and_removes_only_fully_covered_rules() {
        let a = group("a", "A", &["1.1.1.1", "2.2.2.2"]);
        let b = group("b", "B", &["3.3.3.3"]);
        let data = ServerData { revision: "1".into(), unclustered: Vec::new(), clustered: vec![a, b] };
        let scan = ScanResult {
            rules: vec![
                rule("server_picker_x_A", &["1.1.1.1", "2.2.2.2"]),
                rule("server_picker_x_Mixed", &["2.2.2.2", "9.9.9.9"]),
            ],
            sources: vec!["ServerPickerX".into()],
            covered_group_ids: vec!["a".into()],
            covered_ips: ["1.1.1.1", "2.2.2.2"].iter().map(|s| s.to_string()).collect(),
        };
        let plan = import_plan(&data, &scan);
        assert_eq!(plan.specs.len(), 1);
        assert_eq!(plan.specs[0].group_id, "a");
        assert_eq!(plan.specs[0].relay_ips, ["1.1.1.1", "2.2.2.2"]);
        assert_eq!(plan.removable, ["server_picker_x_A"]);
        assert_eq!(plan.group_ids, ["a"]);
    }

    #[test]
    fn import_plan_is_empty_when_nothing_is_covered() {
        let data = ServerData {
            revision: "1".into(),
            unclustered: Vec::new(),
            clustered: vec![group("a", "A", &["1.1.1.1"])],
        };
        let scan = ScanResult {
            rules: Vec::new(),
            sources: Vec::new(),
            covered_group_ids: Vec::new(),
            covered_ips: HashSet::new(),
        };
        let plan = import_plan(&data, &scan);
        assert!(plan.specs.is_empty() && plan.removable.is_empty() && plan.group_ids.is_empty());
    }
}
