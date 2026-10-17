use std::collections::HashSet;
use std::net::IpAddr;
use std::time::{Duration, Instant};

use dp_server_picker::definitions::load_definitions;
use dp_server_picker::sdr::{fetch_server_data, ServerData};

const REFETCH_INTERVAL: Duration = Duration::from_secs(600);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

pub fn relay_set(data: &[ServerData]) -> HashSet<IpAddr> {
    data.iter()
        .flat_map(|d| d.unclustered.iter().chain(&d.clustered))
        .flat_map(|g| &g.relay_ips)
        .filter_map(|ip| ip.parse().ok())
        .collect()
}

type Fetch = Box<dyn FnMut() -> Result<HashSet<IpAddr>, String> + Send>;

pub struct RelayCache {
    fetch: Fetch,
    now: Box<dyn Fn() -> Instant + Send>,
    last_good: Option<HashSet<IpAddr>>,
    last_attempt: Option<Instant>,
}

impl RelayCache {
    pub fn new() -> Self {
        Self::with_parts(Box::new(fetch_live), Box::new(Instant::now))
    }

    fn with_parts(fetch: Fetch, now: Box<dyn Fn() -> Instant + Send>) -> Self {
        Self { fetch, now, last_good: None, last_attempt: None }
    }

    /// Fetches on first use. Later it refetches only when `refresh` is set and ten minutes have
    /// passed since the last attempt, failed or not. A failed fetch keeps serving the last good
    /// set; with no good set yet, every call retries and reports the error.
    pub fn get(&mut self, refresh: bool) -> Result<HashSet<IpAddr>, String> {
        let now = (self.now)();
        let due = match (&self.last_good, self.last_attempt) {
            (None, _) | (_, None) => true,
            (Some(_), Some(at)) => refresh && now.saturating_duration_since(at) >= REFETCH_INTERVAL,
        };
        if due {
            self.last_attempt = Some(now);
            match (self.fetch)() {
                Ok(set) => self.last_good = Some(set),
                Err(e) if self.last_good.is_none() => return Err(e),
                Err(e) => log::warn!("relay refresh failed, keeping the last set: {e}"),
            }
        }
        Ok(self.last_good.clone().unwrap_or_default())
    }
}

impl Default for RelayCache {
    fn default() -> Self {
        Self::new()
    }
}

fn fetch_live() -> Result<HashSet<IpAddr>, String> {
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .user_agent("deadlock-plus")
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;
    let data = runtime.block_on(async {
        let mut all = Vec::new();
        for def in load_definitions() {
            all.push(fetch_server_data(&client, &def).await.map_err(|e| e.to_string())?);
        }
        Ok::<_, String>(all)
    })?;
    Ok(relay_set(&data))
}

