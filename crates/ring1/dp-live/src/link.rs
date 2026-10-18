use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::load_grace::LoadGrace;
use crate::{Board, LiveFacts};

pub const TICK_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReadError {
    /// The read failed; the next one may succeed.
    Failed,
    /// The reader panicked; the caller should drop its attach.
    Panicked,
}

/// One read of the running game: the facts presence code uses plus the scoreboard.
#[derive(Clone, Debug)]
pub struct LiveRead {
    pub facts: LiveFacts,
    pub board: Board,
}

/// What one tick saw while attached. `None` means the game is running but no match or hideout is loaded.
pub type Snapshot = Option<LiveRead>;

pub(crate) fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// The latest published value and how many times it changed.
pub struct Latest<T> {
    /// `None` while nothing is attached.
    pub value: Option<Arc<T>>,
    pub generation: u64,
}

impl<T> Clone for Latest<T> {
    fn clone(&self) -> Self {
        Latest { value: self.value.clone(), generation: self.generation }
    }
}

/// A shared cell holding one immutable `Arc` that readers can grab without waiting on a game read.
pub struct Slot<T> {
    inner: Arc<Mutex<Latest<T>>>,
}

impl<T> Clone for Slot<T> {
    fn clone(&self) -> Self {
        Slot { inner: Arc::clone(&self.inner) }
    }
}

impl<T> Default for Slot<T> {
    fn default() -> Self {
        Slot { inner: Arc::new(Mutex::new(Latest { value: None, generation: 0 })) }
    }
}

impl<T> Slot<T> {
    pub fn latest(&self) -> Latest<T> {
        lock(&self.inner).clone()
    }

    /// Every `Some` is new data and bumps the generation; `None` only bumps it when it clears a value.
    pub(crate) fn publish(&self, value: Option<T>) {
        let mut inner = lock(&self.inner);
        if value.is_none() && inner.value.is_none() {
            return;
        }
        inner.value = value.map(Arc::new);
        inner.generation += 1;
    }
}

/// Where a link gets its reader and how it reads through it.
pub trait Backend: Send + 'static {
    type Reader: Clone + Send + Sync + 'static;

    /// `None` while the game is not running, not attached yet, or attaching failed.
    fn acquire(&mut self) -> Option<Self::Reader>;
    fn read(&mut self, reader: &Self::Reader) -> Result<Snapshot, ReadError>;
    fn succeeded(&mut self);
    /// A failed read; a run of them makes the backend drop its attach.
    fn failed(&mut self);
    fn detach(&mut self);
}

struct Core<B: Backend> {
    backend: B,
    snapshot: Slot<Snapshot>,
    reader: Arc<Mutex<Option<B::Reader>>>,
}

impl<B: Backend> Core<B> {
    fn tick(&mut self) {
        let Some(reader) = self.backend.acquire() else {
            *lock(&self.reader) = None;
            self.snapshot.publish(None);
            return;
        };
        *lock(&self.reader) = Some(reader.clone());
        match self.backend.read(&reader) {
            Ok(read) => {
                self.backend.succeeded();
                self.snapshot.publish(Some(read));
            }
            Err(ReadError::Failed) => self.backend.failed(),
            Err(ReadError::Panicked) => {
                self.backend.detach();
                *lock(&self.reader) = None;
                self.snapshot.publish(None);
            }
        }
    }
}

#[derive(Default)]
pub(crate) struct Stop {
    stopped: Mutex<bool>,
    changed: Condvar,
}

impl Stop {
    pub(crate) fn stop(&self) {
        *lock(&self.stopped) = true;
        self.changed.notify_all();
    }

    /// Sleeps up to `duration`, waking early on stop. Returns whether stop was requested.
    pub(crate) fn sleep(&self, duration: Duration) -> bool {
        let guard = lock(&self.stopped);
        let (guard, _) =
            self.changed.wait_timeout_while(guard, duration, |stopped| !*stopped).unwrap_or_else(|e| e.into_inner());
        *guard
    }
}

