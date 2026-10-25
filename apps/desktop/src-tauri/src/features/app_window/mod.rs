use std::sync::atomic::{AtomicBool, Ordering};

use dp_kv::KvStore;
use serde_json::Value;
use tauri::window::Color;
use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};

pub const MAIN_WINDOW: &str = "main";
const SETTINGS_STORE: &str = "app-settings";
const UI_SCALE_KEY: &str = "uiScale";
const HARDWARE_ACCELERATION_KEY: &str = "hardwareAcceleration";
const MIN_SCALE_PERCENT: f64 = 80.0;
const MAX_SCALE_PERCENT: f64 = 150.0;
const DISABLE_GPU_ARG: &str = "--disable-gpu";
const BROWSER_ARGS_ENV: &str = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";

const THEME_KEY: &str = "theme";
const DEFAULT_THEME: &str = "deadlock";
/// Each theme's `--chrome` from `packages/ui/src/theme.css`, the colour `html` and `body` paint. The window and
/// the webview start in it, so nothing white or off-theme shows before the page's first frame.
const THEME_CHROME: [(&str, (u8, u8, u8)); 6] = [
    ("deadlock", (0x08, 0x06, 0x05)),
    ("midnight", (0x04, 0x06, 0x0d)),
    ("daylight", (0xec, 0xe7, 0xde)),
    ("contrast", (0x00, 0x00, 0x00)),
    ("nightshift", (0x01, 0x03, 0x03)),
    ("deadlock-api", (0x00, 0x00, 0x00)),
];

fn theme_id(stored: Option<&Value>) -> &'static str {
    let stored = stored.and_then(Value::as_str);
    THEME_CHROME.iter().map(|(id, _)| *id).find(|id| Some(*id) == stored).unwrap_or(DEFAULT_THEME)
}

fn window_background(theme: &str) -> Color {
    let (_, (r, g, b)) = THEME_CHROME.iter().find(|(id, _)| *id == theme).unwrap_or(&THEME_CHROME[0]);
    Color(*r, *g, *b, 255)
}

/// Runs before the document is parsed, so `<html>` does not exist yet; the observer sets the theme the moment it
/// does, before the stylesheet applies. The page's own settings start from this value.
fn theme_script(theme: &str) -> String {
    let theme = serde_json::to_string(theme).unwrap_or_default();
    format!(
        "(() => {{\n\
         const apply = () => {{ const root = document.documentElement; if (root) root.dataset.theme = {theme}; return !!root; }};\n\
         if (!apply()) new MutationObserver((_, observer) => apply() && observer.disconnect()).observe(document, {{ childList: true }});\n\
         }})();"
    )
}

/// Percent as the frontend stores it, clamped to the range the Settings slider offers.
fn zoom_factor(stored: Option<&Value>) -> f64 {
    stored.and_then(Value::as_f64).map_or(100.0, |p| p.clamp(MIN_SCALE_PERCENT, MAX_SCALE_PERCENT)) / 100.0
}

fn hardware_acceleration(stored: Option<&Value>) -> bool {
    stored.and_then(Value::as_bool).unwrap_or(true)
}

