use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use dp_ingest::pair::{pair, KnownMatch, Paired, Pairing, Reply};
use dp_ingest::record::Source;
use dp_ingest::salts::Salts;
use dp_live::{may_read, EngineConnection, LiveFacts, MemorySalts, Resident};
use dp_postgame::{Done, Stop, Worker};
use dp_sync::LockExt;
use tauri::{AppHandle, Manager};

use super::details::meta_url;
use super::send::{send, Sent};
use crate::features::gc::GcService;
use crate::features::ingest::IngestService;
use crate::features::live::link::GameLinkService;
use crate::http::Http;

const POLL: Duration = Duration::from_secs(1);
const READ_INTERVAL: Duration = Duration::from_secs(30);
/// How long the game must sit with nothing loaded and no server connection before it counts as the main menu. A
/// hop between servers can drop the connection for a moment while a match loads.
const MENU_SETTLE: Duration = Duration::from_secs(10);
const HEAD_TIMEOUT: Duration = Duration::from_secs(10);
const EXIT_WAIT: Duration = Duration::from_secs(3);

/// What one poll saw of the game.
#[derive(Clone, Debug)]
pub(crate) enum Seen {
    Detached,
    Loaded(LiveFacts),
    /// Attached with no match or Hideout loaded: the main menu or a map loading. `channel` is `None` when the net
    /// channel could not be read.
    Unloaded {
        channel: Option<EngineConnection>,
    },
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct Toggles {
    pub share: bool,
    pub gc: bool,
}

/// Everything the worker touches outside itself.
pub(crate) trait Env {
    fn seen(&mut self) -> Seen;
    fn account(&mut self) -> Option<u32>;
    fn read(&mut self, account: u32) -> Result<Resident, String>;
    fn toggles(&mut self) -> Toggles;
    fn local_accounts(&mut self) -> Vec<u32>;
    /// Whether Valve's CDN serves the match's `.meta.bz2`, which proves a guessed pairing.
    fn cdn_has(&mut self, salts: &Salts) -> bool;
    fn send(&mut self, salts: &[Salts]) -> Sent;
}

/// Reads are allowed out of a match, on the post-game screen, and in the main menu once it is certain: nothing
/// loaded and no net channel at every poll for [`MENU_SETTLE`]. Loading into a match has a channel to its server.
#[derive(Default)]
struct Gate {
    menu_since: Option<Instant>,
}

impl Gate {
    fn allows(&mut self, seen: &Seen, now: Instant) -> bool {
        if let Seen::Unloaded { channel: Some(channel) } = seen {
            if *channel == EngineConnection::NO_CHANNEL {
                let since = *self.menu_since.get_or_insert(now);
                return now.saturating_duration_since(since) >= MENU_SETTLE;
            }
        }
        self.menu_since = None;
        match seen {
            Seen::Loaded(facts) => may_read(Some(facts)),
            Seen::Detached | Seen::Unloaded { .. } => false,
        }
    }
}

type Key = (u64, Option<u32>, Option<u32>, Option<u32>);

fn key(salts: &Salts) -> Key {
    (salts.match_id, salts.cluster_id, salts.metadata_salt, salts.replay_salt)
}

/// Rule: a match with a player from an account signed in on this PC goes out under either toggle; any other match,
/// including one whose players are unknown, only under "Fill in missing match details".
fn may_share(players: Option<&[u32]>, local: &[u32], toggles: Toggles) -> bool {
    let own = players.is_some_and(|players| players.iter().any(|id| local.contains(id)));
    if own {
        toggles.share || toggles.gc
    } else {
        toggles.gc
    }
}

fn reply(r: &dp_live::MemoryReply) -> Reply {
    Reply {
        metadata_salt: r.metadata_salt,
        replay_salt: r.replay_salt.unwrap_or(0),
        cluster_id: r.cluster,
        valid_through: r.valid_through,
        processing_through: r.processing_through.unwrap_or(0),
    }
}

fn known(m: &dp_live::MemoryMatch) -> KnownMatch {
    KnownMatch { match_id: m.match_id, start: m.start, duration: m.duration, players: m.players.clone() }
}

#[derive(Default)]
pub(crate) struct Picker {
    gate: Gate,
    last_read: Option<Instant>,
    pending: bool,
    /// Salts the Deadlock API already took or the record already held.
    done: HashSet<Key>,
    /// CDN answers by match and metadata salt.
    checked: HashMap<(u64, Option<u32>), bool>,
}

impl Picker {
    /// One poll. Returns whether it read the game.
    pub(crate) fn tick<E: Env>(&mut self, env: &mut E, now: Instant, notified: bool) -> bool {
        self.pending |= notified;
        if !self.gate.allows(&env.seen(), now) {
            return false;
        }
        let due = self.pending || self.last_read.is_none_or(|at| now.saturating_duration_since(at) >= READ_INTERVAL);
        if !due {
            return false;
        }
        self.pending = false;
        self.last_read = Some(now);
        let Some(account) = env.account() else { return false };
        match env.read(account) {
            Ok(resident) => self.pick(env, account, &resident),
            Err(e) => log::debug!("memory salts: {e}"),
        }
        true
    }

