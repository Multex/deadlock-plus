use std::sync::Mutex;
use std::time::Duration;

use dp_sync::LockExt;
use tokio::time::Instant;

/// Who is asking for a request. A higher priority is served first while requests are scarce.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Priority {
    /// A recovery run: a failed read leaves an account's history unsent.
    Recovery,
    /// Background work nobody waits on.
    Background,
    /// A view. It never waits: it gets `Busy` and asks again later.
    Ui,
}

impl Priority {
    fn rank(self) -> usize {
        self as usize
    }
}

/// The limiter is too low on requests for a view to spend one now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Busy {
    pub retry_in: Duration,
}

/// A token bucket kept as earned time: one token is `per_token` of credit, so the refill math stays
/// exact. In any window of length `w` it admits at most `burst + w / per_token` requests.
#[derive(Debug)]
struct Bucket {
    per_token: Duration,
    cap: Duration,
    credit: Duration,
    at: Instant,
}

impl Bucket {
    fn full(per_token: Duration, burst: u32, now: Instant) -> Self {
        let cap = per_token * burst;
        Self { per_token, cap, credit: cap, at: now }
    }

    fn refill(&mut self, now: Instant) {
        if now > self.at {
            self.credit = (self.credit + (now - self.at)).min(self.cap);
            self.at = now;
        }
    }

    fn tokens(&self) -> u32 {
        u32::try_from(self.credit.as_nanos() / self.per_token.as_nanos()).unwrap_or(u32::MAX)
    }

    /// Takes one token if `keep` more would still be left, or says how long until it could.
    fn take(&mut self, now: Instant, keep: u32) -> Result<(), Duration> {
        self.refill(now);
        let need = self.per_token * (keep + 1);
        if self.credit >= need {
            self.credit -= self.per_token;
            Ok(())
        } else {
            Err(need - self.credit)
        }
    }
}

/// One shared request budget for an API endpoint, used by every caller of that endpoint.
pub struct Limiter {
    name: &'static str,
    ui_reserve: u32,
    state: Mutex<State>,
}

struct State {
    bucket: Bucket,
    /// Callers waiting for a token, by `Priority::rank`.
    waiting: [usize; 3],
    admitted: u64,
}

impl Limiter {
    /// Starts full. A view is only served while more than `ui_reserve` tokens are left.
    pub fn new(name: &'static str, per_token: Duration, burst: u32, ui_reserve: u32) -> Self {
        let bucket = Bucket::full(per_token, burst, Instant::now());
        Self { name, ui_reserve, state: Mutex::new(State { bucket, waiting: [0; 3], admitted: 0 }) }
    }

    /// How many requests the limiter has let through. Logged on every admission.
    #[cfg(test)]
    pub fn admitted(&self) -> u64 {
        self.state.lock_or_recover().admitted
    }

    /// Waits for a token, except at `Priority::Ui`, which gets `Busy` instead of waiting.
    pub async fn acquire(&self, priority: Priority) -> Result<(), Busy> {
        let mut queued = None;
        loop {
            let wait = self.try_take(priority);
            let wait = match wait {
                Ok(()) => return Ok(()),
                Err(wait) if priority == Priority::Ui => {
                    log::debug!("{}: busy, a view has to wait {wait:?}", self.name);
                    return Err(Busy { retry_in: wait });
                }
                Err(wait) => wait,
            };
            if queued.is_none() {
                self.state.lock_or_recover().waiting[priority.rank()] += 1;
                queued = Some(Queued { limiter: self, rank: priority.rank() });
            }
            tokio::time::sleep(wait).await;
        }
    }

    fn try_take(&self, priority: Priority) -> Result<(), Duration> {
        let mut state = self.state.lock_or_recover();
        let rank = priority.rank();
        let ahead = if priority == Priority::Ui {
            state.waiting.iter().sum::<usize>()
        } else {
            state.waiting[..rank].iter().sum()
        };
        // A higher priority caller wakes for the next token; this one tries again a token later.
        if ahead > 0 {
            return Err(state.bucket.per_token);
        }
        let keep = if priority == Priority::Ui { self.ui_reserve } else { 0 };
        let now = Instant::now();
        state.bucket.take(now, keep)?;
        state.admitted += 1;
        log::debug!(
            "{}: request {} admitted ({priority:?}, {} token(s) left)",
            self.name,
            state.admitted,
            state.bucket.tokens()
        );
        Ok(())
    }
}

/// Counts a caller in `waiting` until it gets a token or gives up.
struct Queued<'a> {
    limiter: &'a Limiter,
    rank: usize,
}

