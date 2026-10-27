use std::sync::atomic::AtomicBool;
use std::sync::mpsc;
use std::thread;
use std::time::Instant;

use super::*;
use dp_sync::LockExt;

const WAIT: Duration = Duration::from_secs(2);
const QUIET: Duration = Duration::from_millis(50);

struct Fixture {
    game: Arc<GameFlag>,
    registry: Arc<Registry>,
    slept: Arc<Mutex<Vec<Duration>>>,
}

fn fixture(game_running: bool) -> Fixture {
    let game = GameFlag::new(game_running);
    let slept = Arc::new(Mutex::new(Vec::new()));
    let sink = slept.clone();
    let sleeper: Sleeper = Arc::new(move |d| sink.lock_or_recover().push(d));
    Fixture { game: game.clone(), registry: Registry::new(game, sleeper), slept }
}

fn spec(id: &'static str, policy: Policy) -> JobSpec {
    JobSpec { id, default_policy: policy, policy_configurable: true }
}

fn state(f: &Fixture, id: &str) -> JobState {
    f.registry.get(id).expect("job registered").state
}

fn wait_until(mut ready: impl FnMut() -> bool) {
    let end = Instant::now() + WAIT;
    while !ready() {
        assert!(Instant::now() < end, "timed out waiting for condition");
        thread::sleep(Duration::from_millis(1));
    }
}

/// Runs one checkpoint on its own thread and reports the result on the returned channel.
fn checkpoint_in_thread(handle: JobHandle) -> mpsc::Receiver<Flow> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let _ = tx.send(handle.checkpoint());
    });
    rx
}

#[test]
fn register_lists_a_queued_job_with_its_default_policy() {
    let f = fixture(false);
    f.registry.register(spec("a", Policy::PauseInGame));
    let info = f.registry.get("a").unwrap();
    assert_eq!(info.state, JobState::Queued);
    assert_eq!(info.policy, Policy::PauseInGame);
    assert_eq!((info.done, info.total), (0, 0));
    assert_eq!(f.registry.list().len(), 1);
}

#[test]
fn list_keeps_registration_order() {
    let f = fixture(false);
    f.registry.register(spec("b", Policy::Always));
    f.registry.register(spec("a", Policy::Always));
    f.registry.register(spec("c", Policy::Always));
    let ids: Vec<_> = f.registry.list().into_iter().map(|j| j.id).collect();
    assert_eq!(ids, ["b", "a", "c"]);
}

#[test]
fn registering_an_existing_id_resets_it() {
    let f = fixture(false);
    let first = f.registry.register(spec("a", Policy::PauseInGame));
    first.start();
    first.progress(3, 10, Some("x"));
    first.finish();
    f.registry.register(spec("a", Policy::PauseInGame));
    let info = f.registry.get("a").unwrap();
    assert_eq!(info.state, JobState::Queued);
    assert_eq!((info.done, info.total, info.label), (0, 0, None));
    assert_eq!(f.registry.list().len(), 1);
}

#[test]
fn start_moves_to_running_and_progress_is_recorded() {
    let f = fixture(false);
    let h = f.registry.register(spec("a", Policy::Always));
    h.start();
    h.progress(4, 9, Some("addon.vpk"));
    let info = f.registry.get("a").unwrap();
    assert_eq!(info.state, JobState::Running);
    assert_eq!((info.done, info.total), (4, 9));
    assert_eq!(info.label.as_deref(), Some("addon.vpk"));
}

#[test]
fn checkpoint_continues_when_the_game_is_not_running() {
    let f = fixture(false);
    let h = f.registry.register(spec("a", Policy::PauseInGame));
    h.start();
    assert_eq!(h.checkpoint(), Flow::Continue);
    assert_eq!(state(&f, "a"), JobState::Running);
    assert!(f.slept.lock_or_recover().is_empty());
}

#[test]
fn always_policy_ignores_a_running_game() {
    let f = fixture(true);
    let h = f.registry.register(spec("a", Policy::Always));
    h.start();
    assert_eq!(h.checkpoint(), Flow::Continue);
    assert_eq!(state(&f, "a"), JobState::Running);
    assert!(f.slept.lock_or_recover().is_empty());
}