    fn pick<E: Env>(&mut self, env: &mut E, account: u32, resident: &Resident) {
        let replies: Vec<Reply> = resident.replies.iter().map(reply).collect();
        let known: Vec<KnownMatch> = resident.matches.iter().map(known).collect();
        let paired = pair(&replies, &known);
        let fresh: Vec<Paired> = paired.iter().filter(|p| !self.done.contains(&key(&p.salts))).cloned().collect();
        log::debug!(
            "memory salts: {} reply(ies), {} match(es), {} paired, {} new",
            replies.len(),
            known.len(),
            paired.len(),
            fresh.len()
        );
        if fresh.is_empty() {
            return;
        }

        let toggles = env.toggles();
        if !toggles.share && !toggles.gc {
            return;
        }
        let local = env.local_accounts();
        let shareable =
            |p: &Paired, toggles: Toggles| may_share(p.players.as_deref(), &local, toggles).then_some(p.salts);
        let mut ready = Vec::new();
        for p in &fresh {
            let Some(salts) = shareable(p, toggles) else { continue };
            if p.pairing == Pairing::StartOnly && !self.verified(env, &salts) {
                continue;
            }
            ready.push(p);
        }
        if ready.is_empty() {
            return;
        }

        let toggles = env.toggles();
        let ready: Vec<Salts> = ready
            .into_iter()
            .filter_map(|p| shareable(p, toggles))
            .map(|salts| Salts { username: Some(account), ..salts })
            .collect();
        if ready.is_empty() {
            return;
        }
        let sent = env.send(&ready);
        for salts in &sent.salts {
            log::info!("picked up match {} from Deadlock", salts.match_id);
        }
        match &sent.error {
            None => self.done.extend(ready.iter().map(key)),
            Some(e) => {
                log::debug!("memory salts: send failed, retrying on the next read: {e}");
                self.done.extend(sent.salts.iter().map(key));
            }
        }
    }

    fn verified<E: Env>(&mut self, env: &mut E, salts: &Salts) -> bool {
        *self.checked.entry((salts.match_id, salts.metadata_salt)).or_insert_with(|| env.cdn_has(salts))
    }
}

/// Wakes the worker early. A wake that lands while it is busy is kept for its next wait.
#[derive(Default)]
struct Wake {
    pending: Mutex<bool>,
    changed: Condvar,
}

impl Wake {
    fn notify(&self) {
        *self.pending.lock_or_recover() = true;
        self.changed.notify_all();
    }

    /// Waits up to `timeout`; returns whether a wake came.
    fn wait(&self, timeout: Duration) -> bool {
        let guard = self.pending.lock_or_recover();
        let (mut guard, _) =
            self.changed.wait_timeout_while(guard, timeout, |pending| !*pending).unwrap_or_else(|e| e.into_inner());
        std::mem::take(&mut *guard)
    }
}

fn run<E: Env>(env: &mut E, stop: &Stop, wake: &Wake) {
    let mut picker = Picker::default();
    while !stop.is_stopped() {
        let notified = wake.wait(POLL);
        if stop.is_stopped() {
            break;
        }
        picker.tick(env, Instant::now(), notified);
    }
}

/// Picks up the matches resident in the running game, through the live link's reader.
#[derive(Default)]
pub struct MemorySaltsService {
    worker: Mutex<Option<Worker>>,
    wake: Arc<Wake>,
}

impl MemorySaltsService {
    /// Idempotent. The worker idles while the game is closed or in a match.
    pub fn start(&self, app: &AppHandle) {
        let mut slot = self.worker.lock_or_recover();
        if slot.is_some() {
            return;
        }
        let mut env = AppEnv { app: app.clone(), salts: MemorySalts::default() };
        let wake = Arc::clone(&self.wake);
        match Worker::spawn("memory-salts", None, move |stop| run(&mut env, stop, &wake)) {
            Ok(worker) => *slot = Some(worker),
            Err(e) => log::warn!("memory salts could not start: {e}"),
        }
    }

