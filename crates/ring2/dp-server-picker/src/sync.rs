use std::collections::{HashMap, HashSet};

use serde::Serialize;
use ts_rs::TS;

use crate::definitions::load_definitions;
use crate::sdr::{fetch_server_data, ServerData};
use dp_firewall::validate::validate_block_request;
use dp_firewall::{FirewallRuleSpec, RefreshReport};

/// The firewall's stale-block refresh, injected so callers choose the backend.
pub type Refresh = fn(&[FirewallRuleSpec], bool) -> Result<RefreshReport, String>;

/// One spec per group id, dropping any group that fails the same validation a manual block
/// goes through. A skipped group keeps whatever rule it already has.
fn desired_specs(data: &ServerData) -> Vec<FirewallRuleSpec> {
    let mut seen = HashSet::new();
    let mut specs = Vec::new();
    for group in data.unclustered.iter().chain(data.clustered.iter()) {
        if !seen.insert(group.id.as_str()) {
            continue;
        }
        if let Err(e) = validate_block_request(&group.id, &group.description, &group.relay_ips) {
            log::warn!("not syncing {}: {e}", group.id);
            continue;
        }
        specs.push(FirewallRuleSpec {
            group_id: group.id.clone(),
            description: group.description.clone(),
            relay_ips: group.relay_ips.clone(),
        });
    }
    specs
}

/// Region descriptions, not ids, so the UI can name them directly.
#[derive(Debug, Default, Serialize, TS)]
#[ts(export)]
pub struct SyncOutcome {
    pub updated: Vec<String>,
    pub failed: Vec<String>,
}

fn run_refresh(refresh: Refresh, specs: &[FirewallRuleSpec], prompt: bool) -> Result<SyncOutcome, String> {
    let names: HashMap<&str, &str> = specs.iter().map(|s| (s.group_id.as_str(), s.description.as_str())).collect();
    let report = refresh(specs, prompt)?;
    let describe = |ids: Vec<String>| {
        ids.into_iter().map(|id| names.get(id.as_str()).map_or(id, |d| d.to_string())).collect::<Vec<_>>()
    };
    Ok(SyncOutcome { updated: describe(report.updated), failed: describe(report.failed) })
}

/// Fetches Valve's current relays straight from the source (never from the web view) and
/// corrects every stale block. Runs one at a time through `lock`: the picker opening and the
/// timer can land together. Pass `prompt` true only when the user asked for the sync: false
/// reports blocks that would need a password as failed instead of asking for one.
pub async fn sync_blocks(
    lock: &tokio::sync::Mutex<()>,
    http: &reqwest::Client,
    prompt: bool,
    refresh: Refresh,
) -> Result<SyncOutcome, String> {
    let _one_at_a_time = lock.lock().await;
    let mut outcome = SyncOutcome::default();

    for def in load_definitions() {
        let data = fetch_server_data(http, &def).await.map_err(|e| e.to_string())?;
        let specs = desired_specs(&data);
        let part = tokio::task::spawn_blocking(move || run_refresh(refresh, &specs, prompt))
            .await
            .map_err(|e| e.to_string())??;
        outcome.updated.extend(part.updated);
        outcome.failed.extend(part.failed);
    }

    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sdr::{ServerData, ServerGroup};
    use std::time::Duration;

    fn group(id: &str, description: &str, ips: &[&str]) -> ServerGroup {
        ServerGroup {
            id: id.into(),
            description: description.into(),
            is_cluster: false,
            country_code: None,
            relay_ips: ips.iter().map(|s| s.to_string()).collect(),
            member_ids: Vec::new(),
            routing_note: None,
        }
    }

    fn data(unclustered: Vec<ServerGroup>, clustered: Vec<ServerGroup>) -> ServerData {
        ServerData { revision: "1".into(), unclustered, clustered }
    }

    #[test]
    fn desired_specs_dedupe_a_group_present_in_both_lists() {
        let fra = group("fra", "Frankfurt", &["155.133.226.1"]);
        let specs = desired_specs(&data(vec![fra.clone()], vec![fra]));
        assert_eq!(specs.len(), 1);
        assert_eq!(specs[0].group_id, "fra");
    }

    #[test]
    fn desired_specs_drop_groups_that_fail_validation() {
        let good = group("fra", "Frankfurt", &["155.133.226.1"]);
        let lan = group("evil", "Evil", &["192.168.1.1"]);
        let empty = group("none", "None", &[]);
        let specs = desired_specs(&data(vec![good, lan, empty], Vec::new()));
        assert_eq!(specs.iter().map(|s| s.group_id.as_str()).collect::<Vec<_>>(), ["fra"]);
    }

    #[test]
    fn desired_specs_keep_clusters_and_pops_apart() {
        let pop = group("fra", "Frankfurt (Germany)", &["1.1.1.1"]);
        let cluster = group("frankfurt", "Frankfurt", &["1.1.1.1"]);
        let specs = desired_specs(&data(vec![pop], vec![cluster]));
        assert_eq!(specs.len(), 2);
    }

    fn no_refresh(_: &[FirewallRuleSpec], _: bool) -> Result<RefreshReport, String> {
        Ok(RefreshReport::default())
    }

    fn spec(id: &str, description: &str) -> FirewallRuleSpec {
        FirewallRuleSpec { group_id: id.into(), description: description.into(), relay_ips: vec!["1.1.1.1".into()] }
    }

    fn fake_refresh(specs: &[FirewallRuleSpec], prompt: bool) -> Result<RefreshReport, String> {
        assert!(prompt);
        assert_eq!(specs.len(), 2);
        Ok(RefreshReport { updated: vec!["fra".into(), "unknown".into()], failed: vec!["ams".into()] })
    }

    #[test]
    fn run_refresh_names_groups_by_description_and_keeps_unknown_ids() {
        let specs = [spec("fra", "Frankfurt"), spec("ams", "Amsterdam")];
        let out = run_refresh(fake_refresh, &specs, true).unwrap();
        assert_eq!(out.updated, ["Frankfurt", "unknown"]);
        assert_eq!(out.failed, ["Amsterdam"]);
    }

    #[test]
    fn run_refresh_passes_the_error_through() {
        fn failing(_: &[FirewallRuleSpec], _: bool) -> Result<RefreshReport, String> {
            Err("denied".into())
        }
        assert_eq!(run_refresh(failing, &[], false).unwrap_err(), "denied");
    }

    fn unreachable_client() -> reqwest::Client {
        reqwest::Client::builder().proxy(reqwest::Proxy::all("http://127.0.0.1:1").unwrap()).build().unwrap()
    }

    #[tokio::test]
    async fn sync_blocks_runs_when_the_lock_is_free() {
        let lock = tokio::sync::Mutex::new(());
        let result =
            tokio::time::timeout(Duration::from_secs(5), sync_blocks(&lock, &unreachable_client(), true, no_refresh))
                .await;
        assert!(matches!(result, Ok(Err(_))));
    }

    #[tokio::test]
    async fn sync_blocks_waits_for_the_lock() {
        let lock = tokio::sync::Mutex::new(());
        let _held = lock.lock().await;
        let result = tokio::time::timeout(
            Duration::from_millis(300),
            sync_blocks(&lock, &unreachable_client(), true, no_refresh),
        )
        .await;
        assert!(result.is_err());
    }
}
