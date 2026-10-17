// Only the platform webview glue calls these; other targets build them for their tests alone.
#[cfg_attr(not(any(windows, target_os = "linux")), allow(dead_code))]
mod filter;
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod webkit_action;
#[cfg(target_os = "linux")]
mod webkitgtk;
#[cfg(windows)]
mod webview2;

#[cfg(target_os = "linux")]
pub use webkitgtk::install;
#[cfg(windows)]
pub use webview2::install;
