use std::collections::{HashMap, HashSet};

use serde::Serialize;
use ts_rs::TS;

use crate::definitions::load_definitions;
use crate::sdr::{fetch_server_data, ServerData};
use dp_firewall::validate::validate_block_request;
use dp_firewall::{self as firewall, FirewallRuleSpec};

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

/// Fetches Valve's current relays straight from the source (never from the web view) and
/// corrects every stale block. Runs one at a time through `lock`: the picker opening and the
/// timer can land together. Pass `prompt` true only when the user asked for the sync: false
/// reports blocks that would need a password as failed instead of asking for one.
pub async fn sync_blocks(
    lock: &tokio::sync::Mutex<()>,
    http: &reqwest::Client,
    prompt: bool,
) -> Result<SyncOutcome, String> {
    let _one_at_a_time = lock.lock().await;
    let mut outcome = SyncOutcome::default();

    for def in load_definitions() {
        let data = fetch_server_data(http, &def).await.map_err(|e| e.to_string())?;
        let specs = desired_specs(&data);
        let names: HashMap<String, String> =
            specs.iter().map(|s| (s.group_id.clone(), s.description.clone())).collect();

        let report = tokio::task::spawn_blocking(move || firewall::refresh_stale_groups(&specs, prompt))
            .await
            .map_err(|e| e.to_string())??;

        let describe = |ids: Vec<String>| ids.into_iter().map(|id| names.get(&id).cloned().unwrap_or(id));
        outcome.updated.extend(describe(report.updated));
        outcome.failed.extend(describe(report.failed));
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

    fn unreachable_client() -> reqwest::Client {
        reqwest::Client::builder().proxy(reqwest::Proxy::all("http://127.0.0.1:1").unwrap()).build().unwrap()
    }

    #[tokio::test]
    async fn sync_blocks_runs_when_the_lock_is_free() {
        let lock = tokio::sync::Mutex::new(());
        let result =
            tokio::time::timeout(Duration::from_secs(5), sync_blocks(&lock, &unreachable_client(), true)).await;
        assert!(matches!(result, Ok(Err(_))));
    }

    #[tokio::test]
    async fn sync_blocks_waits_for_the_lock() {
        let lock = tokio::sync::Mutex::new(());
        let _held = lock.lock().await;
        let result =
            tokio::time::timeout(Duration::from_millis(300), sync_blocks(&lock, &unreachable_client(), true)).await;
        assert!(result.is_err());
    }
}
