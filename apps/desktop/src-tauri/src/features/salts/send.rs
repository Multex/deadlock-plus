use std::future::Future;
use std::path::Path;
use std::time::Duration;

use dp_ingest::merge::merge;
use dp_ingest::record::Source;
use dp_ingest::salts::Salts;
use tauri::{AppHandle, Manager};

use super::join::{self, Known};
use super::record::SaltRecordService;
use crate::features::error::AppError;
use crate::features::ingest::error::status_error;
use crate::http::Http;

const API: &str = "https://api.deadlock-api.com/v1";
pub const BATCH_SIZE: usize = 1000;
const MAX_RETRIES: u32 = 10;
const RETRY_DELAY: Duration = Duration::from_secs(3);
const TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Default)]
pub struct Sent {
    /// What the Deadlock API took, now in the record.
    pub salts: Vec<Salts>,
    /// The last failed batch's error. Its salts stay out of the record and go out again on the next send.
    pub error: Option<AppError>,
}

/// Shares what the record has not seen yet. A replay salt only goes out with its match's metadata salt, from the
/// record or the Deadlock API; without one it is held in the record until one turns up.
pub async fn send(app: &AppHandle, salts: &[Salts], source: Source) -> Sent {
    let app_data = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(e) => return Sent { salts: Vec::new(), error: Some(AppError::internal(e)) },
    };
    let http = app.state::<Http>().0.clone();
    let record = app.state::<SaltRecordService>();
    send_with(
        &record,
        &app_data,
        salts,
        source,
        now_secs(),
        |match_id| join::lookup(&http, API, match_id),
        |batch| post(&http, batch),
    )
    .await
}

async fn send_with<L, LF, P, PF>(
    record: &SaltRecordService,
    app_data: &Path,
    salts: &[Salts],
    source: Source,
    now: i64,
    mut lookup: L,
    mut post: P,
) -> Sent
where
    L: FnMut(u64) -> LF,
    LF: Future<Output = Option<Known>>,
    P: FnMut(Vec<Salts>) -> PF,
    PF: Future<Output = Result<(), AppError>>,
{
    let mut ready = Vec::new();
    let mut held = Vec::new();
    for salts in merge(salts.iter().copied().filter(Salts::is_plausible)) {
        let Some(mut salts) = record.read(app_data, |r| r.unsent(&salts)) else { continue };
        if salts.metadata_salt.is_none() && !record.read(app_data, |r| r.join(&mut salts)) {
            if record.read(app_data, |r| r.is_held(salts.match_id)) {
                continue;
            }
            if let Some(known) = lookup(salts.match_id).await {
                join::join(&mut salts, known);
            }
            if salts.metadata_salt.is_none() {
                held.push(salts);
                continue;
            }
        }
        ready.push(salts);
    }
    if !held.is_empty() {
        record.update(app_data, |r| held.iter().fold(false, |changed, s| r.hold(s, now) | changed));
    }

    let mut sent = Sent::default();
    for batch in ready.chunks(BATCH_SIZE) {
        match post(batch.to_vec()).await {
            Ok(()) => {
                record.update(app_data, |r| batch.iter().fold(false, |changed, s| r.mark(s, source, now) | changed));
                sent.salts.extend_from_slice(batch);
            }
            Err(e) => sent.error = Some(e),
        }
    }
    sent
}

