use super::AutostartError;
use crate::features::error::AppError;
use dp_autostart::{run_key, State};
use windows::core::PCWSTR;
use windows::Win32::Foundation::ERROR_FILE_NOT_FOUND;
use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
    HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_BINARY, REG_OPEN_CREATE_OPTIONS, REG_SAM_FLAGS, REG_SZ,
    REG_VALUE_TYPE,
};

struct Key(HKEY);

impl Drop for Key {
    fn drop(&mut self) {
        // SAFETY: the handle came from a successful open or create call and this guard is its only owner.
        let _ = unsafe { RegCloseKey(self.0) };
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn open(path: &str, access: REG_SAM_FLAGS) -> windows::core::Result<Option<Key>> {
    let path = wide(path);
    let mut key = HKEY::default();
    // SAFETY: `path` is NUL-terminated and outlives the call, and `key` is a valid out-pointer.
    let err = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, PCWSTR(path.as_ptr()), 0, access, &mut key) };
    if err == ERROR_FILE_NOT_FOUND {
        return Ok(None);
    }
    err.ok()?;
    Ok(Some(Key(key)))
}

fn create(path: &str) -> windows::core::Result<Key> {
    let path = wide(path);
    let mut key = HKEY::default();
    // SAFETY: `path` is NUL-terminated and outlives the call, the class and security arguments are null, and
    // `key` is a valid out-pointer.
    unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(path.as_ptr()),
            0,
            PCWSTR::null(),
            REG_OPEN_CREATE_OPTIONS(0),
            KEY_SET_VALUE,
            None,
            &mut key,
            None,
        )
    }
    .ok()?;
    Ok(Key(key))
}

fn read_value(path: &str, name: &str) -> windows::core::Result<Option<Vec<u8>>> {
    let Some(key) = open(path, KEY_QUERY_VALUE)? else { return Ok(None) };
    let name = wide(name);
    let mut len = 0u32;
    // SAFETY: `name` is NUL-terminated, a null data pointer asks only for the size, and `len` is a valid
    // out-pointer.
    let err = unsafe { RegQueryValueExW(key.0, PCWSTR(name.as_ptr()), None, None, None, Some(&mut len)) };
    if err == ERROR_FILE_NOT_FOUND {
        return Ok(None);
    }
    err.ok()?;
    let mut buf = vec![0u8; len as usize];
    // SAFETY: `buf` holds `len` writable bytes and `len` is passed as the buffer size.
    let err =
        unsafe { RegQueryValueExW(key.0, PCWSTR(name.as_ptr()), None, None, Some(buf.as_mut_ptr()), Some(&mut len)) };
    if err == ERROR_FILE_NOT_FOUND {
        return Ok(None);
    }
    err.ok()?;
    buf.truncate(len as usize);
    Ok(Some(buf))
}

fn read_string(path: &str, name: &str) -> windows::core::Result<Option<String>> {
    Ok(read_value(path, name)?.map(|bytes| {
        let units: Vec<u16> = bytes.as_chunks::<2>().0.iter().map(|c| u16::from_le_bytes(*c)).collect();
        String::from_utf16_lossy(&units).trim_end_matches('\0').to_string()
    }))
}

fn set_value(path: &str, name: &str, kind: REG_VALUE_TYPE, data: &[u8]) -> windows::core::Result<()> {
    let key = create(path)?;
    let name = wide(name);
    // SAFETY: `name` is NUL-terminated and `key` is an open handle with set-value access.
    unsafe { RegSetValueExW(key.0, PCWSTR(name.as_ptr()), 0, kind, Some(data)) }.ok()
}

fn delete_value(path: &str, name: &str) -> windows::core::Result<()> {
    let Some(key) = open(path, KEY_SET_VALUE)? else { return Ok(()) };
    let name = wide(name);
    // SAFETY: `name` is NUL-terminated and `key` is an open handle with set-value access.
    let err = unsafe { RegDeleteValueW(key.0, PCWSTR(name.as_ptr())) };
    if err == ERROR_FILE_NOT_FOUND {
        return Ok(());
    }
    err.ok()
}

pub fn status(run_key_path: &str, approved_key_path: &str, target_exe: &str) -> Result<State, AppError> {
    let run = read_string(run_key_path, run_key::VALUE_NAME).map_err(AppError::io)?;
    let approved = read_value(approved_key_path, run_key::VALUE_NAME).map_err(AppError::io)?;
    Ok(run_key::state(run.as_deref(), approved.as_deref(), target_exe))
}

pub fn enable(run_key_path: &str, approved_key_path: &str, exe: &str) -> Result<(), AppError> {
    let data: Vec<u8> =
        run_key::render(exe).encode_utf16().chain(std::iter::once(0)).flat_map(u16::to_le_bytes).collect();
    let write = || -> windows::core::Result<()> {
        set_value(run_key_path, run_key::VALUE_NAME, REG_SZ, &data)?;
        set_value(approved_key_path, run_key::VALUE_NAME, REG_BINARY, &run_key::APPROVED_ENABLED)
    };
    write().map_err(|e| AppError::new(AutostartError::EntryWriteFailed).detail(e))
}

