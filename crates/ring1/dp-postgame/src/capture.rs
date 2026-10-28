use std::io;
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::Arc;
use std::time::Duration;

use deadlock_events::{Engine, EngineHandle, Event, Notification, PostGameEvent, PostGameSource};
use deadlock_reader::Reader;

use crate::{detail_json, to_match, Done, PostGameMatch, Stop, Worker};

const TICK: Duration = Duration::from_secs(1);
/// How often the source snapshots the game to spot the post-game screen. Each one walks the whole live snapshot, and
/// the metadata read it waits for retries every 2 s anyway, so polling faster finds nothing sooner.
const SNAPSHOT_INTERVAL: Duration = Duration::from_secs(2);

/// An `Updated` read replaces the earlier `Captured` copy, so both map the same way.
pub fn from_event(event: &PostGameEvent, account_id: u32) -> Option<PostGameMatch> {
    match event {
        PostGameEvent::Captured { metadata, .. } | PostGameEvent::Updated { metadata, .. } => {
            to_match(metadata, account_id)
        }
        _ => None,
    }
}

/// `from_event` plus the whole message as API-shaped JSON. Only a read that maps to the account's row yields one.
pub fn from_event_detail(event: &PostGameEvent, account_id: u32) -> Option<(PostGameMatch, serde_json::Value)> {
    let game = from_event(event, account_id)?;
    let (PostGameEvent::Captured { metadata, .. } | PostGameEvent::Updated { metadata, .. }) = event else {
        return None;
    };
    Some((game, detail_json(metadata)))
}

/// Reads each finished match from the game's memory on its own thread, through whatever reader `reader` returns
/// (polled about once a second; `None` while the game is not attached). Dropping or stopping it only signals the
/// thread; it exits on its own within about a second.
pub struct Capture {
    worker: Worker,
}

impl Capture {
    /// `after` is the previous capture's `Done`, so the new thread never overlaps the old one.
    pub fn start(
        account_id: u32,
        after: Option<Done>,
        mut reader: impl FnMut() -> Option<Arc<Reader>> + Send + 'static,
        on_match: impl Fn(PostGameMatch, serde_json::Value) + Send + 'static,
    ) -> io::Result<Self> {
        let worker = Worker::spawn("postgame-capture", after, move |stop| {
            drive(
                stop,
                TICK,
                &mut reader,
                |reader| {
                    let source = PostGameSource::new(Arc::clone(reader), account_id).every(SNAPSHOT_INTERVAL);
                    let (engine, rx) = Engine::new().with(source).start()?;
                    Ok(EngineSession { engine, rx })
                },
                &mut |event| match &event {
                    PostGameEvent::Missed { match_id, attempts } => {
                        log::info!("post-game metadata for match {match_id} was not resident after {attempts} reads");
                    }
                    _ => {
                        if let Some((game, detail)) = from_event_detail(&event, account_id) {
                            on_match(game, detail);
                        }
                    }
                },
            )
        })?;
        Ok(Capture { worker })
    }

    pub fn stop(self) -> Done {
        self.worker.stop()
    }
}

enum Recv {
    Event(PostGameEvent),
    Idle,
    Closed,
}

trait Session {
    fn is_running(&self) -> bool;
    fn recv(&mut self, timeout: Duration) -> Recv;
    fn stop(&mut self);
}

struct EngineSession {
    engine: EngineHandle,
    rx: Receiver<Notification>,
}

impl Session for EngineSession {
    fn is_running(&self) -> bool {
        self.engine.is_running()
    }

    fn recv(&mut self, timeout: Duration) -> Recv {
        match self.rx.recv_timeout(timeout) {
            Ok(Notification::Event { event: Event::PostGame(event), .. }) => Recv::Event(event),
            Ok(_) | Err(RecvTimeoutError::Timeout) => Recv::Idle,
            Err(RecvTimeoutError::Disconnected) => Recv::Closed,
        }
    }