#[test]
fn pause_in_game_blocks_until_the_game_exits() {
    let f = fixture(false);
    let h = f.registry.register(spec("a", Policy::PauseInGame));
    h.start();
    f.game.set(true);
    let rx = checkpoint_in_thread(h);
    wait_until(|| state(&f, "a") == JobState::Paused);
    assert!(rx.recv_timeout(QUIET).is_err(), "checkpoint returned while the game was running");

    f.game.set(false);
    assert_eq!(rx.recv_timeout(WAIT).unwrap(), Flow::Continue);
    assert_eq!(state(&f, "a"), JobState::Running);
}

#[test]
fn slow_in_game_sleeps_once_per_checkpoint_and_keeps_running() {
    let f = fixture(true);
    let h = f.registry.register(spec("a", Policy::SlowInGame));
    h.start();
    assert_eq!(h.checkpoint(), Flow::Continue);
    assert_eq!(h.checkpoint(), Flow::Continue);
    assert_eq!(*f.slept.lock_or_recover(), [SLOW_DELAY, SLOW_DELAY]);
    assert_eq!(state(&f, "a"), JobState::Running);
}

#[test]
fn slow_in_game_does_not_sleep_when_the_game_is_off() {
    let f = fixture(false);
    let h = f.registry.register(spec("a", Policy::SlowInGame));
    h.start();
    assert_eq!(h.checkpoint(), Flow::Continue);
    assert!(f.slept.lock_or_recover().is_empty());
}

#[test]
fn changing_policy_to_always_wakes_a_paused_job() {
    let f = fixture(true);
    let h = f.registry.register(spec("a", Policy::PauseInGame));
    h.start();
    let rx = checkpoint_in_thread(h);
    wait_until(|| state(&f, "a") == JobState::Paused);

    f.registry.set_policy("a", Policy::Always);
    assert_eq!(rx.recv_timeout(WAIT).unwrap(), Flow::Continue);
    assert_eq!(f.registry.get("a").unwrap().policy, Policy::Always);
}

#[test]
fn cancel_makes_the_next_checkpoint_return_cancelled() {
    let f = fixture(false);
    let h = f.registry.register(spec("a", Policy::Always));
    h.start();
    f.registry.cancel("a");
    assert_eq!(state(&f, "a"), JobState::Cancelled);
    assert_eq!(h.checkpoint(), Flow::Cancelled);
}

#[test]
fn cancel_wakes_a_paused_job() {
    let f = fixture(true);
    let h = f.registry.register(spec("a", Policy::PauseInGame));
    h.start();
    let rx = checkpoint_in_thread(h);
    wait_until(|| state(&f, "a") == JobState::Paused);

    f.registry.cancel("a");
    assert_eq!(rx.recv_timeout(WAIT).unwrap(), Flow::Cancelled);
    assert_eq!(state(&f, "a"), JobState::Cancelled);
}

#[test]
fn finish_marks_done_and_a_late_cancel_does_not_change_it() {
    let f = fixture(false);
    let h = f.registry.register(spec("a", Policy::Always));
    h.start();
    h.finish();
    assert_eq!(state(&f, "a"), JobState::Done);
    f.registry.cancel("a");
    assert_eq!(state(&f, "a"), JobState::Done);
}

#[test]
fn finish_after_cancel_keeps_cancelled() {
    let f = fixture(false);
    let h = f.registry.register(spec("a", Policy::Always));
    h.start();
    f.registry.cancel("a");
    h.finish();
    assert_eq!(state(&f, "a"), JobState::Cancelled);
}

#[test]
fn listener_sees_state_progress_and_policy_changes() {
    let f = fixture(false);
    let seen: Arc<Mutex<Vec<(JobState, usize, Policy)>>> = Arc::default();
    let sink = seen.clone();
    f.registry.set_listener(Box::new(move |j| sink.lock_or_recover().push((j.state, j.done, j.policy))));
    let h = f.registry.register(spec("a", Policy::PauseInGame));
    h.start();
    h.progress(2, 5, None);
    f.registry.set_policy("a", Policy::Always);
    h.finish();

    let seen = seen.lock_or_recover();
    assert_eq!(seen.first().map(|s| s.0), Some(JobState::Queued));
    assert!(seen.contains(&(JobState::Running, 2, Policy::PauseInGame)));
    assert!(seen.contains(&(JobState::Running, 2, Policy::Always)));
    assert_eq!(seen.last().map(|s| s.0), Some(JobState::Done));
}

