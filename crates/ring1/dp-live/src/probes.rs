use std::io;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use deadlock_walker::QueueRequest;

use crate::convert::queue_state;
use crate::link::{lock, Stop};
use crate::queue::{QueueMerge, QueueState};
use crate::PartyFacts;

pub(crate) const PROBE_INTERVAL: Duration = Duration::from_secs(1);

/// The client's queue state. The first call copies the client image to find it; later calls are one small read.
pub(crate) trait QueueSource: Send + 'static {
    fn queueing(&mut self) -> Option<QueueState>;
}

/// The latest result of the probe thread, plus the one thing it needs to know from the tick.
#[derive(Default)]
struct Shared {
    /// Bumped on every start and stop. A probe that outlives its attach publishes under the old value and is dropped.
    epoch: u64,
    in_match: bool,
    queueing: Option<QueueState>,
}

struct Workers {
    stop: Arc<Stop>,
    #[cfg(test)]
    threads: Vec<thread::JoinHandle<()>>,
}

impl Drop for Workers {
    fn drop(&mut self) {
        self.stop.stop();
    }
}

fn unix_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

/// Runs a probe that walks foreign process memory; a bug in that walk must not take the app down.
fn guarded<T>(what: &str, f: impl FnOnce() -> T) -> Option<T> {
    let result = catch_unwind(AssertUnwindSafe(f));
    if result.is_err() {
        log::warn!("{what} probe panicked");
    }
    result.ok()
}

fn run_queue(mut source: impl QueueSource, shared: &Mutex<Shared>, epoch: u64, stop: &Stop, interval: Duration) {
    loop {
        if !lock(shared).in_match {
            let Some(queueing) = guarded("queue", || source.queueing()) else { break };
            let mut shared = lock(shared);
            if shared.epoch != epoch {
                break;
            }
            if !shared.in_match {
                shared.queueing = queueing;
            }
        }
        if stop.sleep(interval) {
            break;
        }
    }
}

/// The queue inputs as one debug line, only when they change: a party queue cannot be reproduced alone, so the line
/// is what a user's log shows of it.
#[derive(Default)]
struct QueueLog {
    last: Option<QueueLogInputs>,
}

type QueueLogInputs = (Option<bool>, u64, Option<QueueRequest>, Option<u32>);

impl QueueLog {
    fn line(
        &mut self,
        ui: Option<bool>,
        party_start: u64,
        party_request: Option<QueueRequest>,
        party_size: Option<u32>,
    ) -> Option<String> {
        let now = (ui, party_start, party_request, party_size);
        if self.last == Some(now) {
            return None;
        }
        self.last = Some(now);
        let unknown = || "unknown".to_owned();
        let none = || "none".to_owned();
        Some(format!(
            "queue ui={} party_start={party_start} mm={} gm={} party_size={}",
            ui.map_or_else(unknown, |f| f.to_string()),
            party_request.map_or_else(none, |r| r.match_mode.to_string()),
            party_request.map_or_else(none, |r| r.game_mode.to_string()),
            party_size.map_or_else(unknown, |n| n.to_string()),
        ))
    }
}

/// The tick's side of the probes: reads what the probe thread last published and never waits on it.
#[derive(Default)]
pub(crate) struct ProbeFeed {
    shared: Arc<Mutex<Shared>>,
    workers: Option<Workers>,
    queue: QueueMerge,
    /// The party size last seen in the hideout. A match scoreboard says nothing about the party, so the size is
    /// carried through the match.
    party_size: Option<u32>,
    log: QueueLog,
}

impl ProbeFeed {
    /// Replaces any running probe.
    pub fn start(&mut self, queue: impl QueueSource, interval: Duration) -> io::Result<()> {
        self.stop();
        let epoch = {
            let mut shared = lock(&self.shared);
            *shared = Shared { epoch: shared.epoch + 1, ..Shared::default() };
            shared.epoch
        };
        let stop = Arc::new(Stop::default());
        let s = Arc::clone(&self.shared);
        let st = Arc::clone(&stop);
        let queue_thread = thread::Builder::new()
            .name("game-probes-queue".into())
            .spawn(move || run_queue(queue, &s, epoch, &st, interval))?;
        self.workers = Some(Workers {
            stop,
            #[cfg(test)]
            threads: vec![queue_thread],
        });
        #[cfg(not(test))]
        drop(queue_thread);
        self.queue = QueueMerge::default();
        self.log = QueueLog::default();
        Ok(())
    }

