#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
fn main() {
    std::process::exit(dp_helper::entry::run(std::env::args_os()))
}

#[cfg(not(windows))]
fn main() {
    std::process::exit(2)
}