/// WebView2 appends this variable to the arguments wry passes, so its defaults stay in place, and every
/// webview in the process gets the same set. That matters: WebView2 refuses to create a webview whose
/// arguments differ from those of the browser process already running for the same data folder.
fn browser_args(existing: Option<&str>, hardware_acceleration: bool) -> Option<String> {
    if hardware_acceleration {
        return None;
    }
    let existing = existing.unwrap_or("").trim();
    if existing.split_whitespace().any(|arg| arg == DISABLE_GPU_ARG) {
        return Some(existing.to_string());
    }
    Some(if existing.is_empty() { DISABLE_GPU_ARG.to_string() } else { format!("{existing} {DISABLE_GPU_ARG}") })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WebviewEngine {
    WebView2,
    WebKitGtk,
    Other,
}

impl WebviewEngine {
    const CURRENT: Self = if cfg!(windows) {
        Self::WebView2
    } else if cfg!(target_os = "linux") {
        Self::WebKitGtk
    } else {
        Self::Other
    };
}

/// Variables the webview engine reads when the first webview is created; none of them can change later.
/// WebKitGTK has no GPU switch of its own: compositing off covers the GL path, and the DMA-BUF renderer is the
/// one behind the black and flickering windows on some Nvidia and Wayland setups.
fn webview_env(
    engine: WebviewEngine,
    hardware_acceleration: bool,
    existing: impl Fn(&str) -> Option<String>,
) -> Vec<(&'static str, String)> {
    if hardware_acceleration {
        return Vec::new();
    }
    match engine {
        WebviewEngine::WebView2 => browser_args(existing(BROWSER_ARGS_ENV).as_deref(), false)
            .map(|args| (BROWSER_ARGS_ENV, args))
            .into_iter()
            .collect(),
        WebviewEngine::WebKitGtk => vec![
            ("WEBKIT_DISABLE_COMPOSITING_MODE", "1".to_string()),
            ("WEBKIT_DISABLE_DMABUF_RENDERER", "1".to_string()),
        ],
        WebviewEngine::Other => Vec::new(),
    }
}

/// Whether the main window comes up when Deadlock starts, so a tray-only autostart launch is one game launch
/// away from the window.
#[derive(Default)]
struct OpenOnGameStart(AtomicBool);

static OPEN_ON_GAME_START: OpenOnGameStart = OpenOnGameStart(AtomicBool::new(false));

impl OpenOnGameStart {
    fn set(&self, enabled: bool) {
        self.0.store(enabled, Ordering::Relaxed);
    }

    /// `last` is the previous probe, `None` before the first one.
    fn should_open(&self, last: Option<bool>, running: bool) -> bool {
        last == Some(false) && running && self.0.load(Ordering::Relaxed)
    }
}

/// Called by the game watcher on every probe that differs from the last one.
pub fn on_game_probe(app: &AppHandle, last: Option<bool>, running: bool) {
    if OPEN_ON_GAME_START.should_open(last, running) {
        log::info!("Deadlock started, opening the main window");
        crate::features::tray::show_main(app);
    }
}

/// Stands in for Tauri's own creation of the config window (`"create": false`), so the stored settings can
/// shape the webview before it exists. It is built hidden (`"visible": false`) and shown here once its saved
/// bounds and zoom are in place; the theme colour covers it until the page paints.
pub fn build_main(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?;
    let kv = app.state::<KvStore>();
    let read = |key: &str| {
        kv.get(&dir, SETTINGS_STORE, key).unwrap_or_else(|e| {
            log::warn!("could not read {key} from {SETTINGS_STORE}: {e}");
            None
        })
    };
    let accelerated = hardware_acceleration(read(HARDWARE_ACCELERATION_KEY).as_ref());
    for (name, value) in webview_env(WebviewEngine::CURRENT, accelerated, |name| std::env::var(name).ok()) {
        log::info!("hardware acceleration off: {name}=\"{value}\"");
        // Not thread-safe on Linux (`unsafe` from edition 2024): other threads already run here (crash
        // reporting, logging, the async runtime). Rust's `env::var` shares std's lock with this write; only a
        // C-level `getenv` on another thread could race it. Moving this before `tauri::Builder` would close
        // that gap, but the app data dir that holds the setting is only known once the app is built.
        std::env::set_var(name, value);
    }
    let config =
        app.config().app.windows.iter().find(|w| w.label == MAIN_WINDOW).ok_or("tauri.conf.json has no main window")?;
    let theme = theme_id(read(THEME_KEY).as_ref());
    let window = WebviewWindowBuilder::from_config(app.handle(), config)?
        .background_color(window_background(theme))
        .initialization_script(theme_script(theme))
        .build()?;
    apply_zoom(&window, zoom_factor(read(UI_SCALE_KEY).as_ref()));
    crate::features::window_state::restore_main(&window);
    if !crate::features::tray::launched_hidden() {
        crate::features::tray::show_main(app.handle());
    }
    Ok(())
}

fn apply_zoom(window: &WebviewWindow, factor: f64) {
    if let Err(e) = window.set_zoom(factor) {
        log::warn!("could not set the main window zoom to {factor}: {e}");
    }
}

pub mod commands {
    use super::{apply_zoom, theme_id, window_background, zoom_factor, MAIN_WINDOW, OPEN_ON_GAME_START};
    use serde_json::Value;
    use tauri::{AppHandle, Manager};

    #[tauri::command]
    pub fn set_open_on_game_start(enabled: bool) {
        OPEN_ON_GAME_START.set(enabled);
        log::info!("open on game start {}", if enabled { "enabled" } else { "disabled" });
    }

    /// `request_restart` goes through `RunEvent::Exit`, so the services stop and the single-instance lock is
    /// released before the new process starts; `restart` skips both and the new process can hand itself
    /// back to this one and quit.
    #[tauri::command]
    pub fn restart_app(app: AppHandle) {
        log::info!("restart requested from Settings");
        app.request_restart();
    }

    /// `percent` is what the frontend stores; the same clamp applies as at startup.
    #[tauri::command]
    pub fn set_ui_scale(app: AppHandle, percent: f64) {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
            apply_zoom(&window, zoom_factor(Some(&Value::from(percent))));
        }
    }

    /// Keeps the native colour in step with the page, so a resize uncovers the new theme, not the launch one.
    #[tauri::command]
    pub fn set_window_theme(app: AppHandle, theme: String) {
        let Some(window) = app.get_webview_window(MAIN_WINDOW) else { return };
        let color = window_background(theme_id(Some(&Value::from(theme))));
        if let Err(e) = window.set_background_color(Some(color)) {
            log::warn!("could not set the main window background: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn scale_defaults_to_one_when_nothing_usable_is_stored() {
        assert_eq!(zoom_factor(None), 1.0);
        assert_eq!(zoom_factor(Some(&json!("big"))), 1.0);
        assert_eq!(zoom_factor(Some(&json!(null))), 1.0);
    }

    #[test]
    fn scale_turns_the_stored_percent_into_a_factor() {
        assert_eq!(zoom_factor(Some(&json!(125))), 1.25);
        assert_eq!(zoom_factor(Some(&json!(80))), 0.8);
    }

    #[test]
    fn scale_is_clamped_to_the_settings_range() {
        assert_eq!(zoom_factor(Some(&json!(10))), 0.8);
        assert_eq!(zoom_factor(Some(&json!(400))), 1.5);
    }

    #[test]
    fn hardware_acceleration_is_on_unless_stored_off() {
        assert!(hardware_acceleration(None));
        assert!(hardware_acceleration(Some(&json!("no"))));
        assert!(hardware_acceleration(Some(&json!(true))));
        assert!(!hardware_acceleration(Some(&json!(false))));
    }

    #[test]
    fn browser_args_are_untouched_with_acceleration_on() {
        assert_eq!(browser_args(None, true), None);
        assert_eq!(browser_args(Some("--remote-debugging-port=9222"), true), None);
    }

    #[test]
    fn browser_args_disable_the_gpu_and_keep_what_the_user_set() {
        assert_eq!(browser_args(None, false).as_deref(), Some("--disable-gpu"));
        assert_eq!(browser_args(Some("  "), false).as_deref(), Some("--disable-gpu"));
        assert_eq!(
            browser_args(Some("--remote-debugging-port=9222"), false).as_deref(),
            Some("--remote-debugging-port=9222 --disable-gpu")
        );
    }

    #[test]
    fn browser_args_do_not_repeat_the_flag() {
        assert_eq!(browser_args(Some("--disable-gpu"), false).as_deref(), Some("--disable-gpu"));
    }

    fn unset(_: &str) -> Option<String> {
        None
    }

    #[test]
    fn webkit_drops_compositing_and_dmabuf_with_acceleration_off() {
        assert_eq!(
            webview_env(WebviewEngine::WebKitGtk, false, unset),
            vec![
                ("WEBKIT_DISABLE_COMPOSITING_MODE", "1".to_string()),
                ("WEBKIT_DISABLE_DMABUF_RENDERER", "1".to_string())
            ]
        );
    }

    #[test]
    fn webkit_env_is_untouched_with_acceleration_on() {
        assert!(webview_env(WebviewEngine::WebKitGtk, true, unset).is_empty());
    }

    #[test]
    fn webview2_gets_the_gpu_flag_appended_to_what_the_user_set() {
        let existing = |name: &str| (name == BROWSER_ARGS_ENV).then(|| "--remote-debugging-port=9222".to_string());
        assert_eq!(
            webview_env(WebviewEngine::WebView2, false, existing),
            vec![(BROWSER_ARGS_ENV, "--remote-debugging-port=9222 --disable-gpu".to_string())]
        );
        assert!(webview_env(WebviewEngine::WebView2, true, existing).is_empty());
    }

    #[test]
    fn other_engines_get_no_env() {
        assert!(webview_env(WebviewEngine::Other, false, unset).is_empty());
    }

    #[test]
    fn open_on_game_start_is_off_by_default() {
        let open = OpenOnGameStart::default();
        assert!(!open.should_open(Some(false), true));
    }

    #[test]
    fn the_window_opens_only_when_the_game_goes_from_stopped_to_running() {
        let open = OpenOnGameStart::default();
        open.set(true);
        assert!(open.should_open(Some(false), true));
        assert!(!open.should_open(Some(true), true), "every tick while it runs");
        assert!(!open.should_open(Some(true), false));
        assert!(!open.should_open(Some(false), false));
    }

    #[test]
    fn a_game_already_running_when_the_app_starts_does_not_open_the_window() {
        let open = OpenOnGameStart::default();
        open.set(true);
        assert!(!open.should_open(None, true));
    }

    #[test]
    fn turning_it_off_again_stops_the_window_opening() {
        let open = OpenOnGameStart::default();
        open.set(true);
        open.set(false);
        assert!(!open.should_open(Some(false), true));
    }

    /// `--chrome` of each theme block in `theme.css`, with `:root` as the default theme.
    fn css_chrome_colors() -> Vec<(String, (f64, f64, f64))> {
        let css = include_str!("../../../../../../packages/ui/src/theme.css");
        let blocks: Vec<(String, &str)> = css
            .split('}')
            .filter_map(|chunk| {
                let (selector, body) = chunk.split_once('{')?;
                let selector = selector.trim().rsplit('\n').next()?.trim();
                let id = if selector == ":root" {
                    DEFAULT_THEME.to_string()
                } else {
                    selector.strip_prefix(":root[data-theme=\"")?.strip_suffix("\"]")?.to_string()
                };
                Some((id, body))
            })
            .collect();
        let chrome = |body: &str| {
            let value = body.split("--chrome:").nth(1)?.split(';').next()?.trim();
            let parts: Vec<f64> = value
                .strip_prefix("oklch(")?
                .strip_suffix(')')?
                .split_whitespace()
                .map(|p| p.parse().unwrap())
                .collect();
            Some((parts[0], parts[1], parts[2]))
        };
        let root = blocks.iter().find(|(id, _)| id == DEFAULT_THEME).and_then(|(_, body)| chrome(body)).unwrap();
        blocks.iter().map(|(id, body)| (id.clone(), chrome(body).unwrap_or(root))).collect()
    }

    fn oklch_to_srgb((l, c, h): (f64, f64, f64)) -> [u8; 3] {
        let (a, b) = (c * h.to_radians().cos(), c * h.to_radians().sin());
        let l_ = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b).powi(3);
        let m_ = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b).powi(3);
        let s_ = (l - 0.089_484_177_5 * a - 1.291_485_548 * b).powi(3);
        let linear = [
            4.076_741_662_1 * l_ - 3.307_711_591_3 * m_ + 0.230_969_929_2 * s_,
            -1.268_438_004_6 * l_ + 2.609_757_401_1 * m_ - 0.341_319_396_5 * s_,
            -0.004_196_086_3 * l_ - 0.703_418_614_7 * m_ + 1.707_614_701 * s_,
        ];
        linear.map(|x| {
            let x = x.clamp(0.0, 1.0);
            let encoded = if x <= 0.003_130_8 { 12.92 * x } else { 1.055 * x.powf(1.0 / 2.4) - 0.055 };
            (encoded * 255.0).round() as u8
        })
    }

    #[test]
    fn every_theme_paints_the_window_in_its_chrome_color() {
        let themes = css_chrome_colors();
        assert_eq!(themes.len(), THEME_CHROME.len(), "a theme in theme.css has no window color, or the reverse");
        for (id, oklch) in themes {
            let want = oklch_to_srgb(oklch);
            let Color(r, g, b, a) = window_background(theme_id(Some(&json!(id))));
            assert_eq!(a, 255, "{id}");
            for (have, want) in [r, g, b].into_iter().zip(want) {
                assert!(have.abs_diff(want) <= 1, "{id}: window color {:?} is not --chrome {want:?}", (r, g, b));
            }
        }
    }

    #[test]
    fn an_unknown_or_missing_theme_uses_the_default() {
        assert_eq!(theme_id(None), DEFAULT_THEME);
        assert_eq!(theme_id(Some(&json!("neon"))), DEFAULT_THEME);
        assert_eq!(theme_id(Some(&json!(3))), DEFAULT_THEME);
        assert_eq!(theme_id(Some(&json!("daylight"))), "daylight");
    }

    #[test]
    fn the_theme_script_sets_the_stored_theme_on_the_root_element() {
        let script = theme_script("daylight");
        assert!(script.contains(r#"dataset.theme = "daylight""#), "{script}");
        assert!(script.contains("MutationObserver"), "the root element does not exist yet when the script runs");
    }

    #[test]
    fn a_stored_theme_reaches_the_script_only_as_a_known_id() {
        let script = theme_script(theme_id(Some(&json!("\"</script><img src=x onerror=alert(1)>"))));
        assert!(script.contains(&format!("dataset.theme = \"{DEFAULT_THEME}\"")));
        assert!(!script.contains("onerror"));
    }

    #[test]
    fn the_main_window_is_built_hidden_so_its_saved_bounds_apply_before_it_shows() {
        let config: Value = serde_json::from_str(include_str!("../../../tauri.conf.json")).unwrap();
        let main = config["app"]["windows"].as_array().unwrap().iter().find(|w| w["label"] == MAIN_WINDOW).unwrap();
        assert_eq!(main["visible"], json!(false));
    }

    #[test]
    fn the_main_window_is_built_in_code_so_its_webview_options_can_be_set_first() {
        let config: Value = serde_json::from_str(include_str!("../../../tauri.conf.json")).unwrap();
        let windows = config["app"]["windows"].as_array().unwrap();
        let main: Vec<_> =
            windows.iter().filter(|w| w["label"].as_str().unwrap_or(MAIN_WINDOW) == MAIN_WINDOW).collect();
        assert_eq!(main.len(), 1);
        assert_eq!(main[0]["create"], json!(false));
    }
}