/// The one follower of the running game: a thread that stays attached, reads once per tick, publishes the result
/// and lends out its reader. Stopping is signalled, not joined.
pub struct Link<B: Backend> {
    snapshot: Slot<Snapshot>,
    reader: Arc<Mutex<Option<B::Reader>>>,
    stop: Arc<Stop>,
    thread: Option<JoinHandle<()>>,
}

impl<B: Backend> Link<B> {
    pub fn start(backend: B) -> std::io::Result<Self> {
        Self::start_with(backend, TICK_INTERVAL)
    }

    fn start_with(backend: B, interval: Duration) -> std::io::Result<Self> {
        let snapshot = Slot::default();
        let reader = Arc::new(Mutex::new(None));
        let stop = Arc::new(Stop::default());
        let mut core = Core { backend, snapshot: snapshot.clone(), reader: Arc::clone(&reader) };
        let thread_stop = Arc::clone(&stop);
        let thread = thread::Builder::new().name("game-link".into()).spawn(move || loop {
            core.tick();
            if thread_stop.sleep(interval) {
                break;
            }
        })?;
        Ok(Link { snapshot, reader, stop, thread: Some(thread) })
    }

    pub fn snapshot(&self) -> Latest<Snapshot> {
        self.snapshot.latest()
    }

    /// A handle to read the snapshot from elsewhere, for example [`FactsFeed`].
    pub fn slot(&self) -> Slot<Snapshot> {
        self.snapshot.clone()
    }

    /// The attached reader, or `None` while detached. Clones share the attach.
    pub fn reader(&self) -> Option<B::Reader> {
        lock(&self.reader).clone()
    }

    pub fn stop(&self) {
        self.stop.stop();
    }

    pub fn is_finished(&self) -> bool {
        self.thread.as_ref().is_none_or(|t| t.is_finished())
    }
}

impl<B: Backend> Drop for Link<B> {
    fn drop(&mut self) {
        self.stop.stop();
        self.thread.take();
    }
}

/// Discord-side view of the snapshot: the facts with the load grace applied. Absent means no game.
pub struct FactsFeed {
    slot: Slot<Snapshot>,
    grace: LoadGrace,
}

impl FactsFeed {
    pub fn new(slot: Slot<Snapshot>) -> Self {
        FactsFeed { slot, grace: LoadGrace::default() }
    }

    /// `None` when the game is not running or attached, or nothing has been loaded for longer than the load grace.
    pub fn poll(&mut self) -> Option<LiveFacts> {
        self.poll_at(Instant::now())
    }

    fn poll_at(&mut self, now: Instant) -> Option<LiveFacts> {
        let Some(snapshot) = self.slot.latest().value else {
            self.grace.reset();
            return None;
        };
        self.grace.apply(snapshot.as_ref().as_ref().map(|read| read.facts), now)
    }
}

pub type PlatformReader = std::sync::Arc<deadlock_reader::Reader>;

pub type PlatformBackend = crate::feed::SupervisedBackend;

pub type GameLink = Link<PlatformBackend>;

impl GameLink {
    pub fn spawn() -> std::io::Result<Self> {
        Link::start(PlatformBackend::default())
    }

    /// The user's own ping, loss and jitter right now. `None` while detached, not connected to a server, or when
    /// the engine's net channel cannot be located (for example after a game patch).
    pub fn engine_ping(&self) -> Option<crate::EnginePing> {
        self.reader().and_then(|reader| crate::engine_ping::read(&reader))
    }

    /// What the game's net channel is connected to. `None` while detached or when the channel cannot be read, so
    /// the connection is unknown; [`crate::EngineConnection::NO_CHANNEL`] when the game has no net channel.
    pub fn connection(&self) -> Option<crate::EngineConnection> {
        self.reader().and_then(|reader| crate::connection::read(&reader))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Context;
    use std::collections::VecDeque;

    #[derive(Clone, Debug, PartialEq)]
    struct Fake(u32);

    #[derive(Default)]
    struct Script {
        acquire: VecDeque<Option<Fake>>,
        read: VecDeque<Result<Snapshot, ReadError>>,
        calls: Vec<&'static str>,
    }

    #[derive(Clone, Default)]
    struct FakeBackend(Arc<Mutex<Script>>);

    impl FakeBackend {
        fn acquires(&self, items: impl IntoIterator<Item = Option<u32>>) {
            lock(&self.0).acquire.extend(items.into_iter().map(|i| i.map(Fake)));
        }
        fn reads(&self, items: impl IntoIterator<Item = Result<Snapshot, ReadError>>) {
            lock(&self.0).read.extend(items);
        }
        fn calls(&self) -> Vec<&'static str> {
            lock(&self.0).calls.clone()
        }
    }

