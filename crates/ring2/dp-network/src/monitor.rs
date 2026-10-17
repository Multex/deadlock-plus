use std::collections::{HashMap, VecDeque};
use std::future::Future;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::history_store::{Compaction, HistoryStore};
use crate::types::{HistoryPoint, PingStats, RelayInfo, Snapshot};
use dp_connection::{Config, Packet, Start, Status};
use dp_sync::{LockExt, RwLockExt};

const PING_WINDOW: usize = 60;
const PING_KEEP: usize = 120;
const HISTORY_KEEP: usize = 900;
const HISTORY_STORE_KEEP: usize = 20_000;
const MIN_RELAY_PACKETS_PER_SEC: f32 = 15.0;

#[derive(Clone, Copy, Hash, PartialEq, Eq)]
struct FlowKey {
    ip: Ipv4Addr,
    port: u16,
}

#[derive(Default)]
struct FlowAgg {
    pkts_in: u32,
    pkts_out: u32,
    last_in: Option<i64>,
    max_in_gap_ms: f32,
}

#[derive(Clone, Debug)]
pub struct PopInfo {
    pub code: String,
    pub description: String,
    pub country_code: Option<String>,
}

pub type RelayMap = HashMap<Ipv4Addr, PopInfo>;

/// Yields the current relay address to PoP mapping. Called again every hour, and every 30 s after a failure.
pub type RelaySource = Arc<dyn Fn() -> Pin<Box<dyn Future<Output = Result<RelayMap, String>> + Send>> + Send + Sync>;

#[derive(Default)]
struct Targets {
    relay: Option<Ipv4Addr>,
}

struct Shared {
    window: Mutex<HashMap<FlowKey, FlowAgg>>,
    game_pid: AtomicU32,
    relay_map: RwLock<RelayMap>,
    targets: Mutex<Targets>,
    pings: Mutex<HashMap<Ipv4Addr, VecDeque<Option<f32>>>>,
    snapshot: Mutex<Snapshot>,
    history: Mutex<VecDeque<HistoryPoint>>,
    store: Mutex<StoreState>,
    stop: AtomicBool,
}

/// The history log opens off the starting thread. Points sampled before it is ready wait here so none are lost.
enum StoreState {
    Loading(Vec<HistoryPoint>),
    Ready(HistoryStore),
    Unavailable,
}

impl Shared {
    fn new() -> Self {
        Self {
            window: Mutex::default(),
            game_pid: AtomicU32::new(0),
            relay_map: RwLock::default(),
            targets: Mutex::default(),
            pings: Mutex::default(),
            snapshot: Mutex::new(Snapshot { monitoring: true, ..Default::default() }),
            history: Mutex::default(),
            store: Mutex::new(StoreState::Loading(Vec::new())),
            stop: AtomicBool::new(false),
        }
    }
}

struct Running {
    shared: Arc<Shared>,
    stop_trace: Sender<()>,
}

