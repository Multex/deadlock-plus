use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use dp_sync::LockExt;
use dp_telemetry::{ClientInitGuard, Config, Context, Telemetry};
use tauri::{AppHandle, Manager};

use super::stop::StopSignal;
use super::toggle::{toggle, Toggle};

const HEARTBEAT_EVERY: Duration = Duration::from_secs(30 * 60);
const FLUSH_EVERY: Duration = Duration::from_secs(30);
const EXIT_FLUSH: Duration = Duration::from_secs(1);

pub struct TelemetryService {
    telemetry: Arc<Telemetry>,
    sentry: Mutex<Option<ClientInitGuard>>,
    worker: Mutex<Option<Arc<StopSignal>>>,
    started_sent: AtomicBool,
}

/// Creates the service and, for a build that has a Sentry DSN, installs its panic integration. That wraps the
/// hook already in place, so the logging hook runs first-installed and keeps its lock-free behaviour.
pub fn init(app: &AppHandle) -> Result<TelemetryService, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(TelemetryService::new(dp_telemetry::config::build(), &dir, app.package_info().version.to_string()))
}

impl TelemetryService {
    fn new(config: Config, dir: &Path, version: String) -> Self {
        let install_id = dp_telemetry::install_id::load_or_create(dir);
        let os = std::env::consts::OS.to_string();
        let context = Context {
            app_version: version.clone(),
            os: os.clone(),
            os_arch: std::env::consts::ARCH.to_string(),
            locale: "en".into(),
        };
        let telemetry = Arc::new(Telemetry::new(config.clone(), context, install_id.clone()));
        let sentry = dp_telemetry::errors::init(
            &config,
            &version,
            &os,
            telemetry.gate(),
            &install_id,
            crate::command_panics::panic_is_handled,
        );
        Self { telemetry, sentry: Mutex::new(sentry), worker: Mutex::new(None), started_sent: AtomicBool::new(false) }
    }

    /// The frontend re-sends this on every reload, so a repeated `true` must not start a second worker or send a
    /// second `app_started`.
    pub fn apply(&self, enabled: bool, locale: &str, http: reqwest::Client) {
        self.telemetry.set_locale(locale);
        self.telemetry.set_enabled(enabled);
        let mut slot = self.worker.lock_or_recover();
        match toggle(enabled, slot.is_some()) {
            Toggle::Keep => {}
            Toggle::Stop => {
                if let Some(stop) = slot.take() {
                    stop.stop();
                }
            }
            Toggle::Start => {
                if !self.started_sent.swap(true, Ordering::SeqCst) {
                    self.telemetry.app_started();
                }
                let stop = Arc::new(StopSignal::default());
                *slot = Some(stop.clone());
                spawn_worker(self.telemetry.clone(), stop, http);
            }
        }
    }

    pub fn feature_used(&self, name: &str) {
        self.telemetry.feature_used(name);
    }

    pub fn discord_invite_click(&self) {
        self.telemetry.discord_invite_click();
    }

    pub fn update_shown(&self, to_version: &str) {
        self.telemetry.update_shown(to_version);
    }

    pub fn update_install_clicked(&self, to_version: &str, source: &str) {
        self.telemetry.update_install_clicked(to_version, source);
    }

    /// For a caller about to lose the process without `shutdown` running, such as the update installer.
    /// Bounded like the exit flush.
    pub async fn flush_now(&self, http: &reqwest::Client) {
        let _ = tokio::time::timeout(EXIT_FLUSH, self.telemetry.flush(http)).await;
    }

    pub fn reset_install_id(&self, dir: &Path) {
        let id = self.telemetry.reset_install_id(dir);
        dp_telemetry::errors::set_install_id(&id);
    }

    /// Bounded: the exit path never waits on the network for longer than a second.
    pub fn shutdown(&self, http: &reqwest::Client) {
        if let Some(stop) = self.worker.lock_or_recover().take() {
            stop.stop();
        }
        self.telemetry.app_exited();
        let _ = tauri::async_runtime::block_on(async {
            tokio::time::timeout(EXIT_FLUSH, self.telemetry.flush(http)).await
        });
        if let Some(guard) = self.sentry.lock_or_recover().take() {
            guard.close(Some(EXIT_FLUSH));
        }
    }
}

fn spawn_worker(telemetry: Arc<Telemetry>, stop: Arc<StopSignal>, http: reqwest::Client) {
    std::thread::Builder::new()
        .name("telemetry".into())
        .spawn(move || {
            let mut next_flush = Instant::now() + FLUSH_EVERY;
            let mut next_heartbeat = Instant::now() + HEARTBEAT_EVERY;
            loop {
                let wake = next_flush.min(next_heartbeat);
                if stop.wait(wake.saturating_duration_since(Instant::now())) {
                    break;
                }
                let now = Instant::now();
                if now >= next_heartbeat {
                    next_heartbeat = now + HEARTBEAT_EVERY;
                    telemetry.heartbeat();
                }
                if now >= next_flush {
                    next_flush = Instant::now() + FLUSH_EVERY;
                    tauri::async_runtime::block_on(telemetry.flush(&http));
                }
            }
        })
        .expect("spawn thread");
}

pub mod commands {
    use tauri::{AppHandle, Manager, State};

