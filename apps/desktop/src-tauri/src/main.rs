// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    if let Some(code) = deadlock_plus_lib::privileged_argv_exit_code(&std::env::args_os().collect::<Vec<_>>()) {
        std::process::exit(code);
    }
    #[cfg(unix)]
    if let Some(code) = deadlock_plus_lib::capture_helper_exit_code() {
        std::process::exit(code);
    }
    deadlock_plus_lib::run()
}
