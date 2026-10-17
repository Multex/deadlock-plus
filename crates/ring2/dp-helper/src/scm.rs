use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{LocalFree, ERROR_SERVICE_DOES_NOT_EXIST, E_INVALIDARG, HLOCAL};
use windows::Win32::Security::Authorization::{ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1};
use windows::Win32::Security::{DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR};
use windows::Win32::Storage::FileSystem::{DELETE, WRITE_DAC};
use windows::Win32::System::Services::{
    ChangeServiceConfigW, CloseServiceHandle, CreateServiceW, DeleteService, OpenSCManagerW, OpenServiceW,
    QueryServiceStatusEx, SetServiceObjectSecurity, SC_HANDLE, SC_MANAGER_CONNECT, SC_MANAGER_CREATE_SERVICE,
    SC_STATUS_PROCESS_INFO, SERVICE_CHANGE_CONFIG, SERVICE_DEMAND_START, SERVICE_ERROR_NORMAL, SERVICE_QUERY_STATUS,
    SERVICE_STATUS_PROCESS, SERVICE_STOPPED, SERVICE_WIN32_OWN_PROCESS,
};

struct ScHandle(SC_HANDLE);

impl Drop for ScHandle {
    fn drop(&mut self) {
        // SAFETY: the handle came from a successful SCM open call and is closed only here.
        let _ = unsafe { CloseServiceHandle(self.0) };
    }
}

fn wide(s: &str) -> Result<Vec<u16>, String> {
    if s.contains('\0') {
        return Err(format!("{s:?} contains a NUL"));
    }
    Ok(s.encode_utf16().chain(std::iter::once(0)).collect())
}

fn open_manager(access: u32) -> windows::core::Result<ScHandle> {
    // SAFETY: null machine and database names select the local active database.
    unsafe { OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), access) }.map(ScHandle)
}

fn open(service: &str, access: u32) -> windows::core::Result<ScHandle> {
    let name = wide(service).map_err(|_| windows::core::Error::from(E_INVALIDARG))?;
    let manager = open_manager(SC_MANAGER_CONNECT)?;
    // SAFETY: `manager` is open and `name` is NUL-terminated; both outlive the call.
    unsafe { OpenServiceW(manager.0, PCWSTR(name.as_ptr()), access) }.map(ScHandle)
}

pub fn install_or_update(service: &str, display: &str, command_line: &str, sddl: &str) -> Result<(), String> {
    let name = wide(service)?;
    let display = wide(display)?;
    let command_line = wide(command_line)?;
    let access = SERVICE_CHANGE_CONFIG | WRITE_DAC.0;
    let handle = match open(service, access) {
        Ok(handle) => {
            // SAFETY: `handle` is open with SERVICE_CHANGE_CONFIG and every string is NUL-terminated and outlives the
            // call. The empty group and dependency strings clear both; "LocalSystem" takes an empty password.
            unsafe {
                ChangeServiceConfigW(
                    handle.0,
                    SERVICE_WIN32_OWN_PROCESS,
                    SERVICE_DEMAND_START,
                    SERVICE_ERROR_NORMAL,
                    PCWSTR(command_line.as_ptr()),
                    w!(""),
                    None,
                    w!(""),
                    w!("LocalSystem"),
                    w!(""),
                    PCWSTR(display.as_ptr()),
                )
            }
            .map_err(|e| format!("ChangeServiceConfigW({service}): {e}"))?;
            handle
        }
        Err(e) if e.code() == ERROR_SERVICE_DOES_NOT_EXIST.to_hresult() => {
            let manager = open_manager(SC_MANAGER_CONNECT | SC_MANAGER_CREATE_SERVICE)
                .map_err(|e| format!("OpenSCManagerW: {e}"))?;
            // SAFETY: `manager` is open with SC_MANAGER_CREATE_SERVICE and every string is NUL-terminated and
            // outlives the call. A null account name means LocalSystem.
            let handle = unsafe {
                CreateServiceW(
                    manager.0,
                    PCWSTR(name.as_ptr()),
                    PCWSTR(display.as_ptr()),
                    access,
                    SERVICE_WIN32_OWN_PROCESS,
                    SERVICE_DEMAND_START,
                    SERVICE_ERROR_NORMAL,
                    PCWSTR(command_line.as_ptr()),
                    PCWSTR::null(),
                    None,
                    PCWSTR::null(),
                    PCWSTR::null(),
                    PCWSTR::null(),
                )
            }
            .map_err(|e| format!("CreateServiceW({service}): {e}"))?;
            ScHandle(handle)
        }
        Err(e) => return Err(format!("OpenServiceW({service}): {e}")),
    };
    apply_dacl(&handle, service, sddl)
}

