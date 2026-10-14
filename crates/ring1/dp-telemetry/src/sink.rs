use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::Value;

use crate::config::Config;
use crate::event::{self, Context};
use crate::gate::Gate;

/// Heartbeats are the bulk of the event budget, so the share of installs that send them is one number.
/// Counts are scaled back up by this factor when read in PostHog.
pub const HEARTBEAT_SAMPLE: u64 = 1;
pub const MAX_FEATURES_PER_SESSION: usize = 50;
const MAX_QUEUE: usize = 100;
const SEND_TIMEOUT: Duration = Duration::from_secs(5);

pub struct Telemetry {
    config: Config,
    gate: Gate,
    context: Mutex<Context>,
    install_id: Mutex<String>,
    queue: Mutex<VecDeque<Value>>,
    features_sent: AtomicUsize,
    heartbeat_sample: u64,
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// FNV-1a: the choice has to be the same on every run and every platform, which `DefaultHasher` does not promise.
fn sampled_in(install_id: &str, sample: u64) -> bool {
    let hash = install_id
        .bytes()
        .fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3));
    hash % sample.max(1) == 0
}

fn now() -> String {
    time::OffsetDateTime::now_utc().format(&time::format_description::well_known::Rfc3339).unwrap_or_default()
}

impl Telemetry {
    pub fn new(config: Config, context: Context, install_id: String) -> Self {
        Self {
            config,
            gate: Gate::default(),
            context: Mutex::new(context),
            install_id: Mutex::new(install_id),
            queue: Mutex::new(VecDeque::new()),
            features_sent: AtomicUsize::new(0),
            heartbeat_sample: HEARTBEAT_SAMPLE,
        }
    }

    pub fn with_heartbeat_sample(mut self, sample: u64) -> Self {
        self.heartbeat_sample = sample;
        self
    }

    pub fn gate(&self) -> Gate {
        self.gate.clone()
    }

    pub fn install_id(&self) -> String {
        lock(&self.install_id).clone()
    }

    /// The gate changes under the queue lock so an event cannot be queued after a close has cleared it.
    pub fn set_enabled(&self, enabled: bool) {
        let mut queue = lock(&self.queue);
        self.gate.set(enabled);
        if !enabled {
            queue.clear();
        }
    }

    pub fn set_locale(&self, locale: &str) {
        lock(&self.context).locale = locale.to_string();
    }

    pub fn reset_install_id(&self, dir: &std::path::Path) -> String {
        let fresh = crate::install_id::reset(dir);
        *lock(&self.install_id) = fresh.clone();
        fresh
    }

    pub fn app_started(&self) -> bool {
        self.record("app_started", &[])
    }

    pub fn app_exited(&self) -> bool {
        self.record("app_exited", &[])
    }

    pub fn heartbeat(&self) -> bool {
        sampled_in(&self.install_id(), self.heartbeat_sample) && self.record("heartbeat", &[])
    }

    pub fn feature_used(&self, feature: &str) -> bool {
        if !event::is_feature(feature) || self.features_sent.load(Ordering::SeqCst) >= MAX_FEATURES_PER_SESSION {
            return false;
        }
        let recorded = self.record("feature_used", &[("feature", feature)]);
        if recorded {
            self.features_sent.fetch_add(1, Ordering::SeqCst);
        }
        recorded
    }

    pub fn discord_invite_click(&self) -> bool {
        self.record("discord_invite_click", event::INVITE_CLICK)
    }

    pub fn update_shown(&self, to_version: &str) -> bool {
        event::is_version(to_version) && self.record("update_shown", &[("to_version", to_version)])
    }

    pub fn update_install_clicked(&self, to_version: &str, source: &str) -> bool {
        event::is_version(to_version)
            && event::is_install_source(source)
            && self.record("update_install_clicked", &[("to_version", to_version), ("source", source)])
    }

    fn record(&self, name: &str, extra: &[(&str, &str)]) -> bool {
        if self.config.posthog.is_none() {
            return false;
        }
        let mut queue = lock(&self.queue);
        if !self.gate.is_open() || queue.len() >= MAX_QUEUE {
            return false;
        }
        let event = event::build(&lock(&self.context), &self.install_id(), name, extra, &now());
        queue.push_back(event);
        true
    }