#[derive(Default)]
pub struct NetworkMonitor {
    running: Mutex<Option<Running>>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn ping_stats(samples: Option<&VecDeque<Option<f32>>>) -> PingStats {
    let Some(samples) = samples else {
        return PingStats::default();
    };
    let recent: Vec<Option<f32>> = samples.iter().rev().take(PING_WINDOW).copied().collect();
    if recent.is_empty() {
        return PingStats::default();
    }

    let ok: Vec<f32> = recent.iter().flatten().copied().collect();
    let loss_pct = 100.0 * (recent.len() - ok.len()) as f32 / recent.len() as f32;
    if ok.is_empty() {
        return PingStats { loss_pct, samples: recent.len() as u32, ..Default::default() };
    }

    let avg = ok.iter().sum::<f32>() / ok.len() as f32;
    // Jitter as the mean absolute difference between consecutive successful samples (chronological).
    let chrono: Vec<f32> = recent.iter().rev().flatten().copied().collect();
    let jitter = if chrono.len() > 1 {
        chrono.windows(2).map(|w| (w[1] - w[0]).abs()).sum::<f32>() / (chrono.len() - 1) as f32
    } else {
        0.0
    };

    PingStats {
        current: recent.first().copied().flatten(),
        avg: Some(avg),
        min: ok.iter().copied().reduce(f32::min),
        max: ok.iter().copied().reduce(f32::max),
        jitter: Some(jitter),
        loss_pct,
        samples: recent.len() as u32,
    }
}

fn latest(samples: Option<&VecDeque<Option<f32>>>) -> Option<f32> {
    samples.and_then(|s| s.back().copied().flatten())
}

fn flow_pps(flow: &FlowAgg, secs: f32) -> f32 {
    (flow.pkts_in + flow.pkts_out) as f32 / secs
}

fn pick_game_flow(window: &HashMap<FlowKey, FlowAgg>, secs: f32) -> Option<(&FlowKey, &FlowAgg)> {
    window
        .iter()
        .filter(|(k, f)| !k.ip.is_loopback() && flow_pps(f, secs) >= MIN_RELAY_PACKETS_PER_SEC)
        .max_by(|a, b| flow_pps(a.1, secs).total_cmp(&flow_pps(b.1, secs)))
}

impl NetworkMonitor {
    /// `prompt` says the user asked for this, so a permission prompt is acceptable.
    pub fn start(
        &self,
        runtime: &tokio::runtime::Handle,
        relays: RelaySource,
        history_path: PathBuf,
        prompt: bool,
        source: Start,
    ) {
        let mut guard = self.running.lock_or_recover();
        if let Some(running) = guard.as_ref() {
            let snap = running.shared.snapshot.lock_or_recover();
            let retry = snap.trace_error.is_some() || (snap.needs_permission && prompt);
            drop(snap);
            if !retry {
                return;
            }
            Self::shutdown(guard.take());
        }

        let shared = Arc::new(Shared::new());

        log::info!("network monitor starting");
        spawn_history_loader(shared.clone(), history_path);
        let stop_trace = spawn_trace(shared.clone(), prompt, source);
        spawn_relay_map_loader(runtime, shared.clone(), relays);
        spawn_aggregator(shared.clone());
        spawn_sampler(shared.clone());

        *guard = Some(Running { shared, stop_trace });
    }

    pub fn stop(&self) {
        Self::shutdown(self.running.lock_or_recover().take());
    }

