use std::collections::VecDeque;

use crate::Presence;

pub const MAX_DELAY_SECS: u32 = 120;

pub fn clamp_delay_secs(secs: u32) -> u32 {
    secs.min(MAX_DELAY_SECS)
}

/// Shows each presence `secs` after it was true. A queued value is due by the delay in force when it is
/// checked, so a changed delay re-times everything still queued. A released value keeps the timestamps it
/// was released with, so a later change of the delay never moves a timer that is already showing.
#[derive(Debug, Clone, Default)]
pub struct Delay {
    secs: u32,
    queue: VecDeque<(u64, Option<Presence>)>,
    /// The last value queued, so an unchanged presence is queued once rather than every tick.
    last: Option<Option<Presence>>,
    shown: Option<Presence>,
}

impl Delay {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn secs(&self) -> u32 {
        self.secs
    }

    pub fn set_secs(&mut self, secs: u32) {
        self.secs = clamp_delay_secs(secs);
    }

    /// Records what is true at `now_ms` and answers what may be shown at `now_ms`.
    pub fn tick(&mut self, desired: Option<Presence>, now_ms: u64) -> Option<Presence> {
        if self.last.as_ref() != Some(&desired) {
            self.queue.push_back((now_ms, desired.clone()));
            self.last = Some(desired);
        }
        let wait_ms = u64::from(self.secs) * 1_000;
        let mut released = None;
        while self.queue.front().is_some_and(|(at, _)| at.saturating_add(wait_ms) <= now_ms) {
            released = self.queue.pop_front().map(|(_, presence)| presence);
        }
        if let Some(presence) = released {
            self.shown = presence.map(|p| shifted(p, self.secs));
        }
        self.shown.clone()
    }

    /// Hides the presence now and forgets everything queued.
    pub fn clear(&mut self) {
        self.queue.clear();
        self.last = None;
        self.shown = None;
    }

    pub fn pending(&self) -> usize {
        self.queue.len()
    }
}

/// Discord counts its timer from the start timestamp, so a held-back start must move by the delay or the
/// timer would read the live time.
fn shifted(mut presence: Presence, secs: u32) -> Presence {
    presence.start_timestamp = presence.start_timestamp.map(|t| t.saturating_add(i64::from(secs)));
    presence
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(details: &str, start: Option<i64>) -> Option<Presence> {
        Some(Presence { details: Some(details.into()), start_timestamp: start, ..Presence::default() })
    }

    fn delayed(secs: u32) -> Delay {
        let mut d = Delay::new();
        d.set_secs(secs);
        d
    }

    #[test]
    fn zero_delay_passes_every_value_through_unchanged() {
        let mut d = Delay::new();
        assert_eq!(d.tick(p("a", Some(100)), 0), p("a", Some(100)));
        assert_eq!(d.tick(p("b", Some(200)), 2_000), p("b", Some(200)));
        assert_eq!(d.tick(None, 4_000), None);
        assert_eq!(d.pending(), 0);
    }

    #[test]
    fn a_value_is_shown_only_once_the_delay_has_passed() {
        let mut d = delayed(30);
        assert_eq!(d.tick(p("a", None), 0), None);
        assert_eq!(d.tick(p("a", None), 29_999), None);
        assert_eq!(d.tick(p("a", None), 30_000), p("a", None));
    }

    #[test]
    fn the_previous_value_stays_until_the_next_one_is_due() {
        let mut d = delayed(30);
        d.tick(p("a", None), 0);
        assert_eq!(d.tick(p("b", None), 10_000), None);
        assert_eq!(d.tick(p("b", None), 30_000), p("a", None));
        assert_eq!(d.tick(p("b", None), 39_999), p("a", None));
        assert_eq!(d.tick(p("b", None), 40_000), p("b", None));
    }

    #[test]
    fn timestamps_move_forward_by_the_delay_so_the_timer_reads_what_it_read_then() {
        let mut d = delayed(30);
        d.tick(p("a", Some(1_000)), 0);
        assert_eq!(d.tick(p("a", Some(1_000)), 30_000), p("a", Some(1_030)));
    }

    #[test]
    fn a_cleared_activity_follows_the_delay_too() {
        let mut d = delayed(10);
        d.tick(p("a", None), 0);
        assert_eq!(d.tick(None, 10_000), p("a", None));
        assert_eq!(d.tick(None, 19_999), p("a", None));
        assert_eq!(d.tick(None, 20_000), None);
    }

    #[test]
    fn an_unchanged_value_is_queued_once() {
        let mut d = delayed(60);
        for t in 0..30 {
            d.tick(p("a", Some(5)), t * 2_000);
        }
        assert_eq!(d.pending(), 1);
        d.tick(p("b", Some(5)), 60_000);
        assert_eq!(d.pending(), 1);
    }

    #[test]
    fn clear_hides_at_once_and_drops_what_was_queued() {
        let mut d = delayed(10);
        d.tick(p("a", None), 0);
        d.tick(p("b", None), 10_000);
        d.clear();
        assert_eq!(d.pending(), 0);
        assert_eq!(d.tick(p("c", None), 12_000), None);
        assert_eq!(d.tick(p("c", None), 20_000), None);
        assert_eq!(d.tick(p("c", None), 22_000), p("c", None));
    }

    #[test]
    fn lowering_the_delay_shows_what_is_now_due() {
        let mut d = delayed(120);
        d.tick(p("a", Some(0)), 0);
        d.tick(p("b", Some(0)), 50_000);
        assert_eq!(d.tick(p("b", Some(0)), 60_000), None);
        d.set_secs(30);
        assert_eq!(d.tick(p("b", Some(0)), 60_000), p("a", Some(30)));
        assert_eq!(d.tick(p("b", Some(0)), 79_999), p("a", Some(30)));
        assert_eq!(d.tick(p("b", Some(0)), 80_000), p("b", Some(30)));
        assert_eq!(d.pending(), 0);
    }

    #[test]
    fn lowering_the_delay_to_zero_shows_the_latest_value() {
        let mut d = delayed(120);
        d.tick(p("a", None), 0);
        d.tick(p("b", None), 2_000);
        d.set_secs(0);
        assert_eq!(d.tick(p("b", None), 4_000), p("b", None));
    }

    #[test]
    fn raising_the_delay_keeps_what_is_shown_and_retimes_the_queue() {
        let mut d = delayed(10);
        d.tick(p("a", None), 0);
        d.tick(p("b", None), 10_000);
        d.set_secs(60);
        assert_eq!(d.tick(p("b", None), 20_000), p("a", None));
        assert_eq!(d.tick(p("b", None), 69_999), p("a", None));
        assert_eq!(d.tick(p("b", None), 70_000), p("b", None));
    }

    #[test]
    fn the_delay_is_clamped_to_two_minutes() {
        assert_eq!(clamp_delay_secs(0), 0);
        assert_eq!(clamp_delay_secs(MAX_DELAY_SECS), 120);
        assert_eq!(clamp_delay_secs(500), 120);
        let mut d = delayed(u32::MAX);
        assert_eq!(d.secs(), MAX_DELAY_SECS);
        d.tick(p("a", None), 0);
        assert_eq!(d.tick(p("a", None), 120_000), p("a", None));
    }

    #[test]
    fn a_clock_that_steps_back_does_not_panic_or_release_early() {
        let mut d = delayed(10);
        d.tick(p("a", None), 50_000);
        assert_eq!(d.tick(p("a", None), 1_000), None);
        assert_eq!(d.tick(p("a", None), 60_000), p("a", None));
    }
}