#[test]
fn game_flag_round_trips() {
    let game = GameFlag::new(false);
    assert!(!game.get());
    game.set(true);
    assert!(game.get());
    game.set(false);
    assert!(!game.get());
}

#[test]
fn a_replaced_jobs_handle_cannot_touch_the_new_job() {
    let f = fixture(false);
    let old = f.registry.register(spec("a", Policy::Always));
    old.start();
    let new = f.registry.register(spec("a", Policy::Always));
    new.start();

    old.progress(9, 9, Some("stale"));
    old.finish();
    assert_eq!(old.checkpoint(), Flow::Cancelled);

    let info = f.registry.get("a").unwrap();
    assert_eq!(info.state, JobState::Running);
    assert_eq!(info.done, 0);
    assert_eq!(new.checkpoint(), Flow::Continue);
}

#[test]
fn a_policy_chosen_before_registration_applies_on_register() {
    let f = fixture(false);
    f.registry.set_policy("a", Policy::Always);
    f.registry.register(spec("a", Policy::PauseInGame));
    assert_eq!(f.registry.get("a").unwrap().policy, Policy::Always);
}

#[test]
fn a_chosen_policy_survives_the_job_being_registered_again() {
    let f = fixture(false);
    f.registry.register(spec("a", Policy::PauseInGame));
    f.registry.set_policy("a", Policy::SlowInGame);
    f.registry.register(spec("a", Policy::PauseInGame));
    assert_eq!(f.registry.get("a").unwrap().policy, Policy::SlowInGame);
}

#[test]
fn snapshot_reports_jobs_game_state_and_the_global_switch() {
    let f = fixture(true);
    f.registry.register(spec("a", Policy::Always));
    f.registry.set_all_enabled(false);
    let snap = f.registry.snapshot();
    assert_eq!(snap.jobs.len(), 1);
    assert!(snap.game_running);
    assert!(!snap.all_enabled);
}

fn counter() -> (Arc<std::sync::atomic::AtomicUsize>, Arc<std::sync::atomic::AtomicUsize>) {
    Default::default()
}

#[test]
fn coalescer_emits_promptly_after_a_quiet_period() {
    use std::sync::atomic::Ordering::SeqCst;
    let (emits, _) = counter();
    let sink = emits.clone();
    let c = Coalescer::spawn(Duration::from_millis(50), move || {
        sink.fetch_add(1, SeqCst);
    });
    c.notify();
    wait_until(|| emits.load(SeqCst) == 1);
}

#[test]
fn coalescer_does_not_emit_without_a_notify() {
    use std::sync::atomic::Ordering::SeqCst;
    let (emits, _) = counter();
    let sink = emits.clone();
    let _c = Coalescer::spawn(Duration::from_millis(5), move || {
        sink.fetch_add(1, SeqCst);
    });
    thread::sleep(Duration::from_millis(60));
    assert_eq!(emits.load(SeqCst), 0);
}

#[test]
fn coalescer_merges_a_burst_and_still_delivers_the_last_state() {
    use std::sync::atomic::Ordering::SeqCst;
    let (emits, state) = counter();
    let (sink, seen) = (emits.clone(), Arc::new(std::sync::atomic::AtomicUsize::new(0)));
    let (read, out) = (state.clone(), seen.clone());
    let c = Coalescer::spawn(Duration::from_millis(40), move || {
        sink.fetch_add(1, SeqCst);
        out.store(read.load(SeqCst), SeqCst);
    });
    for i in 1..=200 {
        state.store(i, SeqCst);
        c.notify();
    }
    wait_until(|| seen.load(SeqCst) == 200);
    assert!(emits.load(SeqCst) < 10, "burst produced {} emits", emits.load(SeqCst));
}

