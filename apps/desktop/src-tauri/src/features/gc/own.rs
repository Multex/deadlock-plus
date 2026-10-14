use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::AppHandle;
use ts_rs::TS;

use dp_gc::client::GcSession;
use dp_gc::error::GcError as SteamGcError;
use dp_gc::ledger::SaltAttempts;
use dp_gc::pass::{fetch_all, FullOutcome, Host};
use dp_sync::LockExt;

use super::{api, block_on, load, save, steam_accounts, GcHost, Shared, ATTEMPTS_KEY};
use crate::features::error::AppError;
use crate::features::stop::StopSignal;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum OwnRecoveryOutcome {
    Done,
    /// Some matches or accounts failed. Running it again retries them.
    Incomplete,
    /// Steam's limit was reached. The rest can be fetched another day.
    RateLimited,
    /// Cancelled, or Deadlock was started.
    Stopped,
    Failed,
}

/// A run that recovers salts for every match in each account's own history, ignoring the daily
/// quota.
#[derive(Serialize, Clone, Default, Debug, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct OwnRecovery {
    pub running: bool,
    /// Matches found without salts so far.
    pub missing: u32,
    pub delivered: u32,
    pub failed: u32,
    pub outcome: Option<OwnRecoveryOutcome>,
    pub error: Option<AppError>,
}

fn outcome_of(stopped: bool, rate_limited: bool, failed: u32) -> OwnRecoveryOutcome {
    if stopped {
        OwnRecoveryOutcome::Stopped
    } else if rate_limited {
        OwnRecoveryOutcome::RateLimited
    } else if failed > 0 {
        OwnRecoveryOutcome::Incomplete
    } else {
        OwnRecoveryOutcome::Done
    }
}

/// Matches in `history` deadlock-api has no metadata for, not yet fetched this run and not given
/// up on.
fn missing_matches(history: &[u64], known: &HashSet<u64>, done: &HashSet<u64>, attempts: &SaltAttempts) -> Vec<u64> {
    history.iter().copied().filter(|id| !known.contains(id) && !done.contains(id) && !attempts.given_up(*id)).collect()
}

fn update(shared: &Shared, f: impl FnOnce(&mut OwnRecovery)) {
    if let Some(own) = shared.status.lock_or_recover().own_recovery.as_mut() {
        f(own);
    }
}

async fn own_account(
    session: &GcSession,
    account_id: u32,
    http: &reqwest::Client,
    host: &mut impl Host,
    attempts: &mut SaltAttempts,
    done: &mut HashSet<u64>,
    shared: &Shared,
) -> Result<FullOutcome, String> {
    let (history, complete) = match session.fetch_match_history(account_id).await {
        Ok(h) => h,
        Err(SteamGcError::GcRateLimited) => return Ok(FullOutcome { rate_limited: true, ..Default::default() }),
        Err(e) => return Err(e.to_string()),
    };
    log::debug!("gc: read {} match(es) from the history of account {account_id}", history.len());
    let known = api::known_match_ids(http, &history).await.map_err(|e| e.to_string())?;
    attempts.forget(&known);
    let missing = missing_matches(&history, &known, done, attempts);
    log::info!("gc: account {account_id} has {} match(es), {} missing salts", history.len(), missing.len());
    update(shared, |own| own.missing += u32::try_from(missing.len()).unwrap_or(u32::MAX));

    let mut out = fetch_all(session, host, &missing, attempts, done).await;
    // Steam cut the history short, so older pages still need another run.
    out.rate_limited |= !complete;
    Ok(out)
}

async fn recover(
    cancel: &AtomicBool,
    shared: &Shared,
    app: &AppHandle,
    http: &reqwest::Client,
) -> Result<OwnRecoveryOutcome, AppError> {
    let contexts = steam_accounts()?;
    let mut attempts: SaltAttempts = load(app, ATTEMPTS_KEY);
    let mut done = HashSet::new();
    let mut last_request = None;
    let (mut stopped, mut rate_limited, mut failed) = (false, false, 0u32);
    let halted = || cancel.load(Ordering::Relaxed);

    for ctx in &contexts {
        if halted() || dp_game::is_running() {
            stopped = true;
            break;
        }
        let session = match GcSession::connect(ctx).await {
            Ok(s) => s,
            Err(e) => {
                log::warn!("gc: account {} cannot reach the GC: {e}", ctx.account_id());
                failed += 1;
                update(shared, |own| own.failed += 1);
                continue;
            }
        };
        let mut host = GcHost {
            http,
            last_request: &mut last_request,
            halted,
            on_delivered: || update(shared, |own| own.delivered += 1),
        };
        match own_account(&session, ctx.account_id(), http, &mut host, &mut attempts, &mut done, shared).await {
            Ok(out) => {
                failed += out.failed;
                rate_limited |= out.rate_limited;
                stopped |= out.stopped;
                update(shared, |own| own.failed += out.failed);
            }
            Err(e) => {
                log::warn!("gc: own history of account {} failed: {e}", ctx.account_id());
                failed += 1;
                update(shared, |own| own.failed += 1);
            }
        }
        save(app, ATTEMPTS_KEY, &attempts);
        if stopped {
            break;
        }
    }
    Ok(outcome_of(stopped, rate_limited, failed))
}

pub(super) fn run(cancel: &StopSignal, shared: &Shared, app: &AppHandle, http: &reqwest::Client) {
    // A background pass sees `own_active` and stops at its next request.
    let _gc = shared.gc_lock.blocking_lock();
    let result = block_on(recover(cancel.flag(), shared, app, http));
    let (outcome, error) = match result {
        Ok(outcome) => (outcome, None),
        Err(e) => (OwnRecoveryOutcome::Failed, Some(e)),
    };
    log::info!("gc: own match history recovery ended: {outcome:?}");
    // Cleared before the status says it ended, so a run started right after keeps its flag set.
    shared.own_active.store(false, Ordering::Release);
    update(shared, |own| {
        own.running = false;
        own.outcome = Some(outcome);
        own.error = error;
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stop_beats_rate_limit_beats_failures() {
        assert_eq!(outcome_of(true, true, 3), OwnRecoveryOutcome::Stopped);
        assert_eq!(outcome_of(false, true, 3), OwnRecoveryOutcome::RateLimited);
        assert_eq!(outcome_of(false, false, 3), OwnRecoveryOutcome::Incomplete);
        assert_eq!(outcome_of(false, false, 0), OwnRecoveryOutcome::Done);
    }

    #[test]
    fn missing_skips_known_done_and_given_up_matches() {
        let mut attempts = SaltAttempts::default();
        for _ in 0..dp_gc::ledger::MAX_SALT_ATTEMPTS {
            attempts.record(4);
        }
        let got = missing_matches(&[1, 2, 3, 4, 5], &HashSet::from([2]), &HashSet::from([3]), &attempts);
        assert_eq!(got, vec![1, 5]);
    }

    #[test]
    fn outcome_serializes_in_snake_case() {
        assert_eq!(serde_json::to_value(OwnRecoveryOutcome::RateLimited).unwrap(), "rate_limited");
    }
}