pub fn set_dacl(service: &str, sddl: &str) -> Result<(), String> {
    let handle = open(service, WRITE_DAC.0).map_err(|e| format!("OpenServiceW({service}): {e}"))?;
    apply_dacl(&handle, service, sddl)
}

/// Applies only the DACL of `sddl`, so the service's owner, group and SACL stay as the SCM set them.
fn apply_dacl(handle: &ScHandle, service: &str, sddl: &str) -> Result<(), String> {
    let sddl = wide(sddl)?;
    let mut sd = PSECURITY_DESCRIPTOR::default();
    // SAFETY: `sddl` is NUL-terminated and outlives the call; `sd` is a valid out-pointer. On success `sd` points at
    // a LocalAlloc'd descriptor that is freed below.
    unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(PCWSTR(sddl.as_ptr()), SDDL_REVISION_1, &mut sd, None)
    }
    .map_err(|e| format!("ConvertStringSecurityDescriptorToSecurityDescriptorW: {e}"))?;
    // SAFETY: `handle` is open with WRITE_DAC and `sd` is the valid descriptor converted above.
    let result = unsafe { SetServiceObjectSecurity(handle.0, DACL_SECURITY_INFORMATION, sd) }
        .map_err(|e| format!("SetServiceObjectSecurity({service}): {e}"));
    // SAFETY: `sd` was allocated by the conversion above and nothing else holds it.
    let _ = unsafe { LocalFree(HLOCAL(sd.0)) };
    result
}

pub fn delete(service: &str) -> Result<(), String> {
    let handle = open(service, DELETE.0).map_err(|e| format!("OpenServiceW({service}): {e}"))?;
    // SAFETY: `handle` is open with DELETE access.
    unsafe { DeleteService(handle.0) }.map_err(|e| format!("DeleteService({service}): {e}"))
}

/// The running service's process id; `None` when it is missing, stopped or has no process yet.
pub fn query_pid(service: &str) -> Option<u32> {
    let handle = open(service, SERVICE_QUERY_STATUS).ok()?;
    let mut status = SERVICE_STATUS_PROCESS::default();
    let mut needed = 0u32;
    // SAFETY: the byte slice covers exactly `status`, a plain struct that outlives the call, and `needed` is a valid
    // out-pointer. `handle` is open with SERVICE_QUERY_STATUS.
    unsafe {
        let buffer = std::slice::from_raw_parts_mut(
            &mut status as *mut SERVICE_STATUS_PROCESS as *mut u8,
            std::mem::size_of::<SERVICE_STATUS_PROCESS>(),
        );
        QueryServiceStatusEx(handle.0, SC_STATUS_PROCESS_INFO, Some(buffer), &mut needed)
    }
    .ok()?;
    (status.dwCurrentState != SERVICE_STOPPED && status.dwProcessId != 0).then_some(status.dwProcessId)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SERVICE: &str = "DeadlockPlusScmTestNeverInstalled";

    fn assert_missing(service: &str) {
        assert_ne!(service, crate::args::SERVICE_NAME);
        match open(service, SERVICE_QUERY_STATUS) {
            Ok(_) => panic!("{service} exists"),
            Err(e) => assert_eq!(e.code(), ERROR_SERVICE_DOES_NOT_EXIST.to_hresult()),
        }
    }

    #[test]
    fn unelevated_install_fails_and_creates_nothing() {
        if dp_elevation::is_elevated() {
            eprintln!("skipped: elevated, the install would succeed");
            return;
        }
        assert_missing(TEST_SERVICE);
        let exe = std::env::current_exe().unwrap();
        let command_line = crate::args::service_command_line(&exe).unwrap();
        let sddl = crate::access::service_sddl(&[]).unwrap();
        assert!(install_or_update(TEST_SERVICE, "Deadlock+ test", &command_line, &sddl).is_err());
        assert_missing(TEST_SERVICE);
    }

    #[test]
    fn query_pid_of_missing_service_is_none() {
        assert_missing(TEST_SERVICE);
        assert_eq!(query_pid(TEST_SERVICE), None);
    }

    #[test]
    fn query_pid_of_running_service_is_its_pid() {
        // RpcSs always runs and any user may query its status.
        assert!(matches!(query_pid("RpcSs"), Some(pid) if pid != 0));
    }

    #[test]
    fn set_dacl_on_missing_service_fails() {
        let sddl = crate::access::service_sddl(&[]).unwrap();
        assert!(set_dacl(TEST_SERVICE, &sddl).is_err());
        assert_missing(TEST_SERVICE);
    }

    #[test]
    fn delete_of_missing_service_fails() {
        assert!(delete(TEST_SERVICE).is_err());
    }

    #[test]
    fn names_with_nul_are_refused() {
        assert!(wide("a\0b").is_err());
        assert_eq!(wide("ab").unwrap(), [b'a' as u16, b'b' as u16, 0]);
    }
}
