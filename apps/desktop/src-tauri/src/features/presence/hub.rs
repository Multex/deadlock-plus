use dp_discord_ipc::{Activity, Pipe};
use dp_presence::{Coalescer, Poll, Presence};

use super::activity::to_activity;

pub trait Sink {
    fn set(&mut self, activity: &Activity) -> Result<(), String>;
    fn clear(&mut self) -> Result<(), String>;
}

impl Sink for dp_discord_ipc::Client<dp_discord_ipc::Connection> {
    fn set(&mut self, activity: &Activity) -> Result<(), String> {
        self.set_activity(activity).map_err(|e| e.to_string())
    }

    fn clear(&mut self) -> Result<(), String> {
        self.clear_activity().map_err(|e| e.to_string())
    }
}

struct Conn<S> {
    index: u8,
    sink: S,
    coalescer: Coalescer,
}

/// One connection per target pipe, each with its own coalescer: Discord rate-limits per connection, and a
/// reconnected client knows nothing of what was sent before.
pub struct Hub<S> {
    conns: Vec<Conn<S>>,
    /// Pipes whose last connect failed, with when to try again. Discord accepts and drops each open, so a pipe
    /// that will not hand-shake is not opened on every tick.
    retry_at: Vec<(u8, u64)>,
}

/// How long a pipe that failed to connect waits before it is opened again.
const CONNECT_RETRY_MS: u64 = 30_000;

impl<S: Sink> Hub<S> {
    pub fn new() -> Self {
        Self { conns: Vec::new(), retry_at: Vec::new() }
    }

    pub fn connected(&self) -> Vec<u8> {
        self.conns.iter().map(|c| c.index).collect()
    }

    /// Brings the connections in line with `targets`, then sends what each one still owes. Connections that
    /// are no longer targeted are cleared first. A failed send drops its connection, so the next tick
    /// reconnects with a fresh coalescer.
    pub fn tick(
        &mut self,
        targets: &[Pipe],
        desired: &Option<Presence>,
        now_ms: u64,
        mut connect: impl FnMut(&Pipe) -> Option<S>,
    ) {
        self.conns.retain_mut(|c| {
            let keep = targets.iter().any(|t| t.index == c.index);
            if !keep {
                let _ = c.sink.clear();
            }
            keep
        });

        self.retry_at.retain(|(index, _)| targets.iter().any(|t| t.index == *index));
        for pipe in targets {
            if self.conns.iter().any(|c| c.index == pipe.index) {
                continue;
            }
            if self.retry_at.iter().any(|&(index, at)| index == pipe.index && now_ms < at) {
                continue;
            }
            self.retry_at.retain(|(index, _)| *index != pipe.index);
            match connect(pipe) {
                Some(sink) => self.conns.push(Conn { index: pipe.index, sink, coalescer: Coalescer::new() }),
                None => self.retry_at.push((pipe.index, now_ms + CONNECT_RETRY_MS)),
            }
        }

        self.conns.retain_mut(|c| {
            let result = match c.coalescer.poll(desired, now_ms) {
                Poll::Send(Some(p)) => c.sink.set(&to_activity(&p)),
                Poll::Send(None) => c.sink.clear(),
                Poll::Idle | Poll::WaitMs(_) => return true,
            };
            if let Err(e) = &result {
                log::debug!("presence send to pipe {} failed, reconnecting: {e}", c.index);
            }
            result.is_ok()
        });
    }