    /// Signals the thread to stop; it is not joined, so a read already under way finishes unobserved.
    pub fn stop(&mut self) {
        self.workers = None;
        self.party_size = None;
        let mut shared = lock(&self.shared);
        *shared = Shared { epoch: shared.epoch + 1, ..Shared::default() };
    }

    #[cfg(test)]
    pub fn is_finished(&self) -> bool {
        self.workers.as_ref().is_none_or(|w| w.threads.iter().all(|t| t.is_finished()))
    }

    /// The party for this tick: the size from the hideout scoreboard (`hideout_size`, `None` anywhere else) with the
    /// client's queue state merged in. Nothing is known until the hideout has been seen once or a queue is reported.
    pub fn party(&mut self, now: Instant, in_match: bool, hideout_size: Option<u32>) -> Option<PartyFacts> {
        if hideout_size.is_some() {
            self.party_size = hideout_size;
        }
        let ui = {
            let mut shared = lock(&self.shared);
            shared.in_match = in_match;
            if in_match {
                shared.queueing = None;
            }
            shared.queueing
        };
        let party_start = ui.and_then(|ui| ui.party_start).unwrap_or(0);
        let party_request = ui.and_then(|ui| ui.party_request).filter(|_| party_start > 0);
        if let Some(line) = self.log.line(ui.map(|ui| ui.queueing), party_start, party_request, self.party_size) {
            log::debug!("{line}");
        }
        let party = match (self.party_size, party_start) {
            (size, start) if start > 0 => {
                let modes = queue_state(true, party_request);
                Some(PartyFacts {
                    size: size.unwrap_or(1),
                    queueing: true,
                    queued_secs: Some(unix_now().saturating_sub(start)),
                    match_mode: modes.match_mode,
                    game_mode: modes.game_mode,
                    bot_difficulty: modes.bot_difficulty,
                })
            }
            (size, _) => size.map(|size| PartyFacts { size, ..PartyFacts::default() }),
        };
        self.queue.merge(now, in_match, party, ui)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{GameMode, MatchMode};
    use std::sync::atomic::{AtomicUsize, Ordering};

    const FAST: Duration = Duration::from_millis(10);

    fn party(size: u32) -> PartyFacts {
        PartyFacts { size, ..PartyFacts::default() }
    }

    #[derive(Clone, Default)]
    struct Fake {
        delay: Duration,
        queueing: Option<QueueState>,
        panic: bool,
        queue_calls: Arc<AtomicUsize>,
    }

    impl QueueSource for Fake {
        fn queueing(&mut self) -> Option<QueueState> {
            self.queue_calls.fetch_add(1, Ordering::SeqCst);
            thread::sleep(self.delay);
            if self.panic {
                panic!("probe bug");
            }
            self.queueing
        }
    }

    fn wait_for<T>(mut f: impl FnMut() -> Option<T>) -> T {
        let t0 = Instant::now();
        loop {
            if let Some(v) = f() {
                return v;
            }
            assert!(t0.elapsed() < Duration::from_secs(3), "timed out");
            thread::sleep(Duration::from_millis(5));
        }
    }

    #[test]
    fn a_slow_source_never_delays_the_tick() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake { delay: Duration::from_secs(2), ..Fake::default() }, FAST).unwrap();
        let t0 = Instant::now();
        for _ in 0..5 {
            assert_eq!(feed.party(Instant::now(), false, Some(2)), Some(party(2)));
        }
        assert!(t0.elapsed() < Duration::from_millis(200), "tick blocked for {:?}", t0.elapsed());
    }

    #[test]
    fn nothing_is_known_until_the_hideout_has_been_seen() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake::default(), FAST).unwrap();
        assert_eq!(feed.party(Instant::now(), false, None), None);
        assert_eq!(feed.party(Instant::now(), false, Some(3)), Some(party(3)));
    }

    #[test]
    fn the_party_size_follows_the_hideout() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake::default(), FAST).unwrap();
        assert_eq!(feed.party(Instant::now(), false, Some(3)), Some(party(3)));
        assert_eq!(feed.party(Instant::now(), false, Some(1)), Some(party(1)));
    }

    #[test]
    fn a_match_keeps_the_last_hideout_size() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake::default(), FAST).unwrap();
        feed.party(Instant::now(), false, Some(4));
        assert_eq!(feed.party(Instant::now(), true, None), Some(party(4)));
        assert_eq!(feed.party(Instant::now(), false, None), Some(party(4)));
    }

    #[test]
    fn a_new_attach_forgets_the_party() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake::default(), FAST).unwrap();
        feed.party(Instant::now(), false, Some(4));
        feed.start(Fake::default(), FAST).unwrap();
        assert_eq!(feed.party(Instant::now(), false, None), None);
    }

    fn party_queue(start: u64) -> Option<QueueState> {
        Some(QueueState { party_start: Some(start), ..QueueState::default() })
    }

    #[test]
    fn the_solo_flag_reaches_the_tick() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake { queueing: Some(QueueState::searching()), ..Fake::default() }, FAST).unwrap();
        let p = wait_for(|| feed.party(Instant::now(), false, Some(1)).filter(|p| p.queueing));
        assert_eq!(p.size, 1);
    }

    #[test]
    fn a_party_queue_reaches_the_tick_without_the_solo_flag() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake { queueing: party_queue(unix_now() - 30), ..Fake::default() }, FAST).unwrap();
        let p = wait_for(|| feed.party(Instant::now(), false, Some(2)).filter(|p| p.queueing));
        assert_eq!(p.size, 2);
        assert!(p.queued_secs.is_some_and(|s| (30..=32).contains(&s)), "{:?}", p.queued_secs);
    }

    fn party_queue_for(start: u64, match_mode: u32, game_mode: u32) -> Option<QueueState> {
        let party_request = Some(QueueRequest { match_mode, game_mode, bot_difficulty: 0 });
        Some(QueueState { party_start: Some(start), party_request, ..QueueState::default() })
    }

    #[test]
    fn a_party_queue_carries_the_partys_mode_without_the_solo_flag() {
        let cases = [
            (4, 1, Some(MatchMode::Ranked), Some(GameMode::Normal)),
            (1, 1, Some(MatchMode::Unranked), Some(GameMode::Normal)),
            (1, 4, Some(MatchMode::Unranked), Some(GameMode::StreetBrawl)),
        ];
        for (mm, gm, want_mm, want_gm) in cases {
            let mut feed = ProbeFeed::default();
            feed.start(Fake { queueing: party_queue_for(unix_now() - 5, mm, gm), ..Fake::default() }, FAST).unwrap();
            let p = wait_for(|| feed.party(Instant::now(), false, Some(2)).filter(|p| p.queueing));
            assert_eq!((p.size, p.match_mode, p.game_mode, p.bot_difficulty), (2, want_mm, want_gm, None), "{mm} {gm}");
        }
    }

    #[test]
    fn a_party_queue_without_modes_has_no_mode() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake { queueing: party_queue(unix_now() - 5), ..Fake::default() }, FAST).unwrap();
        let p = wait_for(|| feed.party(Instant::now(), false, Some(2)).filter(|p| p.queueing));
        assert_eq!((p.match_mode, p.game_mode, p.bot_difficulty), (None, None, None));
    }

    #[test]
    fn the_partys_mode_wins_over_the_solo_request() {
        let ui = QueueState {
            queueing: true,
            match_mode: Some(MatchMode::Unranked),
            game_mode: Some(GameMode::StreetBrawl),
            ..party_queue_for(unix_now() - 5, 4, 1).unwrap()
        };
        let mut feed = ProbeFeed::default();
        feed.start(Fake { queueing: Some(ui), ..Fake::default() }, FAST).unwrap();
        let p = wait_for(|| feed.party(Instant::now(), false, Some(2)).filter(|p| p.queueing));
        assert_eq!((p.match_mode, p.game_mode), (Some(MatchMode::Ranked), Some(GameMode::Normal)));
    }

    #[test]
    fn a_zero_party_start_is_no_queue() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake { queueing: party_queue(0), ..Fake::default() }, FAST).unwrap();
        thread::sleep(Duration::from_millis(60));
        assert_eq!(feed.party(Instant::now(), false, Some(2)), Some(party(2)));
    }

    #[test]
    fn a_party_queue_before_the_hideout_size_is_known_is_a_party_of_one() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake { queueing: party_queue(unix_now() - 5), ..Fake::default() }, FAST).unwrap();
        let p = wait_for(|| feed.party(Instant::now(), false, None).filter(|p| p.queueing));
        assert_eq!(p.size, 1);
    }

    #[test]
    fn a_match_ends_the_party_queue() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake { queueing: party_queue(unix_now() - 5), ..Fake::default() }, FAST).unwrap();
        wait_for(|| feed.party(Instant::now(), false, Some(2)).filter(|p| p.queueing));
        assert_eq!(feed.party(Instant::now(), true, None), Some(party(2)));
    }

    #[test]
    fn a_queue_flag_without_a_known_party_is_a_party_of_one() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake { queueing: Some(QueueState::searching()), ..Fake::default() }, FAST).unwrap();
        let p = wait_for(|| feed.party(Instant::now(), false, None).filter(|p| p.queueing));
        assert_eq!(p.size, 1);
    }

    #[test]
    fn the_requested_mode_reaches_the_tick() {
        let ui = QueueState {
            queueing: true,
            match_mode: Some(MatchMode::Unranked),
            game_mode: Some(GameMode::StreetBrawl),
            bot_difficulty: None,
            party_start: None,
            party_request: None,
        };
        let mut feed = ProbeFeed::default();
        feed.start(Fake { queueing: Some(ui), ..Fake::default() }, FAST).unwrap();
        let p = wait_for(|| feed.party(Instant::now(), false, Some(1)).filter(|p| p.queueing));
        assert_eq!((p.match_mode, p.game_mode), (Some(MatchMode::Unranked), Some(GameMode::StreetBrawl)));
        assert_eq!(feed.party(Instant::now(), true, None).unwrap().match_mode, None);
    }

    #[test]
    fn a_match_is_not_polled_for_the_queue() {
        let fake = Fake { queueing: Some(QueueState::searching()), ..Fake::default() };
        let mut feed = ProbeFeed::default();
        feed.start(fake.clone(), FAST).unwrap();
        wait_for(|| feed.party(Instant::now(), false, Some(2)).filter(|p| p.queueing));
        let p = wait_for(|| feed.party(Instant::now(), true, None));
        assert_eq!(p, party(2));
        thread::sleep(Duration::from_millis(60));
        let calls = fake.queue_calls.load(Ordering::SeqCst);
        thread::sleep(Duration::from_millis(100));
        assert_eq!(fake.queue_calls.load(Ordering::SeqCst), calls);
    }

    #[test]
    fn the_queue_line_is_logged_once_per_change() {
        let mut log = QueueLog::default();
        assert_eq!(
            log.line(None, 0, None, None).as_deref(),
            Some("queue ui=unknown party_start=0 mm=none gm=none party_size=unknown")
        );
        assert_eq!(log.line(None, 0, None, None), None);
        let ranked = Some(QueueRequest { match_mode: 4, game_mode: 1, bot_difficulty: 0 });
        assert_eq!(
            log.line(Some(false), 1_760_000_000, ranked, Some(2)).as_deref(),
            Some("queue ui=false party_start=1760000000 mm=4 gm=1 party_size=2")
        );
        assert_eq!(log.line(Some(false), 1_760_000_000, ranked, Some(2)), None);
        let brawl = Some(QueueRequest { match_mode: 1, game_mode: 4, bot_difficulty: 0 });
        assert_eq!(
            log.line(Some(false), 1_760_000_000, brawl, Some(2)).as_deref(),
            Some("queue ui=false party_start=1760000000 mm=1 gm=4 party_size=2")
        );
        assert_eq!(
            log.line(Some(true), 0, None, Some(1)).as_deref(),
            Some("queue ui=true party_start=0 mm=none gm=none party_size=1")
        );
    }

    #[test]
    fn the_worker_stops_promptly() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake::default(), Duration::from_secs(60)).unwrap();
        feed.party(Instant::now(), false, Some(2));
        feed.stop();
        let t0 = Instant::now();
        while !feed.is_finished() {
            assert!(t0.elapsed() < Duration::from_secs(1), "worker did not stop");
            thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(feed.party(Instant::now(), false, None), None);
    }

    #[test]
    fn a_panicking_worker_leaves_the_tick_working() {
        let mut feed = ProbeFeed::default();
        feed.start(Fake { panic: true, ..Fake::default() }, FAST).unwrap();
        thread::sleep(Duration::from_millis(100));
        assert_eq!(feed.party(Instant::now(), false, Some(2)), Some(party(2)));
        feed.start(Fake::default(), FAST).unwrap();
        assert_eq!(feed.party(Instant::now(), false, Some(5)), Some(party(5)));
    }
}
