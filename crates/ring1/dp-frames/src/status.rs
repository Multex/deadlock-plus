use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum CaptureState {
    #[default]
    Idle,
    WaitingForGame,
    Capturing,
    Failed,
}

/// Serializes as the app's error code; the UI shows `errors.<code>` from the catalog.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub enum CaptureError {
    #[serde(rename = "diagnostics.frame_trace_needs_admin")]
    NeedsAdmin,
    #[serde(rename = "diagnostics.home_folder_not_found")]
    HomeFolderNotFound,
    #[serde(rename = "diagnostics.frames_read_failed")]
    ReadFailed,
    #[serde(rename = "diagnostics.helper_out_of_date")]
    HelperOutOfDate,
}

#[derive(Debug, Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CaptureStatus {
    pub state: CaptureState,
    pub error: Option<CaptureError>,
    pub frames: u32,
    pub elapsed_ms: u32,
    /// Present events that are not counted as game frames: other processes on Windows, secondary
    /// swapchains on Linux. Nonzero with zero `frames` on Windows means the game is not presenting
    /// through DXGI.
    pub other_process_events: u32,
    pub truncated: bool,
    pub game_focused: bool,
    pub recent_frametimes_ms: Vec<f32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_admin_failure_serializes_as_an_error_code() {
        let status = CaptureStatus { error: Some(CaptureError::NeedsAdmin), ..CaptureStatus::default() };
        assert_eq!(serde_json::to_value(&status).unwrap()["error"], "diagnostics.frame_trace_needs_admin");
    }

    #[test]
    fn an_out_of_date_helper_serializes_as_its_own_error_code() {
        assert_eq!(serde_json::to_value(CaptureError::HelperOutOfDate).unwrap(), "diagnostics.helper_out_of_date");
    }
}