    use super::TelemetryService;
    use crate::command_panics::guarded_infallible;
    use crate::features::error::AppError;
    use crate::http::Http;

    #[tauri::command]
    pub fn set_telemetry_settings(
        enabled: bool,
        locale: String,
        telemetry: State<'_, TelemetryService>,
        http: State<'_, Http>,
    ) {
        telemetry.apply(enabled, &locale, http.0.clone());
    }

    #[tauri::command]
    pub fn track_feature(name: String, telemetry: State<'_, TelemetryService>) {
        telemetry.feature_used(&name);
    }

    #[tauri::command]
    pub fn track_discord_invite(telemetry: State<'_, TelemetryService>) {
        telemetry.discord_invite_click();
    }

    #[tauri::command]
    pub fn track_update_shown(to_version: String, telemetry: State<'_, TelemetryService>) {
        telemetry.update_shown(&to_version);
    }

    #[tauri::command]
    pub fn track_update_install_clicked(to_version: String, source: String, telemetry: State<'_, TelemetryService>) {
        telemetry.update_install_clicked(&to_version, &source);
    }

    #[tauri::command]
    pub async fn flush_telemetry(
        telemetry: State<'_, TelemetryService>,
        http: State<'_, Http>,
    ) -> Result<(), AppError> {
        guarded_infallible(telemetry.flush_now(&http.0)).await
    }

    #[tauri::command]
    pub fn reset_telemetry_id(app: AppHandle, telemetry: State<'_, TelemetryService>) {
        if let Ok(dir) = app.path().app_data_dir() {
            telemetry.reset_install_id(&dir);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    use dp_telemetry::config::PostHogConfig;

    use super::*;

    fn service_sending_to(listener: &TcpListener, name: &str) -> TelemetryService {
        let dir = std::env::temp_dir().join(format!("dp-telemetry-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let host = format!("http://{}", listener.local_addr().unwrap());
        let config = Config { posthog: Some(PostHogConfig { key: "phc_test".into(), host }), sentry_dsn: None };
        TelemetryService::new(config, &dir, "0.12.0".into())
    }

    fn accept_within(listener: &TcpListener, limit: Duration) -> Option<std::net::TcpStream> {
        listener.set_nonblocking(true).unwrap();
        let deadline = Instant::now() + limit;
        while Instant::now() < deadline {
            if let Ok((stream, _)) = listener.accept() {
                stream.set_nonblocking(false).unwrap();
                return Some(stream);
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        None
    }

    fn read_request(stream: &mut std::net::TcpStream) -> String {
        stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        let mut request = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            let n = stream.read(&mut chunk).unwrap();
            request.extend_from_slice(&chunk[..n]);
            let text = String::from_utf8_lossy(&request).to_string();
            if let Some((head, body)) = text.split_once("\r\n\r\n") {
                let length = head
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().to_string())
                    })
                    .and_then(|v| v.parse::<usize>().ok())
                    .unwrap_or(0);
                if body.len() >= length {
                    return text;
                }
            }
            if n == 0 {
                return text;
            }
        }
    }

    #[test]
    fn flush_now_sends_the_queued_install_click() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let service = service_sending_to(&listener, "flush-sends");
        service.telemetry.set_enabled(true);
        service.update_install_clicked("0.13.0", "about");
        let server = std::thread::spawn(move || {
            let mut stream = accept_within(&listener, Duration::from_secs(5)).expect("no batch was sent");
            let request = read_request(&mut stream);
            stream.write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: close\r\n\r\n").unwrap();
            request
        });
        let started = Instant::now();
        tauri::async_runtime::block_on(service.flush_now(&reqwest::Client::new()));
        assert!(started.elapsed() < EXIT_FLUSH, "the reply was not read: waited {:?}", started.elapsed());
        let request = server.join().unwrap();
        assert!(request.starts_with("POST /batch/"), "{request}");
        assert!(request.contains("\"update_install_clicked\""), "{request}");
        assert!(request.contains("\"source\":\"about\""), "{request}");
        assert_eq!(service.telemetry.pending(), 0);
    }

    #[test]
    fn flush_now_gives_up_on_a_server_that_never_answers() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let service = service_sending_to(&listener, "flush-bounded");
        service.telemetry.set_enabled(true);
        service.update_install_clicked("0.13.0", "toast");
        let started = Instant::now();
        tauri::async_runtime::block_on(service.flush_now(&reqwest::Client::new()));
        assert!(started.elapsed() < Duration::from_secs(2), "waited {:?}", started.elapsed());
    }

    #[test]
    fn flush_now_sends_nothing_with_telemetry_off() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let service = service_sending_to(&listener, "flush-off");
        service.update_install_clicked("0.13.0", "banner");
        tauri::async_runtime::block_on(service.flush_now(&reqwest::Client::new()));
        listener.set_nonblocking(true).unwrap();
        assert_eq!(listener.accept().unwrap_err().kind(), std::io::ErrorKind::WouldBlock);
    }

    #[test]
    fn shutdown_runs_off_the_async_runtime() {
        let dir = std::env::temp_dir().join(format!("dp-telemetry-shutdown-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let service = TelemetryService::new(Config::default(), &dir, "0.0.0".into());
        service.shutdown(&reqwest::Client::new());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