    /// Reads as soon as reads are allowed, without waiting for the next interval.
    pub fn notify(&self) {
        self.wake.notify();
    }

    pub fn stop(&self) {
        let done: Option<Done> = self.worker.lock_or_recover().take().map(|worker| worker.stop());
        self.wake.notify();
        if let Some(done) = done {
            done.wait(EXIT_WAIT);
        }
    }
}

struct AppEnv {
    app: AppHandle,
    salts: MemorySalts,
}

impl Env for AppEnv {
    fn seen(&mut self) -> Seen {
        let link = self.app.state::<GameLinkService>().handle();
        let Some(link) = link else { return Seen::Detached };
        match link.snapshot().value.as_deref() {
            None => {
                self.salts = MemorySalts::default();
                Seen::Detached
            }
            Some(None) => Seen::Unloaded { channel: link.connection() },
            Some(Some(read)) => Seen::Loaded(read.facts),
        }
    }

    fn account(&mut self) -> Option<u32> {
        dp_steam::current_steam_id32()
    }

    fn read(&mut self, account: u32) -> Result<Resident, String> {
        let reader = self.app.state::<GameLinkService>().handle().and_then(|link| link.reader());
        let reader = reader.ok_or_else(|| "the game is not attached".to_string())?;
        self.salts.read(&reader, account)
    }

    fn toggles(&mut self) -> Toggles {
        Toggles { share: self.app.state::<IngestService>().enabled(), gc: self.app.state::<GcService>().enabled() }
    }

    fn local_accounts(&mut self) -> Vec<u32> {
        dp_steam::local_account_ids()
    }

    fn cdn_has(&mut self, salts: &Salts) -> bool {
        let Some(url) = meta_url(salts) else { return false };
        let http = self.app.state::<Http>().0.clone();
        cdn_serves(&http, &url, salts.match_id)
    }