    impl Backend for FakeBackend {
        type Reader = Fake;
        fn acquire(&mut self) -> Option<Fake> {
            let mut s = lock(&self.0);
            s.calls.push("acquire");
            s.acquire.pop_front().flatten()
        }
        fn read(&mut self, _: &Fake) -> Result<Snapshot, ReadError> {
            let mut s = lock(&self.0);
            s.calls.push("read");
            s.read.pop_front().expect("scripted read")
        }
        fn succeeded(&mut self) {
            lock(&self.0).calls.push("succeeded");
        }
        fn failed(&mut self) {
            lock(&self.0).calls.push("failed");
        }
        fn detach(&mut self) {
            lock(&self.0).calls.push("detach");
        }
    }

    fn read(context: Context) -> Snapshot {
        Some(LiveRead { facts: LiveFacts { context, ..Default::default() }, board: Board::default() })
    }

    fn core(backend: FakeBackend) -> Core<FakeBackend> {
        Core { backend, snapshot: Slot::default(), reader: Arc::default() }
    }

    fn context_of(latest: &Latest<Snapshot>) -> Option<Context> {
        latest.value.as_ref().and_then(|s| s.as_ref().as_ref().map(|r| r.facts.context))
    }

    #[test]
    fn slot_starts_empty_and_publish_bumps_generation() {
        let slot = Slot::<u32>::default();
        assert!(slot.latest().value.is_none());
        assert_eq!(slot.latest().generation, 0);
        slot.publish(Some(7));
        let a = slot.latest();
        assert_eq!((a.value.as_deref().copied(), a.generation), (Some(7), 1));
        slot.publish(Some(7));
        assert_eq!(slot.latest().generation, 2);
    }

    #[test]
    fn slot_clearing_bumps_once_and_clearing_empty_does_not() {
        let slot = Slot::<u32>::default();
        slot.publish(None);
        assert_eq!(slot.latest().generation, 0);
        slot.publish(Some(1));
        slot.publish(None);
        slot.publish(None);
        let l = slot.latest();
        assert!(l.value.is_none());
        assert_eq!(l.generation, 2);
    }

    #[test]
    fn readers_keep_the_value_they_grabbed() {
        let slot = Slot::<u32>::default();
        slot.publish(Some(1));
        let held = slot.latest();
        slot.publish(Some(2));
        assert_eq!(held.value.as_deref(), Some(&1));
    }

    #[test]
    fn a_successful_tick_publishes_and_lends_the_reader() {
        let b = FakeBackend::default();
        b.acquires([Some(1)]);
        b.reads([Ok(read(Context::Match))]);
        let mut c = core(b.clone());
        c.tick();
        assert_eq!(context_of(&c.snapshot.latest()), Some(Context::Match));
        assert_eq!(*lock(&c.reader), Some(Fake(1)));
        assert_eq!(b.calls(), ["acquire", "read", "succeeded"]);
    }

    #[test]
    fn attach_loss_publishes_none_and_drops_the_reader() {
        let b = FakeBackend::default();
        b.acquires([Some(1), None]);
        b.reads([Ok(read(Context::Hideout))]);
        let mut c = core(b);
        c.tick();
        c.tick();
        assert!(c.snapshot.latest().value.is_none());
        assert!(lock(&c.reader).is_none());
    }

    #[test]
    fn game_running_with_nothing_loaded_is_not_absent() {
        let b = FakeBackend::default();
        b.acquires([Some(1)]);
        b.reads([Ok(None)]);
        let mut c = core(b);
        c.tick();
        let latest = c.snapshot.latest();
        assert!(latest.value.is_some());
        assert_eq!(context_of(&latest), None);
    }

