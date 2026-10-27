use crate::command_panics::guarded_infallible;
use crate::features::error::AppError;
use dp_ingest::record::{Entry, SaltRecord, Source};
use dp_ingest::salts::Salts;
use tauri::Manager;

use super::details;
use super::record::SaltRecordService;
use super::types::{ShareSource, SharedMatch};

const SHOWN: usize = 50;

fn share_source(source: Source) -> ShareSource {
    match source {
        Source::Steam => ShareSource::Steam,
        Source::Deadlock => ShareSource::Deadlock,
        Source::Login => ShareSource::Login,
    }
}

fn shared_match(entry: &Entry) -> SharedMatch {
    SharedMatch {
        match_id: entry.match_id,
        at: entry.at,
        source: share_source(entry.source),
        details: entry.details_at.is_some(),
        replay: entry.replay_at.is_some(),
    }
}

fn shown(record: &SaltRecord) -> Vec<SharedMatch> {
    record.recent(SHOWN).iter().map(shared_match).collect()
}

#[tauri::command]
pub async fn shared_matches(app: tauri::AppHandle) -> Result<Vec<SharedMatch>, AppError> {
    guarded_infallible(async move {
        let Ok(app_data) = app.path().app_data_dir() else { return Vec::new() };
        let read = crate::command_panics::spawn_blocking_guarded(move || {
            app.state::<SaltRecordService>().read(&app_data, shown)
        });
        read.await.unwrap_or_else(|e| {
            log::warn!("could not read the shared matches: {e}");
            Vec::new()
        })
    })
    .await
}

/// What the record knows to load `match_id`'s details from Valve.
fn details_salts(record: &SaltRecord, match_id: u64) -> Option<Salts> {
    let entry = record.get(match_id)?;
    Some(Salts {
        match_id,
        cluster_id: Some(entry.cluster_id?),
        metadata_salt: Some(entry.metadata_salt?),
        replay_salt: None,
        username: None,
    })
}

/// The match's details straight from Valve, when the record holds what is needed to load them. Cached like an
/// API body, so the next open reads them from the cache.
#[tauri::command]
pub async fn fetch_match_details(match_id: u64, app: tauri::AppHandle) -> Result<Option<serde_json::Value>, AppError> {
    guarded_infallible(async move {
        let app_data = app.path().app_data_dir().ok()?;
        let handle = app.clone();
        let salts = crate::command_panics::spawn_blocking_guarded(move || {
            handle.state::<SaltRecordService>().read(&app_data, |record| details_salts(record, match_id))
        })
        .await
        .ok()??;
        details::fetch_detail(&app, &salts).await
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn salts(id: u64) -> Salts {
        Salts { match_id: id, cluster_id: Some(7), metadata_salt: Some(11), replay_salt: Some(22), username: None }
    }

    #[test]
    fn the_newest_fifty_shared_matches_are_shown() {
        let mut record = SaltRecord::default();
        for id in 1..=60 {
            record.mark(&salts(id), Source::Steam, 1_000 + id as i64);
        }
        let ids: Vec<u64> = shown(&record).iter().map(|m| m.match_id).collect();
        assert_eq!(ids, (11..=60).rev().collect::<Vec<_>>());
    }

    #[test]
    fn a_held_match_is_not_shown() {
        let mut record = SaltRecord::default();
        record.hold(&Salts { cluster_id: None, metadata_salt: None, ..salts(5) }, 100);
        record.mark(&Salts { replay_salt: None, ..salts(6) }, Source::Login, 200);
        assert_eq!(
            shown(&record),
            [SharedMatch { match_id: 6, at: 200, source: ShareSource::Login, details: true, replay: false }]
        );
    }

    #[test]
    fn every_source_maps_to_its_share_source() {
        assert_eq!(share_source(Source::Steam), ShareSource::Steam);
        assert_eq!(share_source(Source::Deadlock), ShareSource::Deadlock);
        assert_eq!(share_source(Source::Login), ShareSource::Login);
    }

    #[test]
    fn a_recorded_match_gives_its_cluster_and_metadata_salt() {
        let mut record = SaltRecord::default();
        record.mark(&salts(5), Source::Deadlock, 100);
        assert_eq!(
            details_salts(&record, 5),
            Some(Salts {
                match_id: 5,
                cluster_id: Some(7),
                metadata_salt: Some(11),
                replay_salt: None,
                username: None
            })
        );
    }

    #[test]
    fn an_unknown_or_held_match_gives_nothing() {
        let mut record = SaltRecord::default();
        record.hold(&Salts { cluster_id: None, metadata_salt: None, ..salts(5) }, 100);
        assert_eq!(details_salts(&record, 5), None);
        assert_eq!(details_salts(&record, 6), None);
    }

    #[test]
    fn a_match_recorded_without_a_cluster_gives_nothing() {
        let mut record = SaltRecord::default();
        record.mark(&Salts { cluster_id: None, ..salts(5) }, Source::Steam, 100);
        assert_eq!(details_salts(&record, 5), None);
    }
}
