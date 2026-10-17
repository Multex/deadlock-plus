use crate::layer_capture::LayerCapture;
use crate::layer_install::system_data_home;
pub use crate::status::{CaptureError, CaptureState, CaptureStatus};
use crate::FrameStats;

/// Reads present timestamps from the Vulkan layer's files. The layer is loaded into the game only, so
/// no process filter is needed and `start` ignores `find_game_pid`.
pub struct FrameCapture {
    inner: LayerCapture,
}

impl Default for FrameCapture {
    fn default() -> Self {
        Self { inner: LayerCapture::new(system_data_home().map(|d| dp_frames_wire::frames_dir(&d))) }
    }
}

impl FrameCapture {
    pub fn start(&self, _find_game_pid: fn() -> u32) {
        self.inner.start();
    }

    /// Call on every focus change, capturing or not. A closed game counts as focused.
    pub fn set_game_focused(&self, focused: bool) {
        self.inner.set_game_focused(focused);
    }

    pub fn status(&self) -> CaptureStatus {
        self.inner.status()
    }

    pub fn stop(&self) -> FrameStats {
        self.inner.stop()
    }
}
