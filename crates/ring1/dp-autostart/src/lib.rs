use std::ffi::OsString;
use std::io;
use std::path::Path;

pub mod desktop_entry;
pub mod run_key;

pub const LAUNCH_ARG: &str = "--autostart";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct State {
    pub enabled: bool,
    /// The entry launches a different exe than the one to launch now.
    pub stale: bool,
}

/// An AppImage's `current_exe` sits inside a temporary FUSE mount that is gone after exit, so the image
/// file named by `$APPIMAGE` is what a login launch has to run.
pub fn launch_exe(appimage: Option<OsString>, current_exe: &Path) -> String {
    match appimage.filter(|p| !p.is_empty()) {
        Some(image) => image.to_string_lossy().into_owned(),
        None => current_exe.to_string_lossy().into_owned(),
    }
}

pub fn read_state(file: &Path, parse_exe: fn(&str) -> Option<String>, target_exe: &str) -> io::Result<State> {
    match std::fs::read(file) {
        Ok(bytes) => {
            let stale = parse_exe(&String::from_utf8_lossy(&bytes)).is_none_or(|exe| exe != target_exe);
            Ok(State { enabled: true, stale })
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(State { enabled: false, stale: false }),
        Err(e) => Err(e),
    }
}

pub fn write_entry(file: &Path, contents: &str) -> io::Result<()> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    // Write beside the target and rename so a crash never leaves a half-written entry for the login manager.
    let staged = file.with_extension("tmp");
    std::fs::write(&staged, contents)?;
    std::fs::rename(&staged, file).inspect_err(|_| {
        let _ = std::fs::remove_file(&staged);
    })
}

pub fn remove_entry(file: &Path) -> io::Result<()> {
    match std::fs::remove_file(file) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

#[cfg(not(windows))]
mod host {
    use super::*;
    use std::path::PathBuf;

    fn entry_file() -> Result<PathBuf, String> {
        desktop_entry::entry_path(std::env::var_os("XDG_CONFIG_HOME"), std::env::var_os("HOME"))
            .ok_or_else(|| "Couldn't find your home folder".to_string())
    }

    const PARSE: fn(&str) -> Option<String> = desktop_entry::parse_exe;

    fn render(exe: &str) -> String {
        desktop_entry::render(exe, LAUNCH_ARG)
    }

    fn target_exe() -> Result<String, String> {
        let current = std::env::current_exe().map_err(|e| e.to_string())?;
        Ok(launch_exe(std::env::var_os("APPIMAGE"), &current))
    }

    pub fn state() -> Result<State, String> {
        read_state(&entry_file()?, PARSE, &target_exe()?).map_err(|e| e.to_string())
    }

    pub fn enable() -> Result<(), String> {
        write_entry(&entry_file()?, &render(&target_exe()?)).map_err(|e| e.to_string())
    }

    pub fn disable() -> Result<(), String> {
        remove_entry(&entry_file()?).map_err(|e| e.to_string())
    }
}

#[cfg(not(windows))]
pub use host::{disable, enable, state};

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dp-autostart-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn appimage_path_replaces_the_mounted_exe() {
        let current = Path::new("/tmp/.mount_abc/usr/bin/deadlock-plus");
        assert_eq!(launch_exe(Some("/home/u/dp.AppImage".into()), current), "/home/u/dp.AppImage");
        assert_eq!(launch_exe(Some("".into()), current), "/tmp/.mount_abc/usr/bin/deadlock-plus");
        assert_eq!(launch_exe(None, current), "/tmp/.mount_abc/usr/bin/deadlock-plus");
    }

    #[test]
    fn missing_file_means_disabled() {
        let file = scratch("missing").join("x.desktop");
        assert_eq!(
            read_state(&file, desktop_entry::parse_exe, "/x/dp").unwrap(),
            State { enabled: false, stale: false }
        );
    }

    #[test]
    fn written_entry_is_enabled_and_fresh_until_the_exe_moves() {
        let dir = scratch("write");
        let file = dir.join("autostart").join("deadlock-plus.desktop");
        write_entry(&file, &desktop_entry::render("/x/dp", LAUNCH_ARG)).unwrap();
        assert_eq!(
            read_state(&file, desktop_entry::parse_exe, "/x/dp").unwrap(),
            State { enabled: true, stale: false }
        );
        assert_eq!(read_state(&file, desktop_entry::parse_exe, "/y/dp").unwrap(), State { enabled: true, stale: true });
        assert!(!dir.join("autostart").join("deadlock-plus.tmp").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unparseable_entry_is_enabled_but_stale() {
        let dir = scratch("junk");
        let file = dir.join("a.desktop");
        write_entry(&file, "junk").unwrap();
        assert_eq!(read_state(&file, desktop_entry::parse_exe, "/x/dp").unwrap(), State { enabled: true, stale: true });
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rewriting_replaces_and_removing_is_idempotent() {
        let dir = scratch("rewrite");
        let file = dir.join("a.desktop");
        write_entry(&file, &desktop_entry::render("/old/dp", LAUNCH_ARG)).unwrap();
        write_entry(&file, &desktop_entry::render("/new/dp", LAUNCH_ARG)).unwrap();
        assert!(!read_state(&file, desktop_entry::parse_exe, "/new/dp").unwrap().stale);
        remove_entry(&file).unwrap();
        remove_entry(&file).unwrap();
        assert!(!read_state(&file, desktop_entry::parse_exe, "/new/dp").unwrap().enabled);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