#[cfg(test)]
mod tests {
    use super::*;
    use dp_server_picker::sdr::ServerGroup;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};

    fn group(ips: &[&str]) -> ServerGroup {
        ServerGroup {
            id: "g".into(),
            description: "G".into(),
            is_cluster: false,
            country_code: None,
            relay_ips: ips.iter().map(|s| s.to_string()).collect(),
            member_ids: Vec::new(),
            routing_note: None,
        }
    }

    fn data(unclustered: &[&[&str]], clustered: &[&[&str]]) -> ServerData {
        ServerData {
            revision: "1".into(),
            unclustered: unclustered.iter().map(|i| group(i)).collect(),
            clustered: clustered.iter().map(|i| group(i)).collect(),
        }
    }

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn relay_set_covers_both_lists_and_all_data() {
        let a = data(&[&["1.1.1.1"]], &[&["2.2.2.2", "3.3.3.3"]]);
        let b = data(&[&["4.4.4.4"]], &[]);
        let set = relay_set(&[a, b]);
        assert_eq!(set, ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4"].map(ip).into_iter().collect());
    }

    #[test]
    fn relay_set_dedupes_and_skips_unparsable() {
        let d = data(&[&["1.1.1.1", "nope", ""]], &[&["1.1.1.1", "::1"]]);
        let set = relay_set(&[d]);
        assert_eq!(set, ["1.1.1.1", "::1"].map(ip).into_iter().collect());
    }

    #[test]
    fn relay_set_of_nothing_is_empty() {
        assert!(relay_set(&[]).is_empty());
    }

    type Results = Arc<Mutex<Vec<Result<HashSet<IpAddr>, String>>>>;

    struct Rig {
        cache: RelayCache,
        calls: Arc<AtomicUsize>,
        results: Results,
        clock: Arc<Mutex<Instant>>,
    }

    impl Rig {
        fn new(results: Vec<Result<HashSet<IpAddr>, String>>) -> Self {
            let calls = Arc::new(AtomicUsize::new(0));
            let results = Arc::new(Mutex::new(results));
            let clock = Arc::new(Mutex::new(Instant::now()));
            let (c, r, k) = (calls.clone(), results.clone(), clock.clone());
            let cache = RelayCache::with_parts(
                Box::new(move || {
                    c.fetch_add(1, Ordering::SeqCst);
                    r.lock().unwrap().remove(0)
                }),
                Box::new(move || *k.lock().unwrap()),
            );
            Self { cache, calls, results, clock }
        }

        fn advance(&self, by: Duration) {
            *self.clock.lock().unwrap() += by;
        }

        fn calls(&self) -> usize {
            self.calls.load(Ordering::SeqCst)
        }
    }

    fn set(ips: &[&str]) -> HashSet<IpAddr> {
        ips.iter().map(|s| ip(s)).collect()
    }

    #[test]
    fn first_get_fetches_even_without_refresh() {
        let mut rig = Rig::new(vec![Ok(set(&["1.1.1.1"]))]);
        assert_eq!(rig.cache.get(false).unwrap(), set(&["1.1.1.1"]));
        assert_eq!(rig.calls(), 1);
    }

    #[test]
    fn get_without_refresh_never_refetches() {
        let mut rig = Rig::new(vec![Ok(set(&["1.1.1.1"])), Ok(set(&["2.2.2.2"]))]);
        rig.cache.get(false).unwrap();
        rig.advance(Duration::from_secs(3600));
        assert_eq!(rig.cache.get(false).unwrap(), set(&["1.1.1.1"]));
        assert_eq!(rig.calls(), 1);
    }

    #[test]
    fn refresh_within_ten_minutes_is_ignored() {
        let mut rig = Rig::new(vec![Ok(set(&["1.1.1.1"])), Ok(set(&["2.2.2.2"]))]);
        rig.cache.get(false).unwrap();
        rig.advance(Duration::from_secs(599));
        assert_eq!(rig.cache.get(true).unwrap(), set(&["1.1.1.1"]));
        assert_eq!(rig.calls(), 1);
    }

    #[test]
    fn refresh_after_ten_minutes_refetches() {
        let mut rig = Rig::new(vec![Ok(set(&["1.1.1.1"])), Ok(set(&["2.2.2.2"]))]);
        rig.cache.get(false).unwrap();
        rig.advance(Duration::from_secs(600));
        assert_eq!(rig.cache.get(true).unwrap(), set(&["2.2.2.2"]));
        assert_eq!(rig.calls(), 2);
    }

    #[test]
    fn failed_refresh_keeps_last_good_and_still_throttles() {
        let mut rig = Rig::new(vec![Ok(set(&["1.1.1.1"])), Err("down".into()), Ok(set(&["2.2.2.2"]))]);
        rig.cache.get(false).unwrap();
        rig.advance(Duration::from_secs(600));
        assert_eq!(rig.cache.get(true).unwrap(), set(&["1.1.1.1"]));
        assert_eq!(rig.calls(), 2);
        rig.advance(Duration::from_secs(60));
        assert_eq!(rig.cache.get(true).unwrap(), set(&["1.1.1.1"]));
        assert_eq!(rig.calls(), 2);
        rig.advance(Duration::from_secs(600));
        assert_eq!(rig.cache.get(true).unwrap(), set(&["2.2.2.2"]));
    }

    #[test]
    fn first_fetch_failure_is_an_error_and_retried_next_time() {
        let mut rig = Rig::new(vec![Err("down".into()), Ok(set(&["1.1.1.1"]))]);
        assert_eq!(rig.cache.get(false).unwrap_err(), "down");
        assert_eq!(rig.cache.get(false).unwrap(), set(&["1.1.1.1"]));
        assert_eq!(rig.calls(), 2);
        assert!(rig.results.lock().unwrap().is_empty());
    }
}
