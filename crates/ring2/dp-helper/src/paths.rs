use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::path::PathBuf;

use crate::args::{installed_helper_path, pick_helper, HelperPick, HELPER_EXE};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::ERROR_MORE_DATA;
use windows::Win32::System::Registry::{
    RegGetValueW, HKEY_LOCAL_MACHINE, REG_EXPAND_SZ, REG_ROUTINE_FLAGS, REG_VALUE_TYPE, RRF_NOEXPAND,
    RRF_RT_REG_EXPAND_SZ, RRF_RT_REG_SZ, RRF_SUBKEY_WOW6464KEY,
};

const CURRENT_VERSION: PCWSTR = w!(r"SOFTWARE\Microsoft\Windows\CurrentVersion");
const PROFILE_LIST: PCWSTR = w!(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList");

fn get(subkey: PCWSTR, value: PCWSTR, flags: REG_ROUTINE_FLAGS) -> Option<(Vec<u16>, REG_VALUE_TYPE)> {
    let flags = flags | RRF_SUBKEY_WOW6464KEY;
    let mut kind = REG_VALUE_TYPE::default();
    let mut size = 0u32;
    // SAFETY: both strings are static and NUL-terminated; a null data pointer with a valid size pointer only asks for
    // the size.
    let status =
        unsafe { RegGetValueW(HKEY_LOCAL_MACHINE, subkey, value, flags, Some(&mut kind), None, Some(&mut size)) };
    if !status.is_ok() {
        return None;
    }
    // An expanded value can grow between the size query and the read, so retry a few times on ERROR_MORE_DATA.
    for _ in 0..4 {
        let mut buffer = vec![0u16; (size as usize).div_ceil(2) + 1];
        let mut bytes = (buffer.len() * 2) as u32;
        // SAFETY: `buffer` holds `bytes` bytes and outlives the call; `bytes` is updated to the bytes written.
        let status = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                subkey,
                value,
                flags,
                Some(&mut kind),
                Some(buffer.as_mut_ptr().cast()),
                Some(&mut bytes),
            )
        };
        if status == ERROR_MORE_DATA {
            size = bytes;
            continue;
        }
        if !status.is_ok() {
            return None;
        }
        // After expansion the reported size is the unexpanded length, not the written one: cut at the first NUL.
        buffer.truncate(bytes as usize / 2);
        let end = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
        buffer.truncate(end);
        return Some((buffer, kind));
    }
    None
}

/// `RegGetValueW` without `RRF_NOEXPAND` expands a `REG_EXPAND_SZ` value the same way `ExpandEnvironmentStringsW`
/// does, so only values stored as `REG_EXPAND_SZ` are read a second time with expansion on.
fn read_path(subkey: PCWSTR, value: PCWSTR) -> Option<PathBuf> {
    let (raw, kind) = get(subkey, value, RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ | RRF_NOEXPAND)?;
    if kind == REG_EXPAND_SZ {
        let (expanded, _) = get(subkey, value, RRF_RT_REG_SZ)?;
        accept(OsString::from_wide(&expanded), true)
    } else {
        accept(OsString::from_wide(&raw), false)
    }
}

fn accept(text: OsString, expanded: bool) -> Option<PathBuf> {
    if expanded && text.to_string_lossy().contains('%') {
        return None;
    }
    let path = PathBuf::from(text);
    path.is_absolute().then_some(path)
}

/// Read from HKLM, never from `%ProgramFiles%`: the user who launched the helper controls its environment.
pub fn program_files_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for value in [w!("ProgramFilesDir"), w!("ProgramFilesDir (x86)")] {
        if let Some(root) = read_path(CURRENT_VERSION, value) {
            if !roots.contains(&root) {
                roots.push(root);
            }
        }
    }
    roots
}

/// Read from HKLM, never from `%ProgramData%`. The stored value is usually `%SystemDrive%\ProgramData`, and
/// `%SystemDrive%` still comes from this process's environment.
pub fn program_data() -> Option<PathBuf> {
    read_path(PROFILE_LIST, w!("ProgramData"))
}

/// Read from HKLM, never from `%CommonProgramFiles%`, for the same reason as `program_files_roots`.
pub fn common_files() -> Option<PathBuf> {
    read_path(CURRENT_VERSION, w!("CommonFilesDir"))
}

pub fn installed_helper() -> Option<PathBuf> {
    common_files().map(|root| installed_helper_path(&root))
}

pub fn helper_exe() -> Result<PathBuf, String> {
    let installed = installed_helper().filter(|path| path.is_file());
    let next_to_app = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join(HELPER_EXE)))
        .filter(|path| path.is_file());
    match pick_helper(installed.is_some(), next_to_app.is_some(), cfg!(debug_assertions)) {
        Some(HelperPick::Installed) => installed,
        Some(HelperPick::NextToApp) => next_to_app,
        None => None,
    }
    .ok_or_else(|| format!("{HELPER_EXE} is neither installed nor next to the app"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn existing_absolute_dir(path: &std::path::Path) -> bool {
        path.is_absolute() && path.is_dir()
    }

    #[test]
    fn program_files_roots_are_existing_absolute_dirs() {
        let roots = program_files_roots();
        assert!(!roots.is_empty());
        for root in &roots {
            assert!(existing_absolute_dir(root), "{root:?}");
        }
    }

    #[test]
    fn program_data_is_an_existing_absolute_dir_without_variables() {
        let path = program_data().expect("ProgramData resolves");
        assert!(existing_absolute_dir(&path), "{path:?}");
        assert!(!path.to_string_lossy().contains('%'), "{path:?}");
    }

    #[test]
    fn common_files_is_an_existing_absolute_dir() {
        let path = common_files().expect("CommonFilesDir resolves");
        assert!(existing_absolute_dir(&path), "{path:?}");
    }

    #[test]
    fn accept_rules() {
        let ok = |s: &str, expanded| accept(OsString::from(s), expanded);
        assert_eq!(ok(r"C:\Program Files", false), Some(PathBuf::from(r"C:\Program Files")));
        assert_eq!(ok(r"C:\ProgramData", true), Some(PathBuf::from(r"C:\ProgramData")));
        assert_eq!(ok(r"%SystemDrive%\ProgramData", true), None);
        assert_eq!(ok(r"C:\%UNSET%\x", true), None);
        assert_eq!(ok("", false), None);
        assert_eq!(ok(r"Program Files", false), None);
        assert_eq!(ok(r"\Program Files", false), None);
    }
}