#[test]
fn game_watcher_mirrors_the_probe_into_the_flag() {
    use std::sync::atomic::Ordering::SeqCst;
    let game = GameFlag::new(false);
    let probe = Arc::new(AtomicBool::new(false));
    let p = probe.clone();
    let _w = GameWatcher::spawn(game.clone(), move || p.load(SeqCst), Duration::from_millis(5));

    probe.store(true, SeqCst);
    wait_until(|| game.get());
    probe.store(false, SeqCst);
    wait_until(|| !game.get());
}

#[test]
fn game_watcher_stops_when_dropped() {
    use std::sync::atomic::Ordering::SeqCst;
    let game = GameFlag::new(false);
    let probe = Arc::new(AtomicBool::new(false));
    let p = probe.clone();
    let w = GameWatcher::spawn(game.clone(), move || p.load(SeqCst), Duration::from_millis(5));
    drop(w);
    thread::sleep(Duration::from_millis(30));

    probe.store(true, SeqCst);
    thread::sleep(Duration::from_millis(60));
    assert!(!game.get());
}

#[test]
fn policy_overrides_lists_only_what_was_chosen() {
    let f = fixture(false);
    f.registry.register(spec("a", Policy::PauseInGame));
    f.registry.register(spec("b", Policy::PauseInGame));
    f.registry.set_policy("b", Policy::Always);
    let chosen = f.registry.policy_overrides();
    assert_eq!(chosen.len(), 1);
    assert_eq!(chosen.get("b"), Some(&Policy::Always));
}

#[test]
fn is_active_is_true_until_the_job_ends() {
    let f = fixture(false);
    assert!(!f.registry.is_active("a"));
    let h = f.registry.register(spec("a", Policy::Always));
    assert!(f.registry.is_active("a"));
    h.start();
    assert!(f.registry.is_active("a"));
    h.finish();
    assert!(!f.registry.is_active("a"));
}

#[test]
fn a_declared_job_is_in_the_catalog_before_it_runs() {
    let f = fixture(false);
    f.registry.declare(spec("a", Policy::PauseInGame));
    let catalog = f.registry.snapshot().catalog;
    assert_eq!(catalog.len(), 1);
    assert_eq!(catalog[0].id, "a");
    assert_eq!(catalog[0].policy, Policy::PauseInGame);
    assert!(f.registry.snapshot().jobs.is_empty());
}

#[test]
fn catalog_reports_whether_the_policy_can_be_chosen() {
    let f = fixture(false);
    f.registry.declare(spec("tunable", Policy::PauseInGame));
    f.registry.declare(JobSpec { policy_configurable: false, ..spec("fixed", Policy::Always) });
    let catalog = f.registry.snapshot().catalog;
    assert!(catalog.iter().find(|c| c.id == "tunable").unwrap().policy_configurable);
    assert!(!catalog.iter().find(|c| c.id == "fixed").unwrap().policy_configurable);
}

#[test]
fn catalog_shows_the_chosen_policy_not_the_default() {
    let f = fixture(false);
    f.registry.declare(spec("a", Policy::PauseInGame));
    f.registry.set_policy("a", Policy::SlowInGame);
    assert_eq!(f.registry.snapshot().catalog[0].policy, Policy::SlowInGame);
}

#[test]
fn a_policy_chosen_before_declaring_shows_in_the_catalog() {
    let f = fixture(false);
    f.registry.set_policy("a", Policy::Always);
    f.registry.declare(spec("a", Policy::PauseInGame));
    assert_eq!(f.registry.snapshot().catalog[0].policy, Policy::Always);
}

#[test]
fn declaring_an_id_twice_keeps_one_entry_in_declaration_order() {
    let f = fixture(false);
    f.registry.declare(spec("b", Policy::Always));
    f.registry.declare(spec("a", Policy::Always));
    f.registry.declare(spec("b", Policy::Always));
    let ids: Vec<_> = f.registry.snapshot().catalog.into_iter().map(|c| c.id).collect();
    assert_eq!(ids, ["b", "a"]);
}

#[test]
fn jobs_are_enabled_until_switched_off() {
    let f = fixture(false);
    assert!(f.registry.is_enabled("a"));
    assert!(f.registry.all_enabled());
}

#[test]
fn switching_one_job_off_leaves_the_others_on() {
    let f = fixture(false);
    f.registry.set_enabled("a", false);
    assert!(!f.registry.is_enabled("a"));
    assert!(f.registry.is_enabled("b"));
    f.registry.set_enabled("a", true);
    assert!(f.registry.is_enabled("a"));
}