pub fn disable(run_key_path: &str, approved_key_path: &str) -> Result<(), AppError> {
    let remove = || -> windows::core::Result<()> {
        delete_value(run_key_path, run_key::VALUE_NAME)?;
        delete_value(approved_key_path, run_key::VALUE_NAME)
    };
    remove().map_err(|e| AppError::new(AutostartError::EntryRemoveFailed).detail(e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use windows::Win32::System::Registry::{RegDeleteKeyW, RegDeleteTreeW};

    const EXE: &str = r"C:\Program Files\Deadlock+\deadlock-plus.exe";

    struct Scratch {
        root: String,
        run: String,
        approved: String,
    }

    impl Scratch {
        fn new() -> Self {
            static NEXT: AtomicU32 = AtomicU32::new(0);
            let root =
                format!(r"Software\DeadlockPlusTest\{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed));
            let scratch = Scratch { run: format!(r"{root}\Run"), approved: format!(r"{root}\Approved"), root };
            scratch.wipe();
            scratch
        }

        fn wipe(&self) {
            let root = wide(&self.root);
            let parent = wide(r"Software\DeadlockPlusTest");
            // SAFETY: both strings are NUL-terminated and outlive the calls. Only the scratch key under
            // `HKCU\Software\DeadlockPlusTest` is ever named; the parent delete fails harmlessly while other
            // test processes still have keys under it.
            unsafe {
                let _ = RegDeleteTreeW(HKEY_CURRENT_USER, PCWSTR(root.as_ptr()));
                let _ = RegDeleteKeyW(HKEY_CURRENT_USER, PCWSTR(root.as_ptr()));
                let _ = RegDeleteKeyW(HKEY_CURRENT_USER, PCWSTR(parent.as_ptr()));
            }
        }

        fn run_value(&self) -> Option<String> {
            read_string(&self.run, run_key::VALUE_NAME).unwrap()
        }

        fn approved_value(&self) -> Option<Vec<u8>> {
            read_value(&self.approved, run_key::VALUE_NAME).unwrap()
        }

        fn status(&self, exe: &str) -> State {
            status(&self.run, &self.approved, exe).unwrap()
        }

        fn enable(&self, exe: &str) {
            enable(&self.run, &self.approved, exe).unwrap();
        }

        fn disable(&self) {
            disable(&self.run, &self.approved).unwrap();
        }

        fn task_manager_disable(&self) {
            set_value(&self.approved, run_key::VALUE_NAME, REG_BINARY, &[0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
                .unwrap();
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            self.wipe();
        }
    }

    #[test]
    fn nothing_written_means_off() {
        let s = Scratch::new();
        assert_eq!(s.status(EXE), State { enabled: false, stale: false });
    }

    #[test]
    fn enable_writes_the_run_value_and_the_enabled_approval() {
        let s = Scratch::new();
        s.enable(EXE);
        assert_eq!(s.run_value().as_deref(), Some(r#""C:\Program Files\Deadlock+\deadlock-plus.exe" --autostart"#));
        assert_eq!(s.approved_value().as_deref(), Some(&run_key::APPROVED_ENABLED[..]));
        assert_eq!(s.status(EXE), State { enabled: true, stale: false });
    }

    #[test]
    fn run_value_is_a_reg_sz() {
        let s = Scratch::new();
        s.enable(EXE);
        let key = open(&s.run, KEY_QUERY_VALUE).unwrap().unwrap();
        let name = wide(run_key::VALUE_NAME);
        let mut kind = REG_VALUE_TYPE(0);
        // SAFETY: `name` is NUL-terminated and `kind` is a valid out-pointer; no data is requested.
        unsafe { RegQueryValueExW(key.0, PCWSTR(name.as_ptr()), None, Some(&mut kind), None, None) }.ok().unwrap();
        assert_eq!(kind, REG_SZ);
    }

    #[test]
    fn enable_clears_a_task_manager_disable() {
        let s = Scratch::new();
        s.enable(EXE);
        s.task_manager_disable();
        assert_eq!(s.status(EXE), State { enabled: false, stale: false });
        s.enable(EXE);
        assert_eq!(s.status(EXE), State { enabled: true, stale: false });
    }

    #[test]
    fn an_entry_for_another_exe_is_stale_until_rewritten() {
        let s = Scratch::new();
        s.enable(r"D:\Old\deadlock-plus.exe");
        assert_eq!(s.status(EXE), State { enabled: true, stale: true });
        s.enable(EXE);
        assert_eq!(s.status(EXE), State { enabled: true, stale: false });
    }

    #[test]
    fn disable_removes_both_values_and_is_idempotent() {
        let s = Scratch::new();
        s.disable();
        s.enable(EXE);
        s.disable();
        assert_eq!(s.run_value(), None);
        assert_eq!(s.approved_value(), None);
        s.disable();
        assert_eq!(s.status(EXE), State { enabled: false, stale: false });
    }
}