async fn post(http: &reqwest::Client, salts: Vec<Salts>) -> Result<(), AppError> {
    let url = format!("{API}/matches/salts");
    let mut last = String::new();
    let mut last_status = None;
    for attempt in 1..=MAX_RETRIES {
        match http.post(&url).timeout(TIMEOUT).json(&salts).send().await {
            Ok(r) if r.status().is_success() => return Ok(()),
            Ok(r) if r.status().as_u16() == 400 => {
                log::warn!("a batch of {} match(es) was rejected by the Deadlock API (400)", salts.len());
                return Err(status_error(400));
            }
            Ok(r) => {
                last = format!("HTTP {}", r.status());
                last_status = Some(r.status().as_u16());
            }
            Err(e) => {
                last = e.to_string();
                last_status = None;
            }
        }
        log::debug!("salt post attempt {attempt}/{MAX_RETRIES} failed: {last}");
        if attempt < MAX_RETRIES {
            tokio::time::sleep(RETRY_DELAY).await;
        }
    }
    log::warn!("giving up sending {} match(es): {last}", salts.len());
    Err(last_status.map_or_else(|| AppError::network(last), status_error))
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_ingest::record::SaltRecord;
    use std::cell::RefCell;
    use std::path::PathBuf;

    const NOW: i64 = 1_000;

    fn full(id: u64) -> Salts {
        Salts { match_id: id, cluster_id: Some(7), metadata_salt: Some(11), replay_salt: Some(22), username: Some(3) }
    }

    fn meta_only(id: u64) -> Salts {
        Salts { replay_salt: None, ..full(id) }
    }

    fn replay_only(id: u64) -> Salts {
        Salts { metadata_salt: None, ..full(id) }
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-salt-send-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    struct Run {
        sent: Sent,
        posted: Vec<Vec<Salts>>,
        looked_up: Vec<u64>,
    }

    /// Sends with an API that knows `known` for every lookup and answers each post with the next of `replies`
    /// (then `Ok`).
    fn run(
        record: &SaltRecordService,
        dir: &Path,
        salts: &[Salts],
        known: Option<Known>,
        replies: Vec<Result<(), AppError>>,
    ) -> Run {
        let posted = RefCell::new(Vec::new());
        let looked_up = RefCell::new(Vec::new());
        let replies = RefCell::new(replies.into_iter());
        let sent = tauri::async_runtime::block_on(send_with(
            record,
            dir,
            salts,
            Source::Steam,
            NOW,
            |id| {
                looked_up.borrow_mut().push(id);
                std::future::ready(known)
            },
            |batch| {
                posted.borrow_mut().push(batch);
                std::future::ready(replies.borrow_mut().next().unwrap_or(Ok(())))
            },
        ));
        Run { sent, posted: posted.into_inner(), looked_up: looked_up.into_inner() }
    }

    fn read<R>(record: &SaltRecordService, dir: &Path, f: impl FnOnce(&SaltRecord) -> R) -> R {
        record.read(dir, f)
    }

    #[test]
    fn a_replay_salt_goes_out_with_the_metadata_salt_already_in_the_record() {
        let dir = temp_dir("record-join");
        let record = SaltRecordService::default();
        record.update(&dir, |r| r.mark(&meta_only(5), Source::Login, 500));

        let run = run(&record, &dir, &[replay_only(5)], None, vec![]);
        assert_eq!(run.posted, vec![vec![full(5)]]);
        assert!(run.looked_up.is_empty());
        assert_eq!(run.sent.salts, vec![full(5)]);
        let entry = read(&record, &dir, |r| r.recent(1)[0]);
        assert_eq!((entry.replay_salt, entry.replay_at, entry.source), (Some(22), Some(NOW), Source::Steam));
    }

    #[test]
    fn a_replay_salt_goes_out_with_the_metadata_salt_the_api_knows() {
        let dir = temp_dir("api-join");
        let record = SaltRecordService::default();
        let known = Known { cluster_id: Some(9), metadata_salt: Some(11) };

        let run = run(&record, &dir, &[replay_only(5)], Some(known), vec![]);
        assert_eq!(run.looked_up, vec![5]);
        assert_eq!(run.posted, vec![vec![full(5)]]);
        assert_eq!(read(&record, &dir, |r| r.unsent(&full(5))), None);
    }

    #[test]
    fn a_lone_replay_salt_is_held_and_goes_out_once_its_metadata_salt_arrives() {
        let dir = temp_dir("held");
        let record = SaltRecordService::default();

        let first = run(&record, &dir, &[replay_only(5)], None, vec![]);
        assert!(first.posted.is_empty());
        assert!(first.sent.salts.is_empty());
        assert!(read(&record, &dir, SaltRecord::is_empty));

        let later = run(&record, &dir, &[meta_only(5)], None, vec![]);
        assert_eq!(later.posted, vec![vec![full(5)]]);
        let entry = read(&record, &dir, |r| r.recent(1)[0]);
        assert_eq!((entry.details_at, entry.replay_at), (Some(NOW), Some(NOW)));
    }

    #[test]
    fn the_held_salt_survives_a_restart() {
        let dir = temp_dir("held-restart");
        run(&SaltRecordService::default(), &dir, &[replay_only(5)], None, vec![]);

        let restarted = SaltRecordService::default();
        let later = run(&restarted, &dir, &[meta_only(5)], None, vec![]);
        assert_eq!(later.posted, vec![vec![full(5)]]);
    }

    #[test]
    fn a_held_salt_is_not_looked_up_again() {
        let dir = temp_dir("held-lookup");
        let record = SaltRecordService::default();
        assert_eq!(run(&record, &dir, &[replay_only(5)], None, vec![]).looked_up, vec![5]);

        let again = run(&record, &dir, &[replay_only(5)], None, vec![]);
        assert!(again.looked_up.is_empty());
        assert!(again.posted.is_empty());
    }

    #[test]
    fn a_second_scan_of_the_same_cache_sends_nothing() {
        let dir = temp_dir("rescan");
        let record = SaltRecordService::default();
        let cache = [meta_only(5), replay_only(5), meta_only(6), replay_only(7)];

        let first = run(&record, &dir, &cache, None, vec![]);
        assert_eq!(first.posted, vec![vec![full(5), meta_only(6)]]);

        let second = run(&record, &dir, &cache, None, vec![]);
        assert!(second.posted.is_empty());
        assert!(second.sent.salts.is_empty());
    }

    #[test]
    fn batches_split_at_batch_size() {
        let dir = temp_dir("batches");
        let record = SaltRecordService::default();
        let salts: Vec<Salts> = (1..=2500).map(meta_only).collect();

        let run = run(&record, &dir, &salts, None, vec![]);
        let sizes: Vec<usize> = run.posted.iter().map(Vec::len).collect();
        assert_eq!(sizes, vec![BATCH_SIZE, BATCH_SIZE, 500]);
        assert_eq!(run.sent.salts.len(), 2500);
        assert_eq!(read(&record, &dir, SaltRecord::len), 2500);
    }

    #[test]
    fn a_failed_batch_is_not_marked_and_the_rest_still_go_out() {
        let dir = temp_dir("failed");
        let record = SaltRecordService::default();
        let salts: Vec<Salts> = (1..=2500).map(meta_only).collect();

        let run = run(&record, &dir, &salts, None, vec![Ok(()), Err(status_error(400))]);
        assert_eq!(run.posted.len(), 3);
        assert_eq!(run.sent.salts.len(), 1500);
        assert_eq!(run.sent.error.as_ref().map(AppError::code), Some("ingest.rejected"));
        assert_eq!(read(&record, &dir, |r| r.unsent(&meta_only(1500))), Some(meta_only(1500)));
        assert_eq!(read(&record, &dir, |r| r.unsent(&meta_only(1))), None);
        assert_eq!(read(&record, &dir, |r| r.unsent(&meta_only(2500))), None);
    }

    #[test]
    fn implausible_match_ids_are_never_sent() {
        let dir = temp_dir("implausible");
        let record = SaltRecordService::default();
        let run = run(&record, &dir, &[meta_only(99_999_999_999)], None, vec![]);
        assert!(run.posted.is_empty());
    }
}