    fn shutdown(running: Option<Running>) {
        if let Some(r) = running {
            log::info!("network monitor stopping");
            r.shared.stop.store(true, Ordering::SeqCst);
            let _ = r.stop_trace.send(());
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        match self.running.lock_or_recover().as_ref() {
            Some(r) => r.shared.snapshot.lock_or_recover().clone(),
            None => Snapshot::default(),
        }
    }

    pub fn history(&self) -> Vec<HistoryPoint> {
        self.history_after(None)
    }

    /// Only the points newer than `since_t`, chosen under the lock so older ones are never cloned.
    pub fn history_after(&self, since_t: Option<u64>) -> Vec<HistoryPoint> {
        match self.running.lock_or_recover().as_ref() {
            Some(r) => points_after(&r.shared.history.lock_or_recover(), since_t),
            None => Vec::new(),
        }
    }
}

fn points_after(history: &VecDeque<HistoryPoint>, since_t: Option<u64>) -> Vec<HistoryPoint> {
    let first = since_t.map_or(0, |since| history.partition_point(|p| p.t <= since));
    history.iter().skip(first).cloned().collect()
}

/// Serialises every rewrite of the history file, so a restarted monitor's loader never compacts it while the
/// previous monitor's compaction still is.
static REWRITE: Mutex<()> = Mutex::new(());

/// Opening reads and rewrites the whole log, so it runs on its own thread.
fn spawn_history_loader(shared: Arc<Shared>, path: PathBuf) {
    let spawned = thread::Builder::new().name("network-history-load".into()).spawn({
        let shared = shared.clone();
        move || {
            let opened = {
                let _rewrite = REWRITE.lock_or_recover();
                HistoryStore::open(&path, HISTORY_STORE_KEEP)
            };
            finish_history_load(&shared, opened);
        }
    });
    if let Err(e) = spawned {
        log::warn!("connection history unavailable, it will reset on restart: {e}");
        finish_history_load(&shared, Err(e));
    }
}

/// Persistence is best-effort: without it the monitor still works, history just resets on restart.
/// Saved points are older than anything sampled while loading, so they go in front.
fn finish_history_load(shared: &Shared, opened: std::io::Result<(HistoryStore, Vec<HistoryPoint>)>) {
    let mut state = shared.store.lock_or_recover();
    let waiting = match std::mem::replace(&mut *state, StoreState::Unavailable) {
        StoreState::Loading(waiting) => waiting,
        other => {
            *state = other;
            return;
        }
    };
    match opened {
        Ok((mut store, saved)) => {
            log::info!("network monitor loaded {} saved history points", saved.len());
            for point in &waiting {
                if let Err(e) = store.append(point) {
                    log::warn!("could not save connection history: {e}");
                    break;
                }
            }
            *state = StoreState::Ready(store);
            let mut history = shared.history.lock_or_recover();
            let resume_from = saved.len().saturating_sub(HISTORY_KEEP);
            let mut merged: VecDeque<HistoryPoint> = saved[resume_from..].iter().cloned().collect();
            merged.extend(history.drain(..));
            while merged.len() > HISTORY_KEEP {
                merged.pop_front();
            }
            *history = merged;
        }
        Err(e) => log::warn!("connection history unavailable, it will reset on restart: {e}"),
    }
}

/// Returns false when the store rejected the point.
fn save_point(shared: &Shared, point: &HistoryPoint) -> bool {
    match &mut *shared.store.lock_or_recover() {
        StoreState::Loading(waiting) => {
            waiting.push(point.clone());
            true
        }
        StoreState::Ready(store) => store.append(point).is_ok(),
        StoreState::Unavailable => true,
    }
}

/// Trims the log on its own thread when it is due. The rewrite reads and replaces the whole file, so neither the
/// sampler nor the `store` lock is held while it runs; points sampled meanwhile wait inside the store.
fn compact_history_if_due(shared: &Arc<Shared>) {
    let job = match &mut *shared.store.lock_or_recover() {
        StoreState::Ready(store) => store.take_compaction(),
        _ => None,
    };
    let Some(job) = job else { return };
    let shared = shared.clone();
    let spawned = thread::Builder::new().name("network-history-compact".into()).spawn({
        let shared = shared.clone();
        move || finish_compaction(&shared, run_compaction(job))
    });
    if let Err(e) = spawned {
        log::warn!("could not start connection history compaction: {e}");
        finish_compaction(&shared, Err(e));
    }
}

fn run_compaction(job: Compaction) -> std::io::Result<usize> {
    let _rewrite = REWRITE.lock_or_recover();
    job.run()
}

fn finish_compaction(shared: &Shared, outcome: std::io::Result<usize>) {
    if let Err(e) = &outcome {
        log::warn!("could not compact connection history: {e}");
    }
    if let StoreState::Ready(store) = &mut *shared.store.lock_or_recover() {
        if let Err(e) = store.finish_compaction(outcome) {
            log::warn!("could not save connection history: {e}");
        }
    }
}

fn record_packet(window: &mut HashMap<FlowKey, FlowAgg>, packet: &Packet) {
    let flow = window.entry(FlowKey { ip: *packet.remote.ip(), port: packet.remote.port() }).or_default();
    if packet.inbound {
        flow.pkts_in += 1;
        if let Some(last) = flow.last_in {
            flow.max_in_gap_ms = flow.max_in_gap_ms.max((packet.ticks_100ns - last) as f32 / 10_000.0);
        }
        flow.last_in = Some(packet.ticks_100ns);
    } else {
        flow.pkts_out += 1;
    }
}

/// Sources that can name the process (Windows) match on it. Others report every packet to a relay, which
/// belong to the game whenever it is running.
fn is_game_packet(pid: Option<u32>, game_pid: u32) -> bool {
    match pid {
        Some(pid) => pid == game_pid,
        None => game_pid != 0,
    }
}

fn spawn_trace(shared: Arc<Shared>, prompt: bool, source: Start) -> Sender<()> {
    let wanted_shared = shared.clone();
    let wanted = Arc::new(move |pid: u32| pid == wanted_shared.game_pid.load(Ordering::Relaxed));

    let sink_shared = shared.clone();
    let sink = Arc::new(move |packet: Packet| {
        let game = sink_shared.game_pid.load(Ordering::Relaxed);
        if is_game_packet(packet.pid, game) {
            record_packet(&mut sink_shared.window.lock_or_recover(), &packet);
        }
    });

    let remotes_shared = shared.clone();
    let remotes = Arc::new(move || remotes_shared.relay_map.read_or_recover().keys().copied().collect());

    let status_shared = shared;
    source(Config {
        wanted,
        sink,
        remotes,
        on_status: Box::new(move |status| {
            let mut snap = status_shared.snapshot.lock_or_recover();
            match status {
                Status::Failed(message) => snap.trace_error = Some(message),
                Status::NeedsPermission => snap.needs_permission = true,
            }
        }),
        prompt,
    })
}

async fn refresh_relay_map(shared: &Shared, source: &RelaySource, failing: &mut bool) -> Duration {
    match source().await {
        Ok(map) => {
            log::debug!("relay map loaded with {} addresses", map.len());
            *shared.relay_map.write_or_recover() = map;
            *failing = false;
            Duration::from_secs(3600)
        }
        Err(e) => {
            if *failing {
                log::debug!("relay map fetch still failing: {e}");
            } else {
                log::warn!("relay map fetch failed, retrying every 30 s: {e}");
                *failing = true;
            }
            Duration::from_secs(30)
        }
    }
}

fn spawn_relay_map_loader(runtime: &tokio::runtime::Handle, shared: Arc<Shared>, source: RelaySource) {
    runtime.spawn(async move {
        let mut failing = false;
        while !shared.stop.load(Ordering::SeqCst) {
            let wait = refresh_relay_map(&shared, &source, &mut failing).await;
            tokio::time::sleep(wait).await;
        }
    });
}

/// With no process to watch and no packets, a tick only republishes the empty state. One such tick clears the
/// snapshot; after that the rest is skipped until a pid or a packet appears.
fn can_skip_tick(game_pid: u32, window: &HashMap<FlowKey, FlowAgg>, idle_published: bool) -> bool {
    idle_published && game_pid == 0 && window.is_empty()
}

fn spawn_aggregator(shared: Arc<Shared>) {
    thread::Builder::new()
        .name("network-aggregator".into())
        .spawn(move || {
            let mut last_tick = Instant::now();
            let mut idle_published = false;

            while !shared.stop.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_secs(1));

                let game_pid = dp_game::find_pid(dp_game::is_process);
                shared.game_pid.store(game_pid, Ordering::Relaxed);

                let secs = last_tick.elapsed().as_secs_f32().max(0.1);
                last_tick = Instant::now();
                let window = std::mem::take(&mut *shared.window.lock_or_recover());

                if can_skip_tick(game_pid, &window, idle_published) {
                    continue;
                }
                idle_published = game_pid == 0 && window.is_empty();

                let game_flow = pick_game_flow(&window, secs);

                let relay_ip = game_flow.map(|(k, _)| k.ip);

                let pings = shared.pings.lock_or_recover();
                shared.targets.lock_or_recover().relay = relay_ip;

                let relay_map = shared.relay_map.read_or_recover();
                let relay = game_flow.map(|(k, f)| {
                    let pop = relay_map.get(&k.ip);
                    RelayInfo {
                        ip: k.ip.to_string(),
                        port: k.port,
                        pop_code: pop.map(|p| p.code.clone()),
                        description: pop.map(|p| p.description.clone()),
                        country_code: pop.and_then(|p| p.country_code.clone()),
                        pps_in: f.pkts_in as f32 / secs,
                        pps_out: f.pkts_out as f32 / secs,
                        max_gap_ms: f.max_in_gap_ms,
                        ping: ping_stats(pings.get(&k.ip)),
                    }
                });

                let mut snap = shared.snapshot.lock_or_recover();
                snap.game_running = shared.game_pid.load(Ordering::Relaxed) != 0;
                snap.relay = relay;
                snap.updated_at_ms = now_ms();
            }
        })
        .expect("spawn thread");
}

