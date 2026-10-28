use crate::features::error::{error_codes, AppError};
use tauri::Manager;

error_codes! {
    pub enum KvError in "kv" {
        StoreFailed = "store_failed",
    }
}

fn dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, AppError> {
    app.path().app_data_dir().map_err(AppError::io)
}

fn store_failed(source: String) -> AppError {
    AppError::new(KvError::StoreFailed).detail(source)
}

/// Store files are rewritten whole and synced to disk, which takes long enough on a large store to
/// stall the window if it ran on the main thread.
async fn on_worker<R: Send + 'static>(
    app: tauri::AppHandle,
    run: impl FnOnce(&dp_kv::KvStore, &std::path::Path) -> Result<R, String> + Send + 'static,
) -> Result<R, AppError> {
    let dir = dir(&app)?;
    crate::command_panics::spawn_blocking_guarded(move || run(&app.state::<dp_kv::KvStore>(), &dir))
        .await?
        .map_err(store_failed)
}

pub mod commands {
    use super::on_worker;
    use crate::command_panics::guarded;
    use crate::features::error::AppError;
    use serde_json::Value;

    #[tauri::command]
    pub async fn kv_get(app: tauri::AppHandle, store: String, key: String) -> Result<Option<Value>, AppError> {
        guarded(async move { on_worker(app, move |kv, dir| kv.get(dir, &store, &key)).await }).await
    }

    #[tauri::command]
    pub async fn kv_set(app: tauri::AppHandle, store: String, key: String, value: Value) -> Result<(), AppError> {
        guarded(async move { on_worker(app, move |kv, dir| kv.set(dir, &store, &key, value)).await }).await
    }

    #[tauri::command]
    pub async fn kv_delete(app: tauri::AppHandle, store: String, key: String) -> Result<(), AppError> {
        guarded(async move { on_worker(app, move |kv, dir| kv.delete(dir, &store, &key)).await }).await
    }
}

#[cfg(test)]
mod tests {
    use crate::features::error::assert_catalogued;
    use dp_kv::KvStore;
    use serde_json::json;

    #[test]
    fn every_kv_code_is_in_the_english_catalog() {
        assert_catalogued::<super::KvError>();
    }

    #[test]
    fn a_failed_store_access_is_coded_and_keeps_the_source_for_the_log() {
        let err = super::store_failed("disk full".into());
        assert_eq!(err.code(), "kv.store_failed");
        assert_eq!(err.to_string(), "kv.store_failed: disk full");
    }

    #[test]
    fn the_background_job_settings_store_is_writable() {
        let dir = std::env::temp_dir().join(format!("deadlock-plus-kv-jobs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let store = crate::features::jobs::STORE;
        KvStore::default().set(&dir, store, "pauseInGame", json!(false)).unwrap();
        assert_eq!(KvStore::default().get(&dir, store, "pauseInGame").unwrap(), Some(json!(false)));
    }
}
