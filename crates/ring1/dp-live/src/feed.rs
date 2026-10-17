use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::Arc;
use std::time::Instant;

use deadlock_reader::supervise::{Attached, ReaderSupervisor, DEFAULT_RETRY_INTERVAL};
use deadlock_reader::Reader;
use deadlock_walker::{Error as WalkerError, PartyQueue, PartyQueueState, PeImage, QueueFlag};

use crate::attach::{self, Outcome};
use crate::convert::{hideout_party_size, queue_state};
use crate::link::{Backend, LiveRead, ReadError, Snapshot};
use crate::party_policy::in_match;
use crate::probes::{ProbeFeed, QueueSource, PROBE_INTERVAL};
use crate::queue::{ProbeError, QueuePoller, QueueProbe, QueueState};
use crate::{board_from_snapshot, from_snapshot};

const CLIENT_MODULE: &str = "client.dll";

/// The live-facts side of a [`crate::GameLink`]: the supervised attach plus the reader that walks it.
#[derive(Default)]
pub struct SupervisedBackend {
    supervisor: Option<ReaderSupervisor>,
    reader: LiveReader,
}

impl SupervisedBackend {
    fn supervisor(&mut self) -> &mut ReaderSupervisor {
        self.supervisor.get_or_insert_with(|| ReaderSupervisor::new(DEFAULT_RETRY_INTERVAL))
    }
}

impl Backend for SupervisedBackend {
    type Reader = Arc<Reader>;

    fn acquire(&mut self) -> Option<Arc<Reader>> {
        match self.supervisor().acquire() {
            Attached::Fresh(r) => {
                attach::record(Outcome::Attached);
                self.reader.start(&r);
                Some(r)
            }
            Attached::Held(r) => Some(r),
            Attached::Failed(reason) => {
                log::warn!("game link could not attach to the game: {reason}");
                attach::record(Outcome::Failed(&reason));
                None
            }
            Attached::Absent => {
                attach::record(Outcome::Absent);
                None
            }
            Attached::Waiting => None,
        }
    }

    fn read(&mut self, reader: &Arc<Reader>) -> Result<Snapshot, ReadError> {
        self.reader.read_full(reader)
    }

    fn succeeded(&mut self) {
        self.supervisor().succeeded();
    }

    fn failed(&mut self) {
        self.supervisor().failed();
    }

    fn detach(&mut self) {
        self.reader.stop();
        self.supervisor().detach();
    }
}

/// Walks the attached game for one tick's facts and scoreboard. The queue-flag poll runs on its own thread, so a tick
/// only reads what that thread last published.
#[derive(Default)]
pub(crate) struct LiveReader {
    probes: ProbeFeed,
}

/// The client's solo search flag and the party's search start, both located from one copy of the client image.
/// Either may be missing on a build whose code no longer matches; the other still works.
struct ClientQueue {
    flag: Option<QueueFlag>,
    party: Option<PartyQueue>,
}

impl ClientQueue {
    fn build(reader: &Reader) -> Option<Self> {
        let mem = reader.memory();
        let image = match mem.module(CLIENT_MODULE).map_err(WalkerError::from).and_then(|m| PeImage::read(mem, &m)) {
            Ok(image) => image,
            Err(e) => {
                log::debug!("queue probe unavailable: {e}");
                return None;
            }
        };
        let flag = QueueFlag::from_image(mem, &image).inspect_err(|e| log::debug!("queue flag not found: {e}")).ok();
        let party = PartyQueue::from_image(mem, &image).inspect_err(|e| log::debug!("party queue not found: {e}")).ok();
        (flag.is_some() || party.is_some()).then_some(ClientQueue { flag, party })
    }

    fn read_flag(&mut self, reader: &Reader) -> Probed<QueueState> {
        let mem = reader.memory();
        let Some(flag) = self.flag.as_mut() else { return Ok(None) };
        flag.queueing(mem)
            .and_then(|queueing| match queueing {
                Some(true) => flag.request(mem).map(|request| Some(queue_state(true, request))),
                Some(false) => Ok(Some(queue_state(false, None))),
                None => Ok(None),
            })
            .map_err(probe_error)
    }

    fn read_party(&self, reader: &Reader) -> Probed<PartyQueueState> {
        self.party.as_ref().map_or(Ok(None), |party| party.read(reader.memory()).map_err(probe_error))
    }
}

impl QueueProbe for ClientQueue {
    type Mem = Reader;

    fn poll(&mut self, reader: &Reader) -> Probed<QueueState> {
        let ui = self.read_flag(reader);
        combine(ui, self.read_party(reader))
    }
}

fn probe_error(e: WalkerError) -> ProbeError {
    match e {
        WalkerError::WrongProcess => ProbeError::WrongProcess,
        e => {
            log::debug!("queue probe failed: {e}");
            ProbeError::Failed
        }
    }
}