    pub fn pending(&self) -> usize {
        lock(&self.queue).len()
    }

    pub fn take_batch(&self) -> Option<Value> {
        let posthog = self.config.posthog.as_ref()?;
        let mut queue = lock(&self.queue);
        if queue.is_empty() || !self.gate.is_open() {
            return None;
        }
        let events: Vec<Value> = queue.drain(..).collect();
        Some(serde_json::json!({ "api_key": posthog.key, "batch": events }))
    }

    pub async fn flush(&self, http: &reqwest::Client) {
        let (Some(posthog), Some(batch)) = (self.config.posthog.as_ref(), self.take_batch()) else {
            return;
        };
        let sent = http.post(format!("{}/batch/", posthog.host)).timeout(SEND_TIMEOUT).json(&batch).send().await;
        match sent {
            Ok(response) if response.status().is_success() => {}
            Ok(response) => log::debug!("analytics batch rejected: {}", response.status()),
            Err(e) => log::debug!("analytics batch not sent: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::PostHogConfig;

    fn config() -> Config {
        Config {
            posthog: Some(PostHogConfig { key: "phc_key".into(), host: "https://eu.i.posthog.com".into() }),
            sentry_dsn: None,
        }
    }

    fn context() -> Context {
        Context { app_version: "0.8.0".into(), os: "windows".into(), os_arch: "x86_64".into(), locale: "en".into() }
    }

    fn telemetry() -> Telemetry {
        Telemetry::new(config(), context(), "install-1".into())
    }

    #[test]
    fn nothing_is_built_until_the_gate_opens() {
        let t = telemetry();
        assert!(!t.app_started());
        assert!(!t.feature_used("stats"));
        assert_eq!(t.pending(), 0);
    }

    #[test]
    fn closing_the_gate_drops_queued_events() {
        let t = telemetry();
        t.set_enabled(true);
        assert!(t.app_started());
        assert!(t.feature_used("stats"));
        assert_eq!(t.pending(), 2);
        t.set_enabled(false);
        assert_eq!(t.pending(), 0);
        assert!(t.take_batch().is_none());
        assert!(!t.heartbeat());
    }

    #[test]
    fn a_build_without_a_posthog_key_records_nothing() {
        let t = Telemetry::new(Config::default(), context(), "install-1".into());
        t.set_enabled(true);
        assert!(!t.app_started());
        assert_eq!(t.pending(), 0);
    }

    #[test]
    fn the_gate_handle_follows_set_enabled() {
        let t = telemetry();
        let gate = t.gate();
        assert!(!gate.is_open());
        t.set_enabled(true);
        assert!(gate.is_open());
        t.set_enabled(false);
        assert!(!gate.is_open());
    }

    #[test]
    fn an_invite_click_is_queued_only_while_the_gate_is_open() {
        let t = telemetry();
        assert!(!t.discord_invite_click());
        t.set_enabled(true);
        assert!(t.discord_invite_click());
        let batch = t.take_batch().unwrap();
        assert_eq!(batch["batch"][0]["event"], "discord_invite_click");
        assert_eq!(batch["batch"][0]["properties"]["channel"], "app");
    }

    #[test]
    fn an_update_shown_carries_only_the_version_and_follows_the_gate() {
        let t = telemetry();
        assert!(!t.update_shown("0.12.0"));
        t.set_enabled(true);
        assert!(t.update_shown("0.12.0"));
        let event = &t.take_batch().unwrap()["batch"][0];
        assert_eq!(event["event"], "update_shown");
        assert_eq!(event["properties"]["to_version"], "0.12.0");
        assert_eq!(event["properties"].as_object().unwrap().len(), 6);
    }

    #[test]
    fn an_update_shown_with_a_made_up_version_is_dropped() {
        let t = telemetry();
        t.set_enabled(true);
        assert!(!t.update_shown("not a version"));
        assert_eq!(t.pending(), 0);
    }

    #[test]
    fn an_install_click_carries_the_version_and_source_and_follows_the_gate() {
        let t = telemetry();
        assert!(!t.update_install_clicked("0.12.0", "banner"));
        t.set_enabled(true);
        assert!(t.update_install_clicked("0.12.0", "banner"));
        let event = &t.take_batch().unwrap()["batch"][0];
        assert_eq!(event["event"], "update_install_clicked");
        assert_eq!(event["properties"]["to_version"], "0.12.0");
        assert_eq!(event["properties"]["source"], "banner");
        assert_eq!(event["properties"].as_object().unwrap().len(), 7);
    }

    #[test]
    fn an_install_click_with_an_unknown_source_or_version_is_dropped() {
        let t = telemetry();
        t.set_enabled(true);
        assert!(!t.update_install_clicked("0.12.0", "somewhere"));
        assert!(!t.update_install_clicked("0.12", "about"));
        assert_eq!(t.pending(), 0);
    }

    #[test]
    fn unknown_features_are_rejected() {
        let t = telemetry();
        t.set_enabled(true);
        assert!(!t.feature_used("anything the page made up"));
        assert_eq!(t.pending(), 0);
    }

    #[test]
    fn a_session_sends_at_most_the_capped_number_of_feature_events() {
        let t = telemetry();
        t.set_enabled(true);
        let accepted = (0..MAX_FEATURES_PER_SESSION + 10).filter(|_| t.feature_used("stats")).count();
        assert_eq!(accepted, MAX_FEATURES_PER_SESSION);
    }

    #[test]
    fn the_queue_is_bounded() {
        let t = telemetry();
        t.set_enabled(true);
        for _ in 0..MAX_QUEUE + 20 {
            t.record("app_started", &[]);
        }
        assert_eq!(t.pending(), MAX_QUEUE);
    }

    #[test]
    fn a_batch_holds_the_key_and_every_queued_event_and_empties_the_queue() {
        let t = telemetry();
        t.set_enabled(true);
        t.app_started();
        t.feature_used("demos");
        let batch = t.take_batch().unwrap();
        assert_eq!(batch["api_key"], "phc_key");
        let events = batch["batch"].as_array().unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0]["event"], "app_started");
        assert_eq!(events[0]["distinct_id"], "install-1");
        assert_eq!(events[1]["properties"]["feature"], "demos");
        assert_eq!(t.pending(), 0);
    }

    #[test]
    fn the_locale_change_shows_up_in_later_events() {
        let t = telemetry();
        t.set_enabled(true);
        t.set_locale("de");
        t.app_started();
        assert_eq!(t.take_batch().unwrap()["batch"][0]["properties"]["locale"], "de");
    }

    #[test]
    fn reset_changes_the_id_used_by_later_events() {
        let dir = std::env::temp_dir().join(format!("dp-telemetry-sink-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let t = telemetry();
        t.set_enabled(true);
        let fresh = t.reset_install_id(&dir);
        assert_ne!(fresh, "install-1");
        assert_eq!(t.install_id(), fresh);
        t.app_started();
        assert_eq!(t.take_batch().unwrap()["batch"][0]["distinct_id"], fresh.as_str());
    }

    #[test]
    fn the_sample_is_a_stable_share_of_ids() {
        assert!(sampled_in("anything", 1));
        let ids: Vec<String> = (0..2000).map(|i| format!("id-{i}")).collect();
        let first: Vec<bool> = ids.iter().map(|id| sampled_in(id, 4)).collect();
        let second: Vec<bool> = ids.iter().map(|id| sampled_in(id, 4)).collect();
        assert_eq!(first, second);
        let share = first.iter().filter(|s| **s).count();
        assert!((350..650).contains(&share), "share was {share}");
    }

    #[test]
    fn heartbeats_follow_the_sample() {
        let all = telemetry().with_heartbeat_sample(1);
        all.set_enabled(true);
        assert!(all.heartbeat());
        let id = "install-1";
        let some = Telemetry::new(config(), context(), id.into()).with_heartbeat_sample(1_000_003);
        some.set_enabled(true);
        assert_eq!(some.heartbeat(), sampled_in(id, 1_000_003));
    }
}