/// One long-lived ping thread per target, so a sampling cycle does not spawn threads. The thread ends when the
/// `Pinger` is dropped (its request channel closes).
struct Pinger {
    request: std::sync::mpsc::Sender<()>,
    reply: std::sync::mpsc::Receiver<Option<f32>>,
}

impl Pinger {
    fn spawn(ip: Ipv4Addr) -> Option<Self> {
        let (request, wanted) = std::sync::mpsc::channel::<()>();
        let (answer, reply) = std::sync::mpsc::channel();
        thread::Builder::new()
            .name(format!("ping-{ip}"))
            .spawn(move || {
                while wanted.recv().is_ok() {
                    if answer.send(dp_icmp::ping(ip, 1000)).is_err() {
                        break;
                    }
                }
            })
            .ok()?;
        Some(Self { request, reply })
    }
}

fn spawn_sampler(shared: Arc<Shared>) {
    thread::Builder::new()
        .name("network-sampler".into())
        .spawn(move || {
            let mut store_failing = false;
            let mut pingers: HashMap<Ipv4Addr, Pinger> = HashMap::new();
            while !shared.stop.load(Ordering::SeqCst) {
                let cycle = Instant::now();

                let relay = shared.targets.lock_or_recover().relay;
                let wanted: Vec<Ipv4Addr> = relay.into_iter().collect();

                pingers.retain(|ip, _| wanted.contains(ip));
                for ip in &wanted {
                    if !pingers.contains_key(ip) {
                        if let Some(pinger) = Pinger::spawn(*ip) {
                            pingers.insert(*ip, pinger);
                        }
                    }
                }
                let results: Vec<(Ipv4Addr, Option<f32>)> = pingers
                    .iter()
                    .filter(|(_, p)| p.request.send(()).is_ok())
                    .filter_map(|(ip, p)| p.reply.recv().ok().map(|rtt| (*ip, rtt)))
                    .collect();

                let mut pings = shared.pings.lock_or_recover();
                pings.retain(|ip, _| wanted.contains(ip));
                for (ip, rtt) in results {
                    let samples = pings.entry(ip).or_default();
                    samples.push_back(rtt);
                    while samples.len() > PING_KEEP {
                        samples.pop_front();
                    }
                }

                let point = relay.map(|ip| HistoryPoint { t: now_ms(), raw: latest(pings.get(&ip)) });
                drop(pings);

                if let Some(point) = point {
                    if save_point(&shared, &point) {
                        store_failing = false;
                    } else if !store_failing {
                        log::warn!("could not save connection history");
                        store_failing = true;
                    }
                    let mut history = shared.history.lock_or_recover();
                    history.push_back(point);
                    while history.len() > HISTORY_KEEP {
                        history.pop_front();
                    }
                    drop(history);
                    compact_history_if_due(&shared);
                }

                if let Some(rest) = Duration::from_secs(1).checked_sub(cycle.elapsed()) {
                    thread::sleep(rest);
                }
            }
        })
        .expect("spawn thread");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn samples(values: &[Option<f32>]) -> VecDeque<Option<f32>> {
        values.iter().copied().collect()
    }

    fn ip(last: u8) -> Ipv4Addr {
        Ipv4Addr::new(10, 0, 0, last)
    }

    fn flow(pkts_in: u32, pkts_out: u32) -> FlowAgg {
        FlowAgg { pkts_in, pkts_out, ..Default::default() }
    }

    fn key(last: u8) -> FlowKey {
        FlowKey { ip: ip(last), port: 27015 }
    }

    fn packet(inbound: bool, ticks_100ns: i64) -> Packet {
        Packet { pid: Some(1), remote: std::net::SocketAddrV4::new(ip(1), 27015), inbound, ticks_100ns }
    }

    #[test]
    fn a_tick_is_skipped_only_when_nothing_runs_nothing_arrived_and_the_idle_state_is_published() {
        let mut window = HashMap::new();
        assert!(can_skip_tick(0, &window, true));
        assert!(!can_skip_tick(0, &window, false));
        assert!(!can_skip_tick(7, &window, true));
        window.insert(key(1), flow(1, 0));
        assert!(!can_skip_tick(0, &window, true));
    }

    #[test]
    fn a_known_process_decides_whether_a_packet_is_the_games() {
        assert!(is_game_packet(Some(10), 10));
        assert!(!is_game_packet(Some(30), 10));
    }

    #[test]
    fn an_unattributed_packet_belongs_to_the_game_only_while_it_runs() {
        assert!(is_game_packet(None, 10));
        assert!(!is_game_packet(None, 0));
    }

    fn fake_source(config: Config) -> Sender<()> {
        (config.sink)(Packet {
            pid: None,
            remote: std::net::SocketAddrV4::new(ip(1), 27015),
            inbound: true,
            ticks_100ns: 0,
        });
        (config.on_status)(Status::NeedsPermission);
        std::sync::mpsc::channel().0
    }

    #[test]
    fn the_given_source_feeds_packets_and_status_into_the_monitor() {
        let shared = Arc::new(Shared::new());
        shared.game_pid.store(10, Ordering::Relaxed);

        let _stop = spawn_trace(shared.clone(), false, fake_source);

        assert_eq!(shared.window.lock_or_recover()[&key(1)].pkts_in, 1);
        assert!(shared.snapshot.lock_or_recover().needs_permission);
    }

    #[test]
    fn packets_are_counted_per_direction_and_flow() {
        let mut window = HashMap::new();
        record_packet(&mut window, &packet(true, 0));
        record_packet(&mut window, &packet(false, 5));
        let flow = &window[&key(1)];
        assert_eq!((flow.pkts_in, flow.pkts_out), (1, 1));
    }

    #[test]
    fn the_longest_gap_between_inbound_packets_is_kept_in_milliseconds() {
        let mut window = HashMap::new();
        for ticks in [0, 100_000, 600_000, 700_000] {
            record_packet(&mut window, &packet(true, ticks));
        }
        assert_eq!(window[&key(1)].max_in_gap_ms, 50.0);
    }

    #[test]
    fn ping_stats_without_samples_is_empty() {
        assert_eq!(ping_stats(None), PingStats::default());
        assert_eq!(ping_stats(Some(&VecDeque::new())), PingStats::default());
    }

    #[test]
    fn ping_stats_computes_avg_min_max_and_current() {
        let s = samples(&[Some(10.0), Some(30.0), Some(20.0)]);
        let stats = ping_stats(Some(&s));
        assert_eq!(stats.avg, Some(20.0));
        assert_eq!(stats.min, Some(10.0));
        assert_eq!(stats.max, Some(30.0));
        assert_eq!(stats.current, Some(20.0));
        assert_eq!(stats.samples, 3);
        assert_eq!(stats.loss_pct, 0.0);
    }

    #[test]
    fn ping_stats_jitter_is_mean_step_between_consecutive_samples() {
        let s = samples(&[Some(10.0), Some(30.0), Some(20.0)]);
        assert_eq!(ping_stats(Some(&s)).jitter, Some(15.0));
    }

    #[test]
    fn ping_stats_jitter_skips_lost_samples() {
        let s = samples(&[Some(10.0), None, Some(20.0)]);
        assert_eq!(ping_stats(Some(&s)).jitter, Some(10.0));
    }

    #[test]
    fn ping_stats_counts_loss_and_current_is_none_when_latest_lost() {
        let s = samples(&[Some(10.0), None, None, Some(20.0), None]);
        let stats = ping_stats(Some(&s));
        assert_eq!(stats.loss_pct, 60.0);
        assert_eq!(stats.current, None);
        assert_eq!(stats.avg, Some(15.0));
    }

    #[test]
    fn ping_stats_all_lost_reports_full_loss_without_timings() {
        let s = samples(&[None, None]);
        let stats = ping_stats(Some(&s));
        assert_eq!(stats.loss_pct, 100.0);
        assert_eq!(stats.avg, None);
        assert_eq!(stats.jitter, None);
        assert_eq!(stats.samples, 2);
    }

    #[test]
    fn ping_stats_only_uses_the_latest_window() {
        let mut values = vec![Some(1000.0); 10];
        values.extend(vec![Some(10.0); PING_WINDOW]);
        let stats = ping_stats(Some(&samples(&values)));
        assert_eq!(stats.avg, Some(10.0));
        assert_eq!(stats.samples, PING_WINDOW as u32);
    }

    #[test]
    fn game_flow_picks_the_busiest_flow_above_threshold() {
        let window = HashMap::from([(key(1), flow(10, 10)), (key(2), flow(50, 50)), (key(3), flow(5, 5))]);
        let (k, _) = pick_game_flow(&window, 1.0).unwrap();
        assert_eq!(k.ip, ip(2));
    }

    #[test]
    fn game_flow_ignores_quiet_flows() {
        let window = HashMap::from([(key(1), flow(5, 5))]);
        assert!(pick_game_flow(&window, 1.0).is_none());
    }

    #[test]
    fn game_flow_ignores_a_local_server_on_this_machine() {
        let local = FlowKey { ip: Ipv4Addr::LOCALHOST, port: 27015 };
        let window = HashMap::from([(local, flow(500, 500)), (key(2), flow(30, 30))]);
        let (k, _) = pick_game_flow(&window, 1.0).unwrap();
        assert_eq!(k.ip, ip(2));
        let only_local = HashMap::from([(local, flow(500, 500))]);
        assert!(pick_game_flow(&only_local, 1.0).is_none());
    }

    #[test]
    fn game_flow_threshold_scales_with_elapsed_seconds() {
        let window = HashMap::from([(key(1), flow(20, 20))]);
        assert!(pick_game_flow(&window, 1.0).is_some());
        assert!(pick_game_flow(&window, 4.0).is_none());
    }

    fn pop(code: &str) -> PopInfo {
        PopInfo { code: code.into(), description: format!("{code} pop"), country_code: None }
    }

    fn source_returning(result: Result<RelayMap, String>) -> RelaySource {
        Arc::new(move || {
            let result = result.clone();
            Box::pin(async move { result })
        })
    }

    fn history_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-monitor-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("connection-history.jsonl")
    }

    fn point(t: u64) -> HistoryPoint {
        HistoryPoint { t, raw: Some(t as f32) }
    }

    fn history_ts(shared: &Shared) -> Vec<u64> {
        shared.history.lock_or_recover().iter().map(|p| p.t).collect()
    }

    #[test]
    fn points_sampled_before_the_log_opens_are_saved_after_it() {
        let path = history_path("late-open");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(
            &path,
            "{\"t\":1,\"raw\":1.0,\"exit\":null}
",
        )
        .unwrap();
        let shared = Shared::new();

        assert!(save_point(&shared, &point(5)));
        shared.history.lock_or_recover().push_back(point(5));
        finish_history_load(&shared, HistoryStore::open(&path, 100));
        assert!(save_point(&shared, &point(6)));
        shared.history.lock_or_recover().push_back(point(6));

        assert_eq!(history_ts(&shared), vec![1, 5, 6]);
        let on_disk: Vec<u64> = HistoryStore::read_all(&path).unwrap().iter().map(|p| p.t).collect();
        assert_eq!(on_disk, vec![1, 5, 6]);
    }

    #[test]
    fn merged_history_keeps_only_the_newest_window() {
        let path = history_path("window");
        let (mut store, _) = HistoryStore::open(&path, 10_000).unwrap();
        for t in 1..=(HISTORY_KEEP as u64 + 50) {
            store.append(&point(t)).unwrap();
        }
        drop(store);
        let shared = Shared::new();
        shared.history.lock_or_recover().push_back(point(10_000));

        finish_history_load(&shared, HistoryStore::open(&path, 10_000));

        let ts = history_ts(&shared);
        assert_eq!(ts.len(), HISTORY_KEEP);
        assert_eq!(ts.last(), Some(&10_000));
        assert_eq!(ts[ts.len() - 2], HISTORY_KEEP as u64 + 50);
    }

    #[test]
    fn a_failed_open_drops_nothing_from_memory_and_later_points_are_accepted() {
        let shared = Shared::new();
        assert!(save_point(&shared, &point(1)));
        shared.history.lock_or_recover().push_back(point(1));

        finish_history_load(&shared, Err(std::io::Error::other("denied")));

        assert!(save_point(&shared, &point(2)));
        assert_eq!(history_ts(&shared), vec![1]);
        assert!(matches!(*shared.store.lock_or_recover(), StoreState::Unavailable));
    }

    #[test]
    fn the_monitor_serves_saved_history_after_the_background_load() {
        let path = history_path("monitor");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(
            &path,
            "{\"t\":7,\"raw\":1.0,\"exit\":null}
",
        )
        .unwrap();
        let shared = Arc::new(Shared::new());

        spawn_history_loader(shared.clone(), path);

        let deadline = Instant::now() + Duration::from_secs(5);
        while history_ts(&shared).is_empty() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(history_ts(&shared), vec![7]);
    }

    #[test]
    fn points_after_a_cursor_are_only_the_newer_ones() {
        let history: VecDeque<HistoryPoint> = [1, 2, 3, 4].into_iter().map(point).collect();
        let ts = |since| points_after(&history, since).iter().map(|p| p.t).collect::<Vec<_>>();
        assert_eq!(ts(None), vec![1, 2, 3, 4]);
        assert_eq!(ts(Some(2)), vec![3, 4]);
        assert!(ts(Some(4)).is_empty());
    }

    #[test]
    fn a_due_compaction_trims_the_log_off_the_calling_thread_and_keeps_every_point() {
        let path = history_path("compact");
        let shared = Arc::new(Shared::new());
        finish_history_load(&shared, HistoryStore::open(&path, 3));
        for t in 1..=7 {
            assert!(save_point(&shared, &point(t)));
        }

        let _rewrite = REWRITE.lock_or_recover();
        compact_history_if_due(&shared);
        assert!(save_point(&shared, &point(8)));
        assert_eq!(HistoryStore::read_all(&path).unwrap().len(), 7);
        drop(_rewrite);

        let deadline = Instant::now() + Duration::from_secs(5);
        let on_disk = loop {
            let ts: Vec<u64> = HistoryStore::read_all(&path).unwrap().iter().map(|p| p.t).collect();
            if ts.last() == Some(&8) && ts.len() <= 4 || Instant::now() > deadline {
                break ts;
            }
            thread::sleep(Duration::from_millis(10));
        };
        assert_eq!(on_disk, vec![5, 6, 7, 8]);
    }

    #[tokio::test]
    async fn a_loaded_relay_map_replaces_the_shared_one_and_waits_an_hour() {
        let shared = Shared::new();
        let source = source_returning(Ok(RelayMap::from([(ip(1), pop("fra"))])));
        let mut failing = false;

        let wait = refresh_relay_map(&shared, &source, &mut failing).await;

        assert_eq!(wait, Duration::from_secs(3600));
        assert_eq!(shared.relay_map.read_or_recover().get(&ip(1)).map(|p| p.code.as_str()), Some("fra"));
    }

    #[tokio::test]
    async fn a_failed_relay_fetch_keeps_the_previous_map_and_retries_soon() {
        let shared = Shared::new();
        *shared.relay_map.write_or_recover() = RelayMap::from([(ip(1), pop("fra"))]);
        let source = source_returning(Err("offline".into()));
        let mut failing = false;

        let wait = refresh_relay_map(&shared, &source, &mut failing).await;

        assert_eq!(wait, Duration::from_secs(30));
        assert!(failing);
        assert_eq!(shared.relay_map.read_or_recover().len(), 1);
    }

    #[tokio::test]
    async fn a_successful_fetch_clears_the_failing_flag() {
        let shared = Shared::new();
        let source = source_returning(Ok(RelayMap::new()));
        let mut failing = true;

        refresh_relay_map(&shared, &source, &mut failing).await;

        assert!(!failing);
    }
}
