use std::time::Duration;

use dp_ingest::salts::Salts;
use reqwest::StatusCode;
use serde::Deserialize;

const TIMEOUT: Duration = Duration::from_secs(30);

/// The part of a match's salts the Deadlock API holds that a lone replay salt needs.
#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub struct Known {
    pub cluster_id: Option<u32>,
    pub metadata_salt: Option<u32>,
}

/// `disable_steam` makes a match the API lacks answer 404 at once instead of costing one of its Steam fetches.
pub async fn lookup(http: &reqwest::Client, api: &str, match_id: u64) -> Option<Known> {
    let url = format!("{api}/matches/{match_id}/salts?disable_steam=true");
    let resp = match http.get(&url).timeout(TIMEOUT).send().await {
        Ok(resp) => resp,
        Err(e) => {
            log::debug!("salt lookup for match {match_id} failed: {e}");
            return None;
        }
    };
    if resp.status() == StatusCode::NOT_FOUND {
        return None;
    }
    if !resp.status().is_success() {
        log::debug!("salt lookup for match {match_id} answered {}", resp.status());
        return None;
    }
    parse(&resp.text().await.ok()?)
}

fn parse(body: &str) -> Option<Known> {
    let known: Known = serde_json::from_str(body).ok()?;
    let metadata_salt = known.metadata_salt.filter(|&s| s > 0)?;
    Some(Known { cluster_id: known.cluster_id.filter(|&c| c > 0), metadata_salt: Some(metadata_salt) })
}

/// Gives a lone replay salt the metadata salt the API holds, and its cluster when the salt came without one.
pub fn join(salts: &mut Salts, known: Known) -> bool {
    if salts.metadata_salt.is_some() || salts.replay_salt.is_none() {
        return false;
    }
    let Some(metadata_salt) = known.metadata_salt else { return false };
    salts.metadata_salt = Some(metadata_salt);
    salts.cluster_id = salts.cluster_id.or(known.cluster_id);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn replay_only(id: u64) -> Salts {
        Salts { match_id: id, cluster_id: Some(7), metadata_salt: None, replay_salt: Some(22), username: Some(3) }
    }

    #[test]
    fn the_api_answer_gives_the_metadata_salt_and_cluster() {
        let body = r#"{"match_id":5,"cluster_id":429,"metadata_salt":188785897,"replay_salt":null,
            "metadata_url":"http://replay429.valve.net/1422450/5_188785897.meta.bz2","demo_url":null}"#;
        assert_eq!(parse(body), Some(Known { cluster_id: Some(429), metadata_salt: Some(188_785_897) }));
    }

    #[test]
    fn an_answer_without_a_metadata_salt_knows_nothing() {
        assert_eq!(parse(r#"{"match_id":5,"cluster_id":429,"metadata_salt":null,"replay_salt":22}"#), None);
        assert_eq!(parse(r#"{"match_id":5,"cluster_id":429,"metadata_salt":0,"replay_salt":22}"#), None);
        assert_eq!(parse("not json"), None);
    }

    #[test]
    fn a_zero_cluster_reads_as_none() {
        let known = parse(r#"{"match_id":5,"cluster_id":0,"metadata_salt":11}"#).unwrap();
        assert_eq!(known.cluster_id, None);
    }

    #[test]
    fn join_fills_a_lone_replay_salt_and_keeps_its_own_cluster() {
        let mut salts = replay_only(5);
        assert!(join(&mut salts, Known { cluster_id: Some(9), metadata_salt: Some(11) }));
        assert_eq!(salts, Salts { metadata_salt: Some(11), ..replay_only(5) });

        let mut no_cluster = Salts { cluster_id: None, ..replay_only(5) };
        join(&mut no_cluster, Known { cluster_id: Some(9), metadata_salt: Some(11) });
        assert_eq!(no_cluster.cluster_id, Some(9));
    }

    #[test]
    fn join_leaves_salts_with_a_metadata_salt_alone() {
        let mut salts = Salts { metadata_salt: Some(1), ..replay_only(5) };
        assert!(!join(&mut salts, Known { cluster_id: Some(9), metadata_salt: Some(11) }));
        assert_eq!(salts.metadata_salt, Some(1));
    }
}
