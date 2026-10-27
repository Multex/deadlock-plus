use crate::features::error::{error_codes, AppError};
use dp_export::ExportError as SaveError;

error_codes! {
    pub enum ExportError in "export" {
        InvalidName = "invalid_name",
        InvalidExtension = "invalid_extension",
        InvalidLocation = "invalid_location",
        SaveFailed = "save_failed",
    }
}

impl From<SaveError> for AppError {
    fn from(error: SaveError) -> Self {
        match error {
            SaveError::InvalidName => ExportError::InvalidName.into(),
            SaveError::InvalidExtension => ExportError::InvalidExtension.into(),
            SaveError::NotAbsolute | SaveError::IsFolder => ExportError::InvalidLocation.into(),
            SaveError::Write(e) => AppError::new(ExportError::SaveFailed).detail(e),
        }
    }
}

const MAX_BINARY_BYTES: usize = 64 * 1024 * 1024;

fn check_binary_request(default_name: Option<&str>, extension: Option<&str>, body_len: usize) -> Result<(), AppError> {
    dp_export::validate_request(default_name.unwrap_or(""), extension.unwrap_or(""))?;
    if body_len == 0 || body_len > MAX_BINARY_BYTES {
        return Err(AppError::new(ExportError::SaveFailed).detail(format!("unexpected export size: {body_len} bytes")));
    }
    Ok(())
}

pub mod commands {
    use super::check_binary_request;
    use crate::command_panics::guarded;
    use crate::features::error::AppError;
    use tauri::ipc::{InvokeBody, Request};
    use tauri_plugin_dialog::DialogExt;

    /// Asks the user where to save, then writes there. Returns false when the dialog is cancelled.
    #[tauri::command]
    pub async fn save_text_file(
        app: tauri::AppHandle,
        default_name: String,
        filter_name: String,
        extension: String,
        contents: String,
    ) -> Result<bool, AppError> {
        guarded(async move {
            dp_export::validate_request(&default_name, &extension)?;
            let picked = tauri::async_runtime::spawn_blocking(move || {
                app.dialog()
                    .file()
                    .set_file_name(default_name)
                    .add_filter(filter_name, &[extension.as_str()])
                    .blocking_save_file()
            })
            .await
            .map_err(AppError::internal)?;
            let Some(picked) = picked else { return Ok(false) };
            let path = picked.into_path().map_err(AppError::io)?;
            dp_export::write_export(&path, &contents)?;
            Ok(true)
        })
        .await
    }

    /// Like `save_text_file`, but the file bytes are the raw request body and the suggestion rides in the
    /// `x-default-name` and `x-extension` headers. The dialog filter is the upper-cased extension.
    #[tauri::command]
    pub async fn save_binary_file(app: tauri::AppHandle, request: Request<'_>) -> Result<bool, AppError> {
        guarded(async move {
            let InvokeBody::Raw(bytes) = request.body() else {
                return Err(AppError::new(super::ExportError::SaveFailed).detail("export body was not raw bytes"));
            };
            let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).map(str::to_owned);
            let default_name = header("x-default-name");
            let extension = header("x-extension");
            check_binary_request(default_name.as_deref(), extension.as_deref(), bytes.len())?;
            let (default_name, extension) = (default_name.unwrap_or_default(), extension.unwrap_or_default());
            let picked = tauri::async_runtime::spawn_blocking(move || {
                app.dialog()
                    .file()
                    .set_file_name(default_name)
                    .add_filter(extension.to_uppercase(), &[extension.as_str()])
                    .blocking_save_file()
            })
            .await
            .map_err(AppError::internal)?;
            let Some(picked) = picked else { return Ok(false) };
            let path = picked.into_path().map_err(AppError::io)?;
            dp_export::write_export(&path, bytes)?;
            Ok(true)
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::error::assert_catalogued;

    #[test]
    fn every_export_code_is_in_the_english_catalog() {
        assert_catalogued::<ExportError>();
    }

    #[test]
    fn save_errors_map_to_their_own_codes() {
        assert_eq!(AppError::from(SaveError::InvalidName).code(), "export.invalid_name");
        assert_eq!(AppError::from(SaveError::InvalidExtension).code(), "export.invalid_extension");
        assert_eq!(AppError::from(SaveError::NotAbsolute).code(), "export.invalid_location");
        assert_eq!(AppError::from(SaveError::IsFolder).code(), "export.invalid_location");
        assert_eq!(AppError::from(SaveError::Write(std::io::Error::other("x"))).code(), "export.save_failed");
    }

    #[test]
    fn a_binary_request_needs_a_name_an_extension_and_a_body() {
        assert!(check_binary_request(Some("match.png"), Some("png"), 10).is_ok());
        assert_eq!(check_binary_request(None, Some("png"), 10).unwrap_err().code(), "export.invalid_name");
        assert_eq!(check_binary_request(Some("a/b.png"), Some("png"), 10).unwrap_err().code(), "export.invalid_name");
        assert_eq!(check_binary_request(Some("match.png"), None, 10).unwrap_err().code(), "export.invalid_extension");
        assert_eq!(check_binary_request(Some("match.png"), Some("png"), 0).unwrap_err().code(), "export.save_failed");
        assert_eq!(
            check_binary_request(Some("match.png"), Some("png"), MAX_BINARY_BYTES + 1).unwrap_err().code(),
            "export.save_failed"
        );
    }

    #[test]
    fn a_bad_request_maps_to_a_coded_error() {
        let err = AppError::from(dp_export::validate_request("a/b", "json").unwrap_err());
        assert_eq!(err.code(), "export.invalid_name");
    }
}