impl Drop for Queued<'_> {
    fn drop(&mut self) {
        self.limiter.state.lock_or_recover().waiting[self.rank] -= 1;
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    #[test]
    fn a_full_bucket_holds_its_burst() {
        let t0 = Instant::now();
        let mut bucket = Bucket::full(ms(3000), 6, t0);
        for _ in 0..6 {
            assert_eq!(bucket.take(t0, 0), Ok(()));
        }
        assert_eq!(bucket.take(t0, 0), Err(ms(3000)));
    }

    #[test]
    fn tokens_come_back_at_the_rate() {
        let t0 = Instant::now();
        let mut bucket = Bucket::full(ms(3000), 1, t0);
        bucket.take(t0, 0).unwrap();
        assert_eq!(bucket.take(t0 + ms(1000), 0), Err(ms(2000)));
        assert_eq!(bucket.take(t0 + ms(3000), 0), Ok(()));
        assert_eq!(bucket.take(t0 + ms(3000), 0), Err(ms(3000)));
    }

    #[test]
    fn an_idle_bucket_refills_only_to_its_burst() {
        let t0 = Instant::now();
        let mut bucket = Bucket::full(ms(3000), 6, t0);
        for _ in 0..6 {
            bucket.take(t0, 0).unwrap();
        }
        bucket.refill(t0 + Duration::from_secs(3600));
        assert_eq!(bucket.tokens(), 6);
    }

    #[test]
    fn a_kept_reserve_is_not_taken() {
        let t0 = Instant::now();
        let mut bucket = Bucket::full(ms(3000), 4, t0);
        assert_eq!(bucket.take(t0, 2), Ok(()));
        assert_eq!(bucket.take(t0, 2), Ok(()));
        assert_eq!(bucket.take(t0, 2), Err(ms(3000)));
        assert_eq!(bucket.tokens(), 2);
    }

    /// The metadata budget against deadlock-api's 30 a minute per IP, with a caller that never stops asking.
    #[test]
    fn no_minute_ever_admits_thirty() {
        let t0 = Instant::now();
        let mut bucket = Bucket::full(ms(3000), 6, t0);
        let mut admitted = Vec::new();
        for step in 0..(10 * 60 * 10) {
            let now = t0 + ms(step * 100);
            while bucket.take(now, 0).is_ok() {
                admitted.push(now);
            }
        }
        let worst = admitted
            .iter()
            .map(|&start| admitted.iter().filter(|&&t| t >= start && t < start + Duration::from_secs(60)).count())
            .max()
            .unwrap();
        assert!(worst <= 26, "{worst}");
    }

    #[test]
    fn a_view_is_busy_once_only_the_reserve_is_left() {
        let limiter = Limiter::new("test", ms(3000), 4, 2);
        tauri::async_runtime::block_on(async {
            assert_eq!(limiter.acquire(Priority::Ui).await, Ok(()));
            assert_eq!(limiter.acquire(Priority::Background).await, Ok(()));
            let busy = limiter.acquire(Priority::Ui).await.unwrap_err();
            assert!(busy.retry_in > ms(2900) && busy.retry_in <= ms(3000), "{busy:?}");
            assert_eq!(limiter.acquire(Priority::Recovery).await, Ok(()));
        });
        assert_eq!(limiter.admitted(), 3);
    }

    #[test]
    fn recovery_is_served_before_background() {
        let limiter = Arc::new(Limiter::new("test", ms(60), 1, 0));
        let order = Arc::new(Mutex::new(Vec::new()));
        tauri::async_runtime::block_on(async {
            limiter.acquire(Priority::Recovery).await.unwrap();
            let spawn = |priority| {
                let (limiter, order) = (limiter.clone(), order.clone());
                tauri::async_runtime::spawn(async move {
                    limiter.acquire(priority).await.unwrap();
                    order.lock().unwrap().push(priority);
                })
            };
            let background = spawn(Priority::Background);
            tokio::time::sleep(ms(10)).await;
            let recovery = spawn(Priority::Recovery);
            background.await.unwrap();
            recovery.await.unwrap();
        });
        assert_eq!(*order.lock().unwrap(), vec![Priority::Recovery, Priority::Background]);
    }

    #[test]
    fn a_dropped_waiter_leaves_the_queue() {
        let limiter = Limiter::new("test", ms(40), 1, 0);
        tauri::async_runtime::block_on(async {
            limiter.acquire(Priority::Recovery).await.unwrap();
            let gave_up = tokio::time::timeout(ms(5), limiter.acquire(Priority::Recovery)).await;
            assert!(gave_up.is_err());
            tokio::time::sleep(ms(50)).await;
            assert_eq!(limiter.acquire(Priority::Background).await, Ok(()));
        });
    }

    #[test]
    fn many_callers_together_stay_under_the_rate() {
        const CALLERS: u32 = 40;
        const BURST: u32 = 3;
        let per_token = ms(20);
        let limiter = Arc::new(Limiter::new("test", per_token, BURST, 0));
        let start = std::time::Instant::now();
        tauri::async_runtime::block_on(async {
            let tasks: Vec<_> = (0..CALLERS)
                .map(|i| {
                    let limiter = limiter.clone();
                    let priority = if i % 2 == 0 { Priority::Recovery } else { Priority::Background };
                    tauri::async_runtime::spawn(async move { limiter.acquire(priority).await.unwrap() })
                })
                .collect();
            for task in tasks {
                task.await.unwrap();
            }
        });
        assert_eq!(limiter.admitted(), u64::from(CALLERS));
        assert!(start.elapsed() >= per_token * (CALLERS - BURST), "{:?}", start.elapsed());
    }
}
