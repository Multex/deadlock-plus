use std::io;

pub use crate::focus_state::{FocusState, GameFocus, ScreenRect};

/// Without a foreground window API the state stays [`GameFocus::Closed`]; [`crate::is_running`] still reports the
/// game process.
pub struct FocusWatcher {}

impl FocusWatcher {
    pub fn start(_on_change: impl Fn(FocusState) + Send + 'static) -> io::Result<Self> {
        Ok(Self {})
    }

    pub fn state(&self) -> FocusState {
        FocusState::default()
    }

    pub fn stop(self) {}
}