    pub fn shutdown(&mut self) {
        for mut c in self.conns.drain(..) {
            let _ = c.sink.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    #[derive(Clone, Default)]
    struct Log(Rc<RefCell<Vec<String>>>);

    struct Fake {
        id: u8,
        log: Log,
        fail: Rc<RefCell<bool>>,
    }

    impl Sink for Fake {
        fn set(&mut self, a: &Activity) -> Result<(), String> {
            if *self.fail.borrow() {
                return Err("broken".into());
            }
            self.log.0.borrow_mut().push(format!("{}:set:{}", self.id, a.details.clone().unwrap_or_default()));
            Ok(())
        }

        fn clear(&mut self) -> Result<(), String> {
            self.log.0.borrow_mut().push(format!("{}:clear", self.id));
            Ok(())
        }
    }

    fn pipe(i: u8) -> Pipe {
        Pipe::new(i, None)
    }

    fn want(s: &str) -> Option<Presence> {
        Some(Presence { details: Some(s.into()), ..Presence::default() })
    }

    struct Rig {
        hub: Hub<Fake>,
        log: Log,
        fail: Rc<RefCell<bool>>,
        connects: u32,
    }

    impl Rig {
        fn new() -> Self {
            Self { hub: Hub::new(), log: Log::default(), fail: Rc::default(), connects: 0 }
        }

        fn tick(&mut self, targets: &[Pipe], desired: &Option<Presence>, now: u64) {
            let (log, fail) = (self.log.clone(), self.fail.clone());
            let connects = &mut self.connects;
            self.hub.tick(targets, desired, now, |p| {
                *connects += 1;
                Some(Fake { id: p.index, log: log.clone(), fail: fail.clone() })
            });
        }

        fn take(&self) -> Vec<String> {
            std::mem::take(&mut *self.log.0.borrow_mut())
        }
    }

    #[test]
    fn sends_once_to_each_target() {
        let mut r = Rig::new();
        r.tick(&[pipe(0), pipe(1)], &want("a"), 0);
        r.tick(&[pipe(0), pipe(1)], &want("a"), 2_000);
        assert_eq!(r.take(), ["0:set:a", "1:set:a"]);
        assert_eq!(r.hub.connected(), [0, 1]);
    }

    #[test]
    fn a_new_pipe_gets_the_current_presence_immediately() {
        let mut r = Rig::new();
        r.tick(&[pipe(0)], &want("a"), 0);
        r.take();
        r.tick(&[pipe(0), pipe(1)], &want("a"), 2_000);
        assert_eq!(r.take(), ["1:set:a"]);
    }

    #[test]
    fn a_vanished_pipe_is_dropped_and_a_returning_one_is_resent() {
        let mut r = Rig::new();
        r.tick(&[pipe(0)], &want("a"), 0);
        r.tick(&[], &want("a"), 2_000);
        assert!(r.hub.connected().is_empty());
        r.take();
        r.tick(&[pipe(0)], &want("a"), 4_000);
        assert_eq!(r.take(), ["0:set:a"]);
        assert_eq!(r.connects, 2);
    }

    #[test]
    fn deselecting_a_live_client_clears_it() {
        let mut r = Rig::new();
        r.tick(&[pipe(0), pipe(1)], &want("a"), 0);
        r.take();
        r.tick(&[pipe(1)], &want("a"), 2_000);
        assert_eq!(r.take(), ["0:clear"]);
    }

    #[test]
    fn failed_send_reconnects_with_fresh_coalescer() {
        let mut r = Rig::new();
        r.tick(&[pipe(0)], &want("a"), 0);
        *r.fail.borrow_mut() = true;
        r.tick(&[pipe(0)], &want("b"), 20_000);
        assert!(r.hub.connected().is_empty());
        *r.fail.borrow_mut() = false;
        r.take();
        r.tick(&[pipe(0)], &want("b"), 22_000);
        assert_eq!(r.take(), ["0:set:b"]);
    }

    #[test]
    fn rate_limit_is_per_connection() {
        let mut r = Rig::new();
        r.tick(&[pipe(0)], &want("a"), 0);
        r.take();
        r.tick(&[pipe(0), pipe(1)], &want("b"), 2_000);
        assert_eq!(r.take(), ["1:set:b"]);
        r.tick(&[pipe(0), pipe(1)], &want("b"), 15_000);
        assert_eq!(r.take(), ["0:set:b"]);
    }

    #[test]
    fn losing_the_game_clears_via_the_target_list() {
        let mut r = Rig::new();
        r.tick(&[pipe(0)], &want("a"), 0);
        r.take();
        r.tick(&[], &None, 2_000);
        assert_eq!(r.take(), ["0:clear"]);
    }

    #[test]
    fn shutdown_clears_everything() {
        let mut r = Rig::new();
        r.tick(&[pipe(0), pipe(1)], &want("a"), 0);
        r.take();
        r.hub.shutdown();
        assert_eq!(r.take(), ["0:clear", "1:clear"]);
        assert!(r.hub.connected().is_empty());
    }

    fn attempts(hub: &mut Hub<Fake>, targets: &[Pipe], at: &[u64]) -> Vec<u64> {
        let mut tried = Vec::new();
        for &now in at {
            hub.tick(targets, &want("a"), now, |_| {
                tried.push(now);
                None
            });
        }
        tried
    }

    #[test]
    fn an_unreachable_pipe_waits_before_it_is_opened_again() {
        let mut hub: Hub<Fake> = Hub::new();
        let tried = attempts(&mut hub, &[pipe(0)], &[0, 2_000, 28_000, 30_000, 32_000, 60_000]);
        assert_eq!(tried, [0, 30_000, 60_000]);
        assert!(hub.connected().is_empty());
    }

    #[test]
    fn a_pipe_that_reappears_is_tried_at_once() {
        let mut hub: Hub<Fake> = Hub::new();
        attempts(&mut hub, &[pipe(0)], &[0]);
        attempts(&mut hub, &[], &[2_000]);
        assert_eq!(attempts(&mut hub, &[pipe(0)], &[4_000]), [4_000]);
    }

    #[test]
    fn waiting_on_one_pipe_does_not_hold_back_another() {
        let mut hub: Hub<Fake> = Hub::new();
        attempts(&mut hub, &[pipe(0)], &[0]);
        assert_eq!(attempts(&mut hub, &[pipe(0), pipe(1)], &[2_000]), [2_000]);
    }
}
