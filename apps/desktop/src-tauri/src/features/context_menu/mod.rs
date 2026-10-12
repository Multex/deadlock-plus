// Only the Windows webview glue calls the filter; other targets build it for its tests alone.
#[cfg_attr(not(windows), allow(dead_code))]
mod filter;
#[cfg(windows)]
mod webview2;

#[cfg(windows)]
pub use webview2::install;