    fn stop(&mut self) {
        self.engine.stop();
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Step {
    /// No reader and no session.
    Wait,
    Start,
    Keep,
    /// The session is dead or belongs to an old attach; start over if a reader is present.
    Drop,
}

fn decide<R>(session: Option<(&Arc<R>, bool)>, current: Option<&Arc<R>>) -> Step {
    match (session, current) {
        (None, None) => Step::Wait,
        (None, Some(_)) => Step::Start,
        (Some((held, running)), Some(now)) if running && Arc::ptr_eq(held, now) => Step::Keep,
        (Some(_), _) => Step::Drop,
    }
}

/// Keeps one session alive per attach. A sleep or receive wait of `interval` paces every pass.
fn drive<R, S: Session>(
    shutdown: &Stop,
    interval: Duration,
    source: &mut dyn FnMut() -> Option<Arc<R>>,
    mut start: impl FnMut(&Arc<R>) -> io::Result<S>,
    on_event: &mut dyn FnMut(PostGameEvent),
) {
    let mut active: Option<(Arc<R>, S)> = None;
    while !shutdown.is_stopped() {
        let current = source();
        let step = decide(active.as_ref().map(|(r, s)| (r, s.is_running())), current.as_ref());
        match step {
            Step::Keep => {}
            Step::Wait => {
                shutdown.sleep(interval);
                continue;
            }
            Step::Drop | Step::Start => {
                if let Some((_, mut old)) = active.take() {
                    old.stop();
                }
                let Some(reader) = current else {
                    shutdown.sleep(interval);
                    continue;
                };
                match start(&reader) {
                    Ok(session) => active = Some((reader, session)),
                    Err(e) => {
                        log::warn!("post-game capture could not start: {e}");
                        shutdown.sleep(interval);
                        continue;
                    }
                }
            }
        }
        let Some((_, session)) = active.as_mut() else { continue };
        match session.recv(interval) {
            Recv::Event(event) => on_event(event),
            Recv::Idle => {}
            Recv::Closed => {
                if let Some((_, mut old)) = active.take() {
                    old.stop();
                }
            }
        }
    }
    if let Some((_, mut old)) = active.take() {
        old.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use valveprotos::deadlock::c_msg_match_meta_data_contents::{MatchInfo, Players};
    use valveprotos::deadlock::CMsgMatchMetaDataContents;

    const ME: u32 = 7;

    fn meta(kills: u32) -> Box<CMsgMatchMetaDataContents> {
        Box::new(CMsgMatchMetaDataContents {
            match_info: Some(MatchInfo {
                match_id: Some(9),
                start_time: Some(1),
                players: vec![Players {
                    account_id: Some(ME),
                    hero_id: Some(1),
                    team: Some(0),
                    kills: Some(kills),
                    ..Default::default()
                }],
                ..Default::default()
            }),
        })
    }

    #[test]
    fn the_full_message_comes_out_beside_the_match_and_updated_replaces_captured() {
        let captured = PostGameEvent::Captured { match_id: 9, metadata: meta(3) };
        let updated = PostGameEvent::Updated { match_id: 9, metadata: meta(4) };
        let missed = PostGameEvent::Missed { match_id: 9, attempts: 5 };
        let (game, detail) = from_event_detail(&captured, ME).unwrap();
        assert_eq!((game.kills, detail["match_info"]["players"][0]["kills"].as_u64()), (3, Some(3)));
        let (game, detail) = from_event_detail(&updated, ME).unwrap();
        assert_eq!((game.kills, detail["match_info"]["players"][0]["kills"].as_u64()), (4, Some(4)));
        assert_eq!(game.match_id, detail["match_info"]["match_id"]);
        assert!(from_event_detail(&missed, ME).is_none());
    }

    #[test]
    fn captured_and_updated_map_and_missed_does_not() {
        let captured = PostGameEvent::Captured { match_id: 9, metadata: meta(3) };
        let updated = PostGameEvent::Updated { match_id: 9, metadata: meta(4) };
        let missed = PostGameEvent::Missed { match_id: 9, attempts: 5 };
        assert_eq!(from_event(&captured, ME).unwrap().kills, 3);
        assert_eq!(from_event(&updated, ME).unwrap().kills, 4);
        assert_eq!(from_event(&missed, ME), None);
    }

    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;
    use std::time::Instant;

    const FAST: Duration = Duration::from_millis(2);

    #[derive(Default)]
    struct Log {
        started: Vec<u32>,
        stopped: usize,
    }

    struct FakeSession {
        running: bool,
        log: Arc<Mutex<Log>>,
    }

    impl Session for FakeSession {
        fn is_running(&self) -> bool {
            self.running
        }
        fn recv(&mut self, timeout: Duration) -> Recv {
            std::thread::sleep(timeout);
            Recv::Idle
        }
        fn stop(&mut self) {
            self.log.lock().unwrap().stopped += 1;
        }
    }

    /// Runs `drive` on a scripted reader sequence; the last item repeats until `passes` source calls were made.
    fn run_script(script: Vec<Option<Arc<u32>>>, passes: usize, running: bool) -> Log {
        let stop = Stop::default();
        let log = Arc::new(Mutex::new(Log::default()));
        let calls = AtomicUsize::new(0);
        let mut source = || {
            let n = calls.fetch_add(1, Ordering::SeqCst);
            if n + 1 >= passes {
                stop.stop();
            }
            script.get(n).or(script.last()).cloned().flatten()
        };
        let l = Arc::clone(&log);
        drive(
            &stop,
            FAST,
            &mut source,
            |r: &Arc<u32>| {
                l.lock().unwrap().started.push(**r);
                Ok(FakeSession { running, log: Arc::clone(&l) })
            },
            &mut |_| {},
        );
        let out = std::mem::take(&mut *log.lock().unwrap());
        out
    }

    #[test]
    fn no_reader_never_starts_the_engine() {
        let log = run_script(vec![None], 4, true);
        assert!(log.started.is_empty());
        assert_eq!(log.stopped, 0);
    }

    #[test]
    fn the_same_reader_keeps_one_engine() {
        let a = Arc::new(1);
        let log = run_script(vec![Some(Arc::clone(&a))], 5, true);
        assert_eq!(log.started, [1]);
        assert_eq!(log.stopped, 1, "only the final shutdown stops it");
    }

    #[test]
    fn a_new_attach_restarts_the_engine() {
        let (a, b) = (Arc::new(1), Arc::new(2));
        let log = run_script(vec![Some(Arc::clone(&a)), Some(Arc::clone(&a)), Some(b)], 5, true);
        assert_eq!(log.started, [1, 2]);
        assert_eq!(log.stopped, 2);
    }

    #[test]
    fn a_reader_equal_in_value_but_not_identity_still_restarts() {
        let log = run_script(vec![Some(Arc::new(1)), Some(Arc::new(1))], 3, true);
        assert_eq!(log.started, [1, 1]);
    }

    #[test]
    fn losing_the_reader_stops_the_engine_and_a_return_starts_a_new_one() {
        let a = Arc::new(1);
        let log = run_script(vec![Some(Arc::clone(&a)), None, Some(a)], 4, true);
        assert_eq!(log.started, [1, 1]);
        assert_eq!(log.stopped, 2);
    }

    #[test]
    fn a_stopped_engine_restarts_on_the_same_reader() {
        let a = Arc::new(1);
        let log = run_script(vec![Some(a)], 4, false);
        assert!(log.started.len() >= 2);
    }

    #[test]
    fn stop_exits_promptly_while_waiting_for_a_reader() {
        let worker = Worker::spawn("t", None, |stop| {
            drive::<u32, FakeSession>(
                stop,
                Duration::from_secs(60),
                &mut || None,
                |_| unreachable!("no reader"),
                &mut |_| {},
            )
        })
        .unwrap();
        std::thread::sleep(Duration::from_millis(50));
        let began = Instant::now();
        assert!(worker.stop().wait(Duration::from_secs(5)));
        assert!(began.elapsed() < Duration::from_secs(1));
    }
}
