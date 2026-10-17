use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::io::{FromRawHandle, OwnedHandle};
use std::path::Path;

use dp_privilege::{runas_result, Outcome};
use windows::core::PCWSTR;
use windows::Win32::Foundation::HANDLE;
use windows::Win32::UI::Shell::{
    ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
};
use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;

pub fn launch(exe: &Path, params: &str) -> Result<OwnedHandle, Outcome> {
    launch_with("runas", exe, params)
}

fn wide(s: &OsStr) -> Vec<u16> {
    s.encode_wide().chain(std::iter::once(0)).collect()
}

fn launch_with(verb: &str, exe: &Path, params: &str) -> Result<OwnedHandle, Outcome> {
    // Error boxes are only suppressed for non-elevating verbs so the UAC flow is left untouched.
    let no_ui = if verb == "runas" { 0 } else { SEE_MASK_FLAG_NO_UI };
    let verb = wide(OsStr::new(verb));
    let file = wide(exe.as_os_str());
    let params = wide(OsStr::new(params));
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC | no_ui,
        lpVerb: PCWSTR(verb.as_ptr()),
        lpFile: PCWSTR(file.as_ptr()),
        lpParameters: PCWSTR(params.as_ptr()),
        nShow: SW_HIDE.0,
        ..Default::default()
    };
    // SAFETY: `info` is fully initialised, and the verb, file and parameter buffers are NUL-terminated
    // and outlive the call.
    let launched = unsafe { ShellExecuteExW(&mut info) };
    if let Err(error) = launched {
        // The windows crate already captured the Win32 error; reading it again can see a value
        // overwritten by its own error construction.
        let code = (error.code().0 as u32) & 0xFFFF;
        return Err(runas_result(Some(code)));
    }
    if info.hProcess.is_invalid() || info.hProcess == HANDLE::default() {
        return Err(Outcome::Failed("The launch returned no process handle.".into()));
    }
    // SAFETY: `SEE_MASK_NOCLOSEPROCESS` hands us a process handle that we own and nothing else closes.
    Ok(unsafe { OwnedHandle::from_raw_handle(info.hProcess.0) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::System::Threading::{GetExitCodeProcess, WaitForSingleObject};

    fn cmd() -> std::path::PathBuf {
        let root = std::env::var_os("SystemRoot").expect("SystemRoot");
        Path::new(&root).join("System32").join("cmd.exe")
    }

    fn exit_code(handle: &OwnedHandle) -> u32 {
        let raw = HANDLE(handle.as_raw_handle());
        // SAFETY: `raw` is a live process handle owned by `handle`.
        unsafe {
            WaitForSingleObject(raw, 30_000);
            let mut code = u32::MAX;
            GetExitCodeProcess(raw, &mut code).expect("exit code");
            code
        }
    }

    #[test]
    fn open_returns_a_waitable_process_handle() {
        let handle = launch_with("open", &cmd(), "/c exit 7").expect("launch");
        assert_eq!(exit_code(&handle), 7);
    }

    #[test]
    fn open_zero_exit() {
        let handle = launch_with("open", &cmd(), "/c exit 0").expect("launch");
        assert_eq!(exit_code(&handle), 0);
    }

    #[test]
    fn missing_file_is_a_failure_with_the_windows_error() {
        let missing = Path::new(r"C:\definitely\not\here\nothing.exe");
        match launch_with("open", missing, "") {
            Err(Outcome::Failed(text)) => assert!(text.starts_with("Windows error "), "{text}"),
            other => panic!("unexpected {other:?}"),
        }
    }
}
