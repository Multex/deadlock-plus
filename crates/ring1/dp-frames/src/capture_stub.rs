pub use crate::status::{CaptureError, CaptureState, CaptureStatus};
use crate::FrameStats;

#[derive(Default)]
pub struct FrameCapture {}

impl FrameCapture {
    pub fn start(&self, _find_game_pid: fn() -> u32) {}
    pub fn status(&self) -> CaptureStatus {
        CaptureStatus::default()
    }
    pub fn stop(&self) -> FrameStats {
        FrameStats::default()
    }
}
