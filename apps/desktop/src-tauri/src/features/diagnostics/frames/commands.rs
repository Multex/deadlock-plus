use tauri::State;

use crate::features::diagnostics::error::DiagnosticsError;
use crate::features::error::AppError;
use crate::features::game_focus::GameFocusService;

use dp_frames::capture::{CaptureStatus, FrameCapture};
use dp_frames::layer_install::{self, LayerStatus};
use dp_frames::FrameStats;
use dp_game::focus::GameFocus;

#[tauri::command]
pub async fn start_frame_capture(
    capture: State<'_, FrameCapture>,
    focus: State<'_, GameFocusService>,
) -> Result<(), AppError> {
    capture.set_game_focused(counts_as_focused(focus.state().focus));
    capture.start(|| dp_game::find_pid(dp_game::is_process));
    Ok(())
}

#[tauri::command]
pub async fn frame_capture_status(capture: State<'_, FrameCapture>) -> Result<CaptureStatus, AppError> {
    Ok(capture.status())
}

#[tauri::command]
pub async fn stop_frame_capture(capture: State<'_, FrameCapture>) -> Result<FrameStats, AppError> {
    Ok(capture.stop())
}

/// Mirrors the Windows capture, where no game process also counts as focused, so a capture started before
/// launch is not all background.
pub(crate) fn counts_as_focused(focus: GameFocus) -> bool {
    focus != GameFocus::Background
}

fn layer_status() -> LayerStatus {
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf()));
    layer_install::status(cfg!(target_os = "linux"), layer_install::system_data_home().as_deref(), exe_dir.as_deref())
}

#[tauri::command]
pub async fn frame_layer_status() -> Result<LayerStatus, AppError> {
    Ok(layer_status())
}

#[tauri::command]
pub async fn install_frame_layer() -> Result<LayerStatus, AppError> {
    install_layer()
}

pub(crate) fn install_layer() -> Result<LayerStatus, AppError> {
    if !cfg!(target_os = "linux") {
        return Err(DiagnosticsError::FrameLayerLinuxOnly.into());
    }
    let data_home = layer_install::system_data_home().ok_or(DiagnosticsError::HomeFolderNotFound)?;
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf()));
    let source = exe_dir.as_deref().and_then(layer_install::find_library).ok_or(DiagnosticsError::FrameLayerMissing)?;
    layer_install::install(&data_home, &source)
        .map_err(|e| AppError::new(DiagnosticsError::FrameLayerInstallFailed).detail(e))?;
    Ok(layer_status())
}

#[tauri::command]
pub async fn uninstall_frame_layer() -> Result<LayerStatus, AppError> {
    if let Some(data_home) = layer_install::system_data_home() {
        layer_install::uninstall(&data_home)
            .map_err(|e| AppError::new(DiagnosticsError::FrameLayerRemoveFailed).detail(e))?;
    }
    Ok(layer_status())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_backgrounded_game_counts_as_unfocused() {
        assert!(counts_as_focused(GameFocus::Focused));
        assert!(counts_as_focused(GameFocus::Closed));
        assert!(!counts_as_focused(GameFocus::Background));
    }
}