#[test]
fn the_global_switch_overrides_every_job_and_restores_their_own_state() {
    let f = fixture(false);
    f.registry.set_enabled("a", false);
    f.registry.set_all_enabled(false);
    assert!(!f.registry.is_enabled("a"));
    assert!(!f.registry.is_enabled("b"));

    f.registry.set_all_enabled(true);
    assert!(!f.registry.is_enabled("a"), "a stays off by its own switch");
    assert!(f.registry.is_enabled("b"));
}

#[test]
fn disabled_jobs_lists_only_the_jobs_switched_off() {
    let f = fixture(false);
    f.registry.set_enabled("a", false);
    f.registry.set_enabled("b", true);
    let off = f.registry.disabled_jobs();
    assert_eq!(off.len(), 1);
    assert!(off.contains("a"));
}

#[test]
fn catalog_shows_each_jobs_own_switch_apart_from_the_global_one() {
    let f = fixture(false);
    f.registry.declare(spec("a", Policy::Always));
    f.registry.declare(spec("b", Policy::Always));
    f.registry.set_enabled("a", false);
    f.registry.set_all_enabled(false);
    let snap = f.registry.snapshot();
    assert!(!snap.all_enabled);
    assert!(!snap.catalog[0].enabled);
    assert!(snap.catalog[1].enabled);
}

#[test]
fn switching_a_job_off_does_not_stop_a_run_already_going() {
    let f = fixture(false);
    let h = f.registry.register(spec("a", Policy::Always));
    h.start();
    f.registry.set_enabled("a", false);
    f.registry.set_all_enabled(false);
    assert_eq!(state(&f, "a"), JobState::Running);
    assert_eq!(h.checkpoint(), Flow::Continue);
}

#[test]
fn force_run_wakes_a_paused_job() {
    let f = fixture(true);
    let h = f.registry.register(spec("a", Policy::PauseInGame));
    h.start();
    let rx = checkpoint_in_thread(h);
    wait_until(|| state(&f, "a") == JobState::Paused);

    f.registry.force_run("a");
    assert_eq!(rx.recv_timeout(WAIT).unwrap(), Flow::Continue);
    assert_eq!(state(&f, "a"), JobState::Running);
    assert_eq!(f.registry.get("a").unwrap().policy, Policy::PauseInGame);
}

#[test]
fn a_forced_job_never_pauses_or_slows_again() {
    let f = fixture(true);
    let paused = f.registry.register(spec("p", Policy::PauseInGame));
    paused.start();
    f.registry.force_run("p");
    assert_eq!(paused.checkpoint(), Flow::Continue);
    assert_eq!(paused.checkpoint(), Flow::Continue);

    let slow = f.registry.register(spec("s", Policy::SlowInGame));
    slow.start();
    f.registry.force_run("s");
    assert_eq!(slow.checkpoint(), Flow::Continue);
    assert!(f.slept.lock_or_recover().is_empty());
}

#[test]
fn a_new_run_is_not_forced() {
    let f = fixture(true);
    let first = f.registry.register(spec("a", Policy::PauseInGame));
    first.start();
    f.registry.force_run("a");
    drop(first);

    let second = f.registry.register(spec("a", Policy::PauseInGame));
    second.start();
    let rx = checkpoint_in_thread(second);
    wait_until(|| state(&f, "a") == JobState::Paused);
    assert!(rx.recv_timeout(QUIET).is_err());
    f.game.set(false);
    assert_eq!(rx.recv_timeout(WAIT).unwrap(), Flow::Continue);
}

#[test]
fn forcing_an_unknown_job_does_nothing() {
    let f = fixture(false);
    f.registry.force_run("missing");
    assert!(f.registry.list().is_empty());
}

fn enable_log(f: &Fixture) -> Arc<Mutex<Vec<String>>> {
    let log: Arc<Mutex<Vec<String>>> = Arc::default();
    let sink = log.clone();
    f.registry.on_enabled(Box::new(move |id| sink.lock_or_recover().push(id.to_string())));
    log
}