    fn send(&mut self, salts: &[Salts]) -> Sent {
        tauri::async_runtime::block_on(send(&self.app, salts, Source::Deadlock))
    }
}

/// `send` arms the request's timer as soon as it is called, so it must run inside the runtime, not on the worker.
fn cdn_serves(http: &reqwest::Client, url: &str, match_id: u64) -> bool {
    let head = tauri::async_runtime::block_on(async { http.head(url).timeout(HEAD_TIMEOUT).send().await });
    match head {
        Ok(r) if r.status() == reqwest::StatusCode::OK => true,
        Ok(r) => {
            log::debug!("memory salts: CDN answered {} for match {match_id}", r.status());
            false
        }
        Err(e) => {
            log::debug!("memory salts: CDN check failed for match {match_id}: {e}");
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::error::AppError;
    use dp_live::{Context, EngineRemote, MemoryMatch, MemoryReply, Phase};

    const DAY: u32 = 24 * 60 * 60;
    const ME: u32 = 1001;
    const START: u32 = 1_792_000_000;

    fn facts(context: Context, phase: Option<Phase>) -> Seen {
        Seen::Loaded(LiveFacts { context, phase, ..LiveFacts::default() })
    }

    fn menu() -> Seen {
        Seen::Unloaded { channel: Some(EngineConnection::NO_CHANNEL) }
    }

    fn loading() -> Seen {
        Seen::Unloaded { channel: Some(EngineConnection { signon: Some(2), remote: Some(EngineRemote::SteamId(9)) }) }
    }

    fn post_game() -> Seen {
        facts(Context::Match, Some(Phase::PostGame))
    }

    /// A reply for match `n` whose `processing_through` gives an exact pairing.
    fn exact_reply(n: u32) -> MemoryReply {
        let start = START + n * 10_000;
        MemoryReply {
            metadata_salt: 500 + n,
            replay_salt: Some(900 + n),
            cluster: 400,
            valid_through: start + 21 * DAY,
            processing_through: Some(start + 2000 + 20 * 60),
        }
    }

    /// A reply for match `n` with no `processing_through`: its pairing rests on the start alone.
    fn old_reply(n: u32) -> MemoryReply {
        MemoryReply { replay_salt: None, processing_through: None, ..exact_reply(n) }
    }

    fn row(n: u32, players: Option<Vec<u32>>) -> MemoryMatch {
        MemoryMatch { match_id: 100_000_000 + u64::from(n), start: START + n * 10_000, duration: 2000, players }
    }

    fn salts_of(reply: &MemoryReply, n: u32) -> Salts {
        Salts {
            match_id: 100_000_000 + u64::from(n),
            cluster_id: Some(reply.cluster),
            metadata_salt: Some(reply.metadata_salt),
            replay_salt: reply.replay_salt,
            username: Some(ME),
        }
    }

    struct Fake {
        seen: Seen,
        resident: Resident,
        toggles: Toggles,
        local: Vec<u32>,
        cdn: bool,
        fail_send: bool,
        reads: usize,
        heads: Vec<u64>,
        sent: Vec<Vec<Salts>>,
    }

    impl Fake {
        fn new(seen: Seen, resident: Resident, toggles: Toggles) -> Self {
            Fake {
                seen,
                resident,
                toggles,
                local: vec![ME, 2002],
                cdn: true,
                fail_send: false,
                reads: 0,
                heads: Vec::new(),
                sent: Vec::new(),
            }
        }

        fn posted(&self) -> Vec<Salts> {
            self.sent.concat()
        }
    }

    impl Env for Fake {
        fn seen(&mut self) -> Seen {
            self.seen.clone()
        }

        fn account(&mut self) -> Option<u32> {
            Some(ME)
        }

        fn read(&mut self, _account: u32) -> Result<Resident, String> {
            self.reads += 1;
            Ok(self.resident.clone())
        }

        fn toggles(&mut self) -> Toggles {
            self.toggles
        }

        fn local_accounts(&mut self) -> Vec<u32> {
            self.local.clone()
        }

        fn cdn_has(&mut self, salts: &Salts) -> bool {
            self.heads.push(salts.match_id);
            self.cdn
        }

        fn send(&mut self, salts: &[Salts]) -> Sent {
            self.sent.push(salts.to_vec());
            if self.fail_send {
                return Sent { salts: Vec::new(), error: Some(AppError::network("offline")) };
            }
            Sent { salts: salts.to_vec(), error: None }
        }
    }

    const SHARE: Toggles = Toggles { share: true, gc: false };
    const GC: Toggles = Toggles { share: false, gc: true };
    const BOTH_OFF: Toggles = Toggles { share: false, gc: false };

    fn own_match() -> Resident {
        Resident { replies: vec![exact_reply(1)], matches: vec![row(1, Some(vec![7, ME]))] }
    }

    fn one_tick(fake: &mut Fake) -> bool {
        Picker::default().tick(fake, Instant::now(), false)
    }

    #[test]
    fn nothing_is_read_while_a_match_runs_even_when_woken() {
        for phase in
            [None, Some(Phase::MatchIntro), Some(Phase::Loading), Some(Phase::PreGame), Some(Phase::InProgress)]
        {
            let mut fake = Fake::new(facts(Context::Match, phase), own_match(), SHARE);
            let mut picker = Picker::default();
            let t0 = Instant::now();
            for s in 0..120 {
                picker.tick(&mut fake, t0 + Duration::from_secs(s), s % 7 == 0);
            }
            assert_eq!(fake.reads, 0, "{phase:?}");
            assert!(fake.sent.is_empty());
        }
    }

    #[test]
    fn drift_or_a_closed_game_never_reads() {
        let drifted = Seen::Loaded(LiveFacts { drift: true, context: Context::Hideout, ..LiveFacts::default() });
        for seen in [drifted, Seen::Detached] {
            let mut fake = Fake::new(seen, own_match(), SHARE);
            let mut picker = Picker::default();
            let t0 = Instant::now();
            for s in 0..60 {
                picker.tick(&mut fake, t0 + Duration::from_secs(s), true);
            }
            assert_eq!(fake.reads, 0);
        }
    }

    #[test]
    fn the_post_game_screen_and_the_hideout_read_at_once() {
        for seen in [post_game(), facts(Context::Hideout, None), facts(Context::Other, None)] {
            let mut fake = Fake::new(seen, own_match(), SHARE);
            assert!(one_tick(&mut fake));
            assert_eq!(fake.reads, 1);
        }
    }

    #[test]
    fn the_main_menu_reads_once_it_has_settled() {
        let mut fake = Fake::new(menu(), own_match(), SHARE);
        let mut picker = Picker::default();
        let t0 = Instant::now();
        assert!(!picker.tick(&mut fake, t0, true));
        assert!(!picker.tick(&mut fake, t0 + MENU_SETTLE - Duration::from_secs(1), false));
        assert!(picker.tick(&mut fake, t0 + MENU_SETTLE, false));
        assert_eq!(fake.reads, 1);
    }

    #[test]
    fn a_connection_seen_while_unloaded_restarts_the_menu_wait() {
        let mut fake = Fake::new(menu(), own_match(), SHARE);
        let mut picker = Picker::default();
        let t0 = Instant::now();
        picker.tick(&mut fake, t0, false);
        fake.seen = loading();
        picker.tick(&mut fake, t0 + Duration::from_secs(5), false);
        fake.seen = menu();
        picker.tick(&mut fake, t0 + Duration::from_secs(6), false);
        assert!(!picker.tick(&mut fake, t0 + MENU_SETTLE + Duration::from_secs(1), false));
        assert!(picker.tick(&mut fake, t0 + MENU_SETTLE + Duration::from_secs(6), false));
    }

    #[test]
    fn loading_or_an_unreadable_channel_never_counts_as_the_menu() {
        for seen in [loading(), Seen::Unloaded { channel: None }] {
            let mut fake = Fake::new(seen, own_match(), SHARE);
            let mut picker = Picker::default();
            let t0 = Instant::now();
            for s in 0..120 {
                picker.tick(&mut fake, t0 + Duration::from_secs(s), true);
            }
            assert_eq!(fake.reads, 0);
        }
    }

    #[test]
    fn reads_repeat_every_interval_and_a_wake_reads_early() {
        let mut fake = Fake::new(facts(Context::Hideout, None), own_match(), SHARE);
        let mut picker = Picker::default();
        let t0 = Instant::now();
        picker.tick(&mut fake, t0, false);
        picker.tick(&mut fake, t0 + Duration::from_secs(10), false);
        assert_eq!(fake.reads, 1);
        picker.tick(&mut fake, t0 + READ_INTERVAL, false);
        assert_eq!(fake.reads, 2);
        picker.tick(&mut fake, t0 + READ_INTERVAL + Duration::from_secs(1), true);
        assert_eq!(fake.reads, 3);
    }

    #[test]
    fn a_wake_during_a_match_reads_on_the_post_game_screen() {
        let mut fake = Fake::new(post_game(), own_match(), SHARE);
        let mut picker = Picker::default();
        let t0 = Instant::now();
        picker.tick(&mut fake, t0, false);
        fake.seen = facts(Context::Match, Some(Phase::InProgress));
        picker.tick(&mut fake, t0 + Duration::from_secs(5), true);
        fake.seen = post_game();
        picker.tick(&mut fake, t0 + Duration::from_secs(6), false);
        assert_eq!(fake.reads, 2);
    }

    #[test]
    fn nothing_is_posted_with_both_toggles_off() {
        let resident = Resident {
            replies: vec![exact_reply(1), old_reply(2)],
            matches: vec![row(1, Some(vec![ME])), row(2, None)],
        };
        let mut fake = Fake::new(post_game(), resident, BOTH_OFF);
        one_tick(&mut fake);
        assert!(fake.sent.is_empty());
        assert!(fake.heads.is_empty());
    }

    #[test]
    fn other_players_matches_never_go_out_under_share_alone() {
        let resident = Resident {
            replies: vec![exact_reply(1), exact_reply(2)],
            matches: vec![row(1, Some(vec![7, 8])), row(2, None)],
        };
        let mut fake = Fake::new(post_game(), resident.clone(), SHARE);
        one_tick(&mut fake);
        assert!(fake.sent.is_empty());

        let mut fake = Fake::new(post_game(), resident, GC);
        one_tick(&mut fake);
        assert_eq!(fake.posted(), vec![salts_of(&exact_reply(1), 1), salts_of(&exact_reply(2), 2)]);
    }

    #[test]
    fn an_own_match_goes_out_under_either_toggle_as_the_signed_in_account() {
        for toggles in [SHARE, GC] {
            let mut fake = Fake::new(post_game(), own_match(), toggles);
            one_tick(&mut fake);
            assert_eq!(fake.posted(), vec![salts_of(&exact_reply(1), 1)], "{toggles:?}");
            assert!(fake.heads.is_empty(), "an exact pairing needs no CDN check");
        }
    }

    #[test]
    fn a_match_of_another_signed_in_account_is_own() {
        let resident = Resident { replies: vec![exact_reply(1)], matches: vec![row(1, Some(vec![2002]))] };
        let mut fake = Fake::new(post_game(), resident, SHARE);
        one_tick(&mut fake);
        assert_eq!(fake.posted().len(), 1);
    }

    #[test]
    fn a_start_only_pairing_goes_out_only_when_the_cdn_has_it() {
        let resident = Resident { replies: vec![old_reply(3)], matches: vec![row(3, Some(vec![ME]))] };
        let mut fake = Fake::new(post_game(), resident.clone(), SHARE);
        one_tick(&mut fake);
        assert_eq!(fake.heads, vec![100_000_003]);
        assert_eq!(fake.posted(), vec![salts_of(&old_reply(3), 3)]);

        let mut fake = Fake::new(post_game(), resident, SHARE);
        fake.cdn = false;
        one_tick(&mut fake);
        assert_eq!(fake.heads, vec![100_000_003]);
        assert!(fake.sent.is_empty());
    }

    #[test]
    fn a_second_read_of_the_same_memory_sends_nothing_and_checks_nothing() {
        let resident = Resident {
            replies: vec![exact_reply(1), old_reply(2), old_reply(3)],
            matches: vec![row(1, Some(vec![ME])), row(2, Some(vec![ME])), row(3, None)],
        };
        let mut fake = Fake::new(post_game(), resident, GC);
        let mut picker = Picker::default();
        let t0 = Instant::now();
        picker.tick(&mut fake, t0, false);
        fake.cdn = false;
        picker.tick(&mut fake, t0 + Duration::from_secs(1), true);
        let (heads, sent) = (fake.heads.len(), fake.sent.len());
        assert_eq!((heads, sent), (2, 1));

        assert!(picker.tick(&mut fake, t0 + READ_INTERVAL + Duration::from_secs(1), false));
        assert_eq!(fake.reads, 3);
        assert_eq!((fake.heads.len(), fake.sent.len()), (heads, sent));
    }

    #[test]
    fn a_failed_send_goes_out_again_on_the_next_read() {
        let mut fake = Fake::new(post_game(), own_match(), SHARE);
        fake.fail_send = true;
        let mut picker = Picker::default();
        let t0 = Instant::now();
        picker.tick(&mut fake, t0, false);
        fake.fail_send = false;
        picker.tick(&mut fake, t0 + READ_INTERVAL, false);
        picker.tick(&mut fake, t0 + READ_INTERVAL * 2, false);
        assert_eq!(fake.sent.len(), 2);
    }

    #[test]
    fn a_match_held_back_by_the_toggles_goes_out_once_they_allow_it() {
        let resident = Resident { replies: vec![exact_reply(1)], matches: vec![row(1, None)] };
        let mut fake = Fake::new(post_game(), resident, SHARE);
        let mut picker = Picker::default();
        let t0 = Instant::now();
        picker.tick(&mut fake, t0, false);
        fake.toggles = GC;
        picker.tick(&mut fake, t0 + READ_INTERVAL, false);
        assert_eq!(fake.posted().len(), 1);
    }

    #[test]
    fn the_cdn_check_runs_on_a_worker_thread_with_no_runtime() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/1.meta.bz2", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            let mut request = [0u8; 1024];
            let n = stream.read(&mut request).unwrap();
            stream.write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: close\r\n\r\n").unwrap();
            String::from_utf8_lossy(&request[..n]).to_string()
        });
        let worker = std::thread::spawn(move || cdn_serves(&reqwest::Client::new(), &url, 1));
        assert!(worker.join().expect("the CDN check panicked"));
        assert!(server.join().unwrap().starts_with("HEAD /1.meta.bz2"));
    }

    #[test]
    fn a_wake_before_the_wait_is_not_lost() {
        let wake = Wake::default();
        wake.notify();
        assert!(wake.wait(Duration::from_secs(5)));
        assert!(!wake.wait(Duration::from_millis(1)));
    }
}
