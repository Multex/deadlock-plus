use std::collections::HashMap;
use std::time::Duration;

use super::retry::Reply;
use super::store::{freshness, Freshness, GradeRecord};

/// Pause between two metadata fetches of one run; the API is hit one match at a time.
pub const FETCH_GAP: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Job {
    /// Grade again from the stored totals; no network.
    Regrade(u64),
    Fetch(u64),
}

/// What one metadata fetch gave the run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Got,
    /// The API does not have the match yet. Counts as a failed run.
    NotYet,
    /// Unreadable body or an unexpected status. Counts as a failed run.
    Fail,
    /// The API asked to be left alone: end the run without counting a failure.
    Stop,
}

impl Source {
    pub fn counts_as_failure(self) -> bool {
        matches!(self, Source::NotYet | Source::Fail)
    }
}

pub fn source_from(reply: Reply) -> Source {
    match reply {
        Reply::Ok => Source::Got,
        Reply::NotYet => Source::NotYet,
        Reply::Fail => Source::Fail,
        Reply::Wait(_) => Source::Stop,
    }
}

/// Opened match first when it needs work, then every local re-grade, then fetches. Match ids grow with time, so
/// descending id is newest first. Stored records outside `history_ids` are still in scope.
pub fn plan_run(opened: Option<u64>, records: &[GradeRecord], history_ids: &[u64], grade_version: &str) -> Vec<Job> {
    let by_id: HashMap<u64, &GradeRecord> = records.iter().map(|r| (r.match_id, r)).collect();
    let job_for = |id: u64| match freshness(by_id.get(&id).copied(), grade_version) {
        Freshness::Fresh => None,
        Freshness::Regrade => Some(Job::Regrade(id)),
        Freshness::Refetch | Freshness::Missing => Some(Job::Fetch(id)),
    };

    let mut ids: Vec<u64> = records.iter().map(|r| r.match_id).chain(history_ids.iter().copied()).collect();
    ids.sort_unstable_by(|a, b| b.cmp(a));
    ids.dedup();

    let first = opened.and_then(job_for);
    let jobs: Vec<Job> = ids.into_iter().filter(|id| Some(*id) != opened).filter_map(job_for).collect();
    let (regrades, fetches): (Vec<Job>, Vec<Job>) = jobs.into_iter().partition(|j| matches!(j, Job::Regrade(_)));
    first.into_iter().chain(regrades).chain(fetches).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_mvp::LOBBY_TOTALS_VERSION;

    const V: &str = "1:abc";
    const META: &str = include_str!("../../../../../../crates/ring1/dp-mvp/fixtures/lobby-118862917.json");

    fn record(match_id: u64) -> GradeRecord {
        let totals = dp_mvp::lobby_totals(&dp_mvp::LobbyMetadata::from_slice(META.as_bytes()).unwrap().match_info);
        let grade = dp_mvp::grade_lobby(&totals, &|name: &str| name.contains("stun"));
        GradeRecord {
            match_id,
            provisional: false,
            totals_version: LOBBY_TOTALS_VERSION,
            grade_version: V.into(),
            totals: Some(totals),
            grade: Some(grade),
            failed_runs: 0,
        }
    }

    fn regrade(match_id: u64) -> GradeRecord {
        GradeRecord { grade_version: "0:old".into(), ..record(match_id) }
    }

    fn refetch(match_id: u64) -> GradeRecord {
        GradeRecord { provisional: true, ..record(match_id) }
    }

    fn gave_up(match_id: u64) -> GradeRecord {
        GradeRecord { failed_runs: 3, totals: None, grade: None, ..refetch(match_id) }
    }

    #[test]
    fn the_opened_match_goes_first_when_it_needs_work() {
        let records = [regrade(5), refetch(9)];
        let plan = plan_run(Some(5), &records, &[9, 5], V);
        assert_eq!(plan, vec![Job::Regrade(5), Job::Fetch(9)]);
        let plan = plan_run(Some(5), &records, &[], V);
        assert_eq!(plan[0], Job::Regrade(5));
        let plan = plan_run(Some(3), &records, &[9, 3], V);
        assert_eq!(plan, vec![Job::Fetch(3), Job::Regrade(5), Job::Fetch(9)]);
    }

    #[test]
    fn a_fresh_or_given_up_opened_match_gets_no_job() {
        let records = [record(5), gave_up(6), regrade(7)];
        assert_eq!(plan_run(Some(5), &records, &[], V), vec![Job::Regrade(7)]);
        assert_eq!(plan_run(Some(6), &records, &[], V), vec![Job::Regrade(7)]);
    }

    #[test]
    fn local_regrades_come_before_every_fetch() {
        let records = [refetch(30), regrade(10), refetch(20), regrade(5)];
        let plan = plan_run(None, &records, &[30, 20, 10, 5], V);
        assert_eq!(plan, vec![Job::Regrade(10), Job::Regrade(5), Job::Fetch(30), Job::Fetch(20)]);
    }

    #[test]
    fn fetches_run_newest_first_across_stored_and_history_ids() {
        let records = [refetch(4), refetch(8)];
        let plan = plan_run(None, &records, &[2, 6, 10], V);
        assert_eq!(plan, vec![Job::Fetch(10), Job::Fetch(8), Job::Fetch(6), Job::Fetch(4), Job::Fetch(2)]);
    }

    #[test]
    fn history_ids_without_a_record_are_fetched() {
        assert_eq!(plan_run(None, &[], &[3, 4], V), vec![Job::Fetch(4), Job::Fetch(3)]);
    }

    #[test]
    fn fresh_and_given_up_records_are_skipped_and_never_duplicated() {
        let records = [record(1), gave_up(2), refetch(3), refetch(3)];
        let plan = plan_run(None, &records, &[1, 2, 3, 4, 4], V);
        assert_eq!(plan, vec![Job::Fetch(4), Job::Fetch(3)]);
    }

    #[test]
    fn stored_records_beyond_the_history_window_are_still_planned() {
        let plan = plan_run(None, &[refetch(1), regrade(2)], &[100], V);
        assert_eq!(plan, vec![Job::Regrade(2), Job::Fetch(100), Job::Fetch(1)]);
    }

    #[test]
    fn an_ineligible_record_is_fresh() {
        let ineligible = GradeRecord { totals: None, grade: None, grade_version: "0:old".into(), ..record(1) };
        assert!(plan_run(None, &[ineligible], &[1], V).is_empty());
    }

    #[test]
    fn replies_map_to_run_outcomes() {
        let s = Duration::from_secs;
        assert_eq!(source_from(Reply::Ok), Source::Got);
        assert_eq!(source_from(Reply::NotYet), Source::NotYet);
        assert_eq!(source_from(Reply::Fail), Source::Fail);
        assert_eq!(source_from(Reply::Wait(s(30))), Source::Stop);
        assert_eq!(source_from(Reply::Wait(s(3600))), Source::Stop);
    }

    #[test]
    fn only_not_yet_and_fail_count_as_failed_runs() {
        assert!(Source::NotYet.counts_as_failure());
        assert!(Source::Fail.counts_as_failure());
        assert!(!Source::Got.counts_as_failure());
        assert!(!Source::Stop.counts_as_failure());
    }

    #[test]
    fn fetches_are_paced_one_second_apart() {
        assert_eq!(FETCH_GAP, Duration::from_secs(1));
    }
}