impl LiveReader {
    /// Begins probing a freshly attached game, replacing any earlier probes.
    pub fn start(&mut self, reader: &Arc<Reader>) {
        if let Err(e) =
            self.probes.start(GameQueue { reader: Arc::clone(reader), poller: QueuePoller::default() }, PROBE_INTERVAL)
        {
            log::warn!("could not start the game probes: {e}");
        }
    }

    pub fn stop(&mut self) {
        self.probes.stop();
    }

    /// `Ok(None)` means the game is running but no match or hideout is loaded.
    pub fn read_full(&mut self, reader: &Reader) -> Result<Option<LiveRead>, ReadError> {
        // The reader walks foreign process memory; a bug in that walk must not take the app down.
        match catch_unwind(AssertUnwindSafe(|| reader.live_snapshot())) {
            Ok(Ok(snapshot)) => Ok(snapshot.as_ref().map(|snap| {
                let mut facts = from_snapshot(snap);
                let board = board_from_snapshot(snap);
                facts.party =
                    self.probes.party(Instant::now(), in_match(&facts), hideout_party_size(facts.context, &board));
                LiveRead { facts, board }
            })),
            Ok(Err(e)) => {
                log::debug!("live feed read failed: {e}");
                Err(ReadError::Failed)
            }
            Err(_) => {
                log::warn!("live feed reader panicked");
                Err(ReadError::Panicked)
            }
        }
    }
}

/// The queue probes, built on first use; the queue thread owns them.
struct GameQueue {
    reader: Arc<Reader>,
    poller: QueuePoller<ClientQueue>,
}

impl QueueSource for GameQueue {
    fn queueing(&mut self) -> Option<QueueState> {
        let reader = Arc::clone(&self.reader);
        self.poller.poll(Instant::now(), &reader, ClientQueue::build)
    }
}

type Probed<T> = Result<Option<T>, ProbeError>;

/// The solo flag's state with the party's search start on it. A party search never sets the solo flag, so a party
/// that is searching is reported even when the flag cannot be read.
fn combine(ui: Probed<QueueState>, party: Probed<PartyQueueState>) -> Probed<QueueState> {
    let party_start = match party {
        Err(ProbeError::WrongProcess) => return Err(ProbeError::WrongProcess),
        Err(ProbeError::Failed) | Ok(None) => None,
        Ok(Some(party)) => Some(u64::from(party.start_unix)).filter(|start| *start > 0),
    };
    match (ui, party_start) {
        (ui, None) => ui,
        (Err(ProbeError::WrongProcess), _) => Err(ProbeError::WrongProcess),
        (Ok(ui), party_start) => Ok(Some(QueueState { party_start, ..ui.unwrap_or_default() })),
        (Err(ProbeError::Failed), party_start) => Ok(Some(QueueState { party_start, ..QueueState::default() })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn party(start_unix: u32) -> Probed<PartyQueueState> {
        Ok(Some(PartyQueueState { start_unix }))
    }

    #[test]
    fn a_party_search_start_rides_on_the_flag_state() {
        let state = combine(Ok(Some(QueueState::default())), party(1_760_000_000));
        assert_eq!(state, Ok(Some(QueueState { party_start: Some(1_760_000_000), ..QueueState::default() })));
    }

    #[test]
    fn a_party_that_is_not_searching_has_no_start() {
        assert_eq!(combine(Ok(Some(QueueState::searching())), party(0)), Ok(Some(QueueState::searching())));
        assert_eq!(combine(Ok(None), party(0)), Ok(None));
    }

    #[test]
    fn no_party_leaves_the_flag_alone() {
        assert_eq!(combine(Ok(Some(QueueState::searching())), Ok(None)), Ok(Some(QueueState::searching())));
        assert_eq!(combine(Ok(None), Ok(None)), Ok(None));
    }

    #[test]
    fn a_failed_party_read_leaves_the_flag_alone() {
        assert_eq!(
            combine(Ok(Some(QueueState::searching())), Err(ProbeError::Failed)),
            Ok(Some(QueueState::searching()))
        );
    }

    #[test]
    fn a_failed_flag_read_keeps_the_party_search() {
        let state = combine(Err(ProbeError::Failed), party(1_760_000_000));
        assert_eq!(state, Ok(Some(QueueState { party_start: Some(1_760_000_000), ..QueueState::default() })));
        assert_eq!(combine(Err(ProbeError::Failed), party(0)), Err(ProbeError::Failed));
    }

    #[test]
    fn a_wrong_process_on_either_side_drops_the_probe() {
        assert_eq!(combine(Err(ProbeError::WrongProcess), party(5)), Err(ProbeError::WrongProcess));
        assert_eq!(
            combine(Ok(Some(QueueState::searching())), Err(ProbeError::WrongProcess)),
            Err(ProbeError::WrongProcess)
        );
    }
}