#[test]
fn enabling_a_job_that_was_off_tells_the_listener() {
    let f = fixture(false);
    let log = enable_log(&f);
    f.registry.set_enabled("a", false);
    assert!(log.lock_or_recover().is_empty(), "switching off must not notify");

    f.registry.set_enabled("a", true);
    assert_eq!(*log.lock_or_recover(), ["a"]);
}

#[test]
fn enabling_a_job_that_was_already_on_stays_quiet() {
    let f = fixture(false);
    let log = enable_log(&f);
    f.registry.set_enabled("a", true);
    assert!(log.lock_or_recover().is_empty());
}

#[test]
fn enabling_a_job_while_the_global_switch_is_off_stays_quiet() {
    let f = fixture(false);
    let log = enable_log(&f);
    f.registry.set_enabled("a", false);
    f.registry.set_all_enabled(false);
    f.registry.set_enabled("a", true);
    assert!(log.lock_or_recover().is_empty(), "a is still held off by the global switch");
}

#[test]
fn turning_the_global_switch_on_tells_the_listener_about_each_job_that_comes_back() {
    let f = fixture(false);
    f.registry.declare(spec("a", Policy::Always));
    f.registry.declare(spec("b", Policy::Always));
    f.registry.set_enabled("b", false);
    f.registry.set_all_enabled(false);
    let log = enable_log(&f);

    f.registry.set_all_enabled(true);
    assert_eq!(*log.lock_or_recover(), ["a"], "b stays off by its own switch");
}

#[test]
fn turning_the_global_switch_on_when_it_was_already_on_stays_quiet() {
    let f = fixture(false);
    f.registry.declare(spec("a", Policy::Always));
    let log = enable_log(&f);
    f.registry.set_all_enabled(true);
    assert!(log.lock_or_recover().is_empty());
}

#[test]
fn keep_running_instead_of_pausing_rewrites_every_pause_policy() {
    let f = fixture(false);
    f.registry.declare(spec("default-pause", Policy::PauseInGame));
    f.registry.declare(spec("slow", Policy::SlowInGame));
    f.registry.declare(spec("chose-slow", Policy::PauseInGame));
    f.registry.set_policy("chose-slow", Policy::SlowInGame);
    f.registry.declare(spec("chose-pause", Policy::Always));
    f.registry.set_policy("chose-pause", Policy::PauseInGame);
    f.registry.set_policy("undeclared", Policy::PauseInGame);

    f.registry.keep_running_instead_of_pausing();

    let policy = |id: &str| f.registry.snapshot().catalog.into_iter().find(|c| c.id == id).unwrap().policy;
    assert_eq!(policy("default-pause"), Policy::Always);
    assert_eq!(policy("slow"), Policy::SlowInGame);
    assert_eq!(policy("chose-slow"), Policy::SlowInGame);
    assert_eq!(policy("chose-pause"), Policy::Always);
    let overrides = f.registry.policy_overrides();
    assert_eq!(overrides.get("undeclared"), Some(&Policy::Always));
    assert_eq!(overrides.get("slow"), None, "a job left on its default keeps following it");
}

#[test]
fn keep_running_instead_of_pausing_leaves_a_registered_job_running_in_game() {
    let f = fixture(true);
    f.registry.declare(spec("a", Policy::PauseInGame));
    f.registry.keep_running_instead_of_pausing();
    let h = f.registry.register(spec("a", Policy::PauseInGame));
    h.start();
    assert_eq!(checkpoint_in_thread(h).recv_timeout(WAIT), Ok(Flow::Continue));
    assert_eq!(state(&f, "a"), JobState::Running);
}

#[test]
fn waiting_on_the_game_flag_returns_once_the_game_exits() {
    let game = GameFlag::new(true);
    let (tx, rx) = mpsc::channel();
    let waiter = game.clone();
    thread::spawn(move || {
        waiter.wait_while_running();
        let _ = tx.send(());
    });
    assert!(rx.recv_timeout(QUIET).is_err(), "returned while the game was running");
    game.set(false);
    assert!(rx.recv_timeout(WAIT).is_ok());
}

#[test]
fn waiting_on_the_game_flag_returns_at_once_without_the_game() {
    GameFlag::new(false).wait_while_running();
}