    #[test]
    fn a_panic_detaches_and_a_later_tick_rebuilds() {
        let b = FakeBackend::default();
        b.acquires([Some(1), Some(1), Some(2)]);
        b.reads([Ok(read(Context::Match)), Err(ReadError::Panicked), Ok(read(Context::Hideout))]);
        let mut c = core(b.clone());
        c.tick();
        c.tick();
        assert!(c.snapshot.latest().value.is_none());
        assert!(lock(&c.reader).is_none());
        assert!(b.calls().contains(&"detach"));
        c.tick();
        assert_eq!(context_of(&c.snapshot.latest()), Some(Context::Hideout));
        assert_eq!(*lock(&c.reader), Some(Fake(2)));
    }

    #[test]
    fn failures_under_budget_keep_the_attach_and_the_last_snapshot() {
        let b = FakeBackend::default();
        b.acquires([Some(1), Some(1), Some(1)]);
        b.reads([Ok(read(Context::Match)), Err(ReadError::Failed), Err(ReadError::Failed)]);
        let mut c = core(b.clone());
        c.tick();
        c.tick();
        c.tick();
        assert_eq!(context_of(&c.snapshot.latest()), Some(Context::Match));
        assert_eq!(*lock(&c.reader), Some(Fake(1)));
        let calls = b.calls();
        assert_eq!(calls.iter().filter(|c| **c == "failed").count(), 2);
        assert!(!calls.contains(&"detach"));
    }

    #[test]
    fn generation_moves_only_on_new_data() {
        let b = FakeBackend::default();
        b.acquires([Some(1), Some(1), Some(1), None, None]);
        b.reads([Ok(read(Context::Match)), Err(ReadError::Failed), Ok(read(Context::Match))]);
        let mut c = core(b);
        let gens: Vec<u64> = (0..5)
            .map(|_| {
                c.tick();
                c.snapshot.latest().generation
            })
            .collect();
        assert_eq!(gens, [1, 1, 2, 3, 3]);
    }

    #[test]
    fn the_thread_publishes_and_stops_quickly() {
        let b = FakeBackend::default();
        b.acquires([Some(1)]);
        b.reads([Ok(read(Context::Match))]);
        let link = Link::start_with(b, Duration::from_secs(60)).unwrap();
        let t0 = Instant::now();
        while link.snapshot().value.is_none() {
            assert!(t0.elapsed() < Duration::from_secs(5), "no snapshot published");
            thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(link.reader(), Some(Fake(1)));
        link.stop();
        let t1 = Instant::now();
        while !link.is_finished() {
            assert!(t1.elapsed() < Duration::from_secs(1), "thread did not stop");
            thread::sleep(Duration::from_millis(5));
        }
    }

    fn feed_with(first: Option<Snapshot>) -> (Slot<Snapshot>, FactsFeed) {
        let slot = Slot::default();
        let feed = FactsFeed::new(slot.clone());
        slot.publish(first);
        (slot, feed)
    }

    #[test]
    fn the_feed_reports_facts_and_holds_them_through_a_gap() {
        let (slot, mut feed) = feed_with(Some(read(Context::Match)));
        let t0 = Instant::now();
        assert_eq!(feed.poll_at(t0).map(|f| f.context), Some(Context::Match));
        slot.publish(Some(None));
        assert_eq!(feed.poll_at(t0 + Duration::from_secs(5)).map(|f| f.context), Some(Context::Match));
        assert_eq!(feed.poll_at(t0 + Duration::from_secs(40)), None);
    }

    #[test]
    fn the_feed_resets_the_grace_when_the_game_is_absent() {
        let (slot, mut feed) = feed_with(Some(read(Context::Match)));
        let t0 = Instant::now();
        feed.poll_at(t0);
        slot.publish(None);
        assert_eq!(feed.poll_at(t0 + Duration::from_secs(1)), None);
        slot.publish(Some(None));
        assert_eq!(feed.poll_at(t0 + Duration::from_secs(2)), None, "grace must not survive a detach");
    }

    #[test]
    fn the_feed_is_empty_before_anything_is_published() {
        let (_slot, mut feed) = feed_with(None);
        assert_eq!(feed.poll_at(Instant::now()), None);
    }
}
