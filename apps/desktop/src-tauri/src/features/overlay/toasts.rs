use std::collections::VecDeque;
use std::time::{Duration, Instant};

use super::{OverlayToast, HIDE_MARGIN_MS};

/// Toasts pushed before the page can show them. More than the page can stack is never useful.
const MAX_PENDING: usize = 8;

/// Which toasts go to the page now, and when the window can hide. The page owns each card's own timer; this only
/// mirrors it to know when the last one has gone.
#[derive(Debug, Default)]
pub(super) struct Toasts {
    ready: bool,
    pending: VecDeque<OverlayToast>,
    hide_at: Option<Instant>,
}

impl Toasts {
    /// Returns the toasts to send now: none until the page has said it is ready.
    pub(super) fn push(&mut self, toast: OverlayToast, now: Instant) -> Vec<OverlayToast> {
        if !self.ready {
            if self.pending.len() == MAX_PENDING {
                self.pending.pop_front();
            }
            self.pending.push_back(toast);
            return Vec::new();
        }
        self.sent(&toast, now);
        vec![toast]
    }

    /// The page mounted; everything queued goes now.
    pub(super) fn ready(&mut self, now: Instant) -> Vec<OverlayToast> {
        self.ready = true;
        let toasts: Vec<_> = self.pending.drain(..).collect();
        for toast in &toasts {
            self.sent(toast, now);
        }
        toasts
    }

    /// A new page is loading: it has seen nothing yet. Queued toasts wait for it.
    pub(super) fn window_created(&mut self) {
        self.ready = false;
        self.hide_at = None;
    }

    /// The window is gone with the game; nothing queued is worth showing later.
    pub(super) fn window_closed(&mut self) {
        *self = Self::default();
    }

    /// The game is gone but the page stays loaded, so it is still ready. Nothing queued is worth showing later.
    pub(super) fn game_closed(&mut self) {
        self.pending.clear();
        self.hide_at = None;
    }

    pub(super) fn hide_at(&self) -> Option<Instant> {
        self.hide_at
    }

    /// True once, when the last toast has expired plus the hide margin.
    pub(super) fn expire(&mut self, now: Instant) -> bool {
        match self.hide_at {
            Some(at) if now >= at => {
                self.hide_at = None;
                true
            }
            _ => false,
        }
    }

    fn sent(&mut self, toast: &OverlayToast, now: Instant) {
        let gone = now + Duration::from_millis(u64::from(toast.duration_ms) + u64::from(HIDE_MARGIN_MS));
        self.hide_at = Some(self.hide_at.map_or(gone, |at| at.max(gone)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::notifications::{NotificationKind, Placement};
    use crate::features::overlay::OverlayPosition;

    fn toast(id: &str, duration_ms: u32) -> OverlayToast {
        OverlayToast {
            id: id.into(),
            kind: NotificationKind::Alert,
            title: "t".into(),
            body: "b".into(),
            placement: Placement::Corner,
            position: OverlayPosition::TopRight,
            duration_ms,
        }
    }

    fn ids(toasts: &[OverlayToast]) -> Vec<&str> {
        toasts.iter().map(|t| t.id.as_str()).collect()
    }

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    const MARGIN: u64 = HIDE_MARGIN_MS as u64;

    #[test]
    fn toasts_wait_for_the_page_then_go_in_order() {
        let t0 = Instant::now();
        let mut q = Toasts::default();
        q.window_created();
        assert!(q.push(toast("a", 6000), t0).is_empty());
        assert!(q.push(toast("b", 6000), t0).is_empty());
        assert_eq!(q.hide_at(), None, "nothing is on screen yet");
        assert_eq!(ids(&q.ready(t0 + ms(300))), ["a", "b"]);
        assert_eq!(q.hide_at(), Some(t0 + ms(300 + 6000 + MARGIN)), "expiry counts from when the page got them");
    }

    #[test]
    fn toasts_go_straight_through_once_ready() {
        let t0 = Instant::now();
        let mut q = Toasts::default();
        q.window_created();
        assert!(q.ready(t0).is_empty());
        assert_eq!(ids(&q.push(toast("a", 6000), t0)), ["a"]);
        assert_eq!(q.hide_at(), Some(t0 + ms(6000 + MARGIN)));
    }

    #[test]
    fn a_toast_pushed_before_the_window_exists_waits_for_it() {
        let t0 = Instant::now();
        let mut q = Toasts::default();
        assert!(q.push(toast("a", 6000), t0).is_empty());
        q.window_created();
        assert_eq!(ids(&q.ready(t0)), ["a"]);
    }

    #[test]
    fn a_new_window_must_say_ready_again() {
        let t0 = Instant::now();
        let mut q = Toasts::default();
        q.window_created();
        q.ready(t0);
        q.window_closed();
        q.window_created();
        assert!(q.push(toast("a", 6000), t0).is_empty());
    }

    #[test]
    fn closing_the_window_drops_what_was_queued() {
        let t0 = Instant::now();
        let mut q = Toasts::default();
        q.window_created();
        q.push(toast("a", 6000), t0);
        q.window_closed();
        q.window_created();
        assert!(q.ready(t0).is_empty());
        assert_eq!(q.hide_at(), None);
    }

    #[test]
    fn a_page_kept_through_a_game_close_stays_ready() {
        let t0 = Instant::now();
        let mut q = Toasts::default();
        q.window_created();
        q.ready(t0);
        q.push(toast("a", 6000), t0);
        q.game_closed();
        assert_eq!(q.hide_at(), None);
        assert_eq!(ids(&q.push(toast("b", 6000), t0)), ["b"], "the same page never says ready again");
    }

    #[test]
    fn a_game_close_drops_what_was_queued_for_a_loading_page() {
        let t0 = Instant::now();
        let mut q = Toasts::default();
        q.window_created();
        q.push(toast("a", 6000), t0);
        q.game_closed();
        assert!(q.ready(t0).is_empty());
    }

    #[test]
    fn overlapping_toasts_hide_after_the_last_expiry() {
        let t0 = Instant::now();
        let mut q = Toasts::default();
        q.window_created();
        q.ready(t0);
        q.push(toast("a", 6000), t0);
        q.push(toast("b", 6000), t0 + ms(2000));
        q.push(toast("short", 3000), t0 + ms(2500));
        let last = t0 + ms(2000 + 6000 + MARGIN);
        assert_eq!(q.hide_at(), Some(last));
        assert!(!q.expire(t0 + ms(6000 + MARGIN)), "a's expiry is not the last");
        assert!(!q.expire(last - ms(1)));
        assert!(q.expire(last));
        assert_eq!(q.hide_at(), None);
        assert!(!q.expire(last + ms(1)), "hides once");
    }

    #[test]
    fn the_pending_queue_drops_the_oldest() {
        let t0 = Instant::now();
        let mut q = Toasts::default();
        for i in 0..MAX_PENDING + 2 {
            q.push(toast(&i.to_string(), 6000), t0);
        }
        q.window_created();
        let sent = q.ready(t0);
        assert_eq!(sent.len(), MAX_PENDING);
        assert_eq!(sent[0].id, "2");
    }
}
