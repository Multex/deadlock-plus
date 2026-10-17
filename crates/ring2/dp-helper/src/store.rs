use crate::access::ApprovedSids;
use std::io;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND, WIN32_ERROR};
use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyExW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY, HKEY_LOCAL_MACHINE,
    KEY_CREATE_SUB_KEY, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_MULTI_SZ, REG_OPTION_NON_VOLATILE, REG_SAM_FLAGS,
    REG_VALUE_TYPE,
};

const VALUE: &str = "ApprovedSids";

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn encode_multi_sz(items: &[String]) -> Vec<u16> {
    let mut out = Vec::new();
    for item in items {
        out.extend(item.encode_utf16());
        out.push(0);
    }
    if items.is_empty() {
        out.push(0);
    }
    out.push(0);
    out
}

pub fn parse_multi_sz(data: &[u16]) -> Vec<String> {
    data.split(|&c| c == 0).take_while(|part| !part.is_empty()).map(String::from_utf16_lossy).collect()
}

fn valid_service(service: &str) -> io::Result<()> {
    if service.is_empty() || service.contains(['\\', '/', '\0']) {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid service name"));
    }
    Ok(())
}

fn services_path(service: &str) -> String {
    format!("SYSTEM\\CurrentControlSet\\Services\\{service}")
}

fn check(status: WIN32_ERROR) -> io::Result<()> {
    if status.is_ok() {
        Ok(())
    } else {
        Err(io::Error::from_raw_os_error(status.0 as i32))
    }
}

struct Key(HKEY);

impl Drop for Key {
    fn drop(&mut self) {
        // SAFETY: the handle was opened by us and is closed exactly once.
        let _ = unsafe { RegCloseKey(self.0) };
    }
}

fn open(path: &str, access: REG_SAM_FLAGS) -> Result<Key, WIN32_ERROR> {
    let path = wide(path);
    let mut key = HKEY::default();
    // SAFETY: `path` is NUL-terminated and outlives the call; `key` is a valid out pointer.
    let status = unsafe { RegOpenKeyExW(HKEY_LOCAL_MACHINE, PCWSTR(path.as_ptr()), 0, access, &mut key) };
    if status.is_ok() {
        Ok(Key(key))
    } else {
        Err(status)
    }
}

pub fn load(service: &str) -> io::Result<ApprovedSids> {
    valid_service(service)?;
    let key = match open(&format!("{}\\Parameters", services_path(service)), KEY_QUERY_VALUE) {
        Ok(key) => key,
        Err(e) if e == ERROR_FILE_NOT_FOUND || e == ERROR_PATH_NOT_FOUND => return Ok(ApprovedSids::default()),
        Err(e) => return Err(io::Error::from_raw_os_error(e.0 as i32)),
    };
    let name = wide(VALUE);
    let mut kind = REG_VALUE_TYPE::default();
    let mut size = 0u32;
    // SAFETY: `name` is NUL-terminated; the out pointers are valid for the call.
    let status =
        unsafe { RegQueryValueExW(key.0, PCWSTR(name.as_ptr()), None, Some(&mut kind), None, Some(&mut size)) };
    if status == ERROR_FILE_NOT_FOUND {
        return Ok(ApprovedSids::default());
    }
    check(status)?;
    if kind != REG_MULTI_SZ {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "ApprovedSids is not REG_MULTI_SZ"));
    }
    let mut bytes = vec![0u8; size as usize];
    // SAFETY: `bytes` holds `size` bytes and `size` is updated to the bytes written.
    let status = unsafe {
        RegQueryValueExW(key.0, PCWSTR(name.as_ptr()), None, Some(&mut kind), Some(bytes.as_mut_ptr()), Some(&mut size))
    };
    check(status)?;
    bytes.truncate(size as usize);
    let units: Vec<u16> = bytes.as_chunks::<2>().0.iter().map(|c| u16::from_le_bytes(*c)).collect();
    Ok(ApprovedSids::from_stored(parse_multi_sz(&units)))
}

pub fn save(service: &str, sids: &ApprovedSids) -> io::Result<()> {
    valid_service(service)?;
    let service_key =
        open(&services_path(service), KEY_CREATE_SUB_KEY).map_err(|e| io::Error::from_raw_os_error(e.0 as i32))?;
    let sub = wide("Parameters");
    let mut raw = HKEY::default();
    // SAFETY: `sub` is NUL-terminated; `service_key` is open; `raw` is a valid out pointer.
    let status = unsafe {
        RegCreateKeyExW(
            service_key.0,
            PCWSTR(sub.as_ptr()),
            0,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut raw,
            None,
        )
    };
    check(status)?;
    let params = Key(raw);
    let bytes: Vec<u8> = encode_multi_sz(&sids.to_stored()).iter().flat_map(|u| u.to_le_bytes()).collect();
    let name = wide(VALUE);
    // SAFETY: `name` is NUL-terminated and `params` is open with KEY_SET_VALUE.
    let status = unsafe { RegSetValueExW(params.0, PCWSTR(name.as_ptr()), 0, REG_MULTI_SZ, Some(&bytes)) };
    check(status)
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "S-1-5-21-1-2-3-1001";
    const B: &str = "S-1-5-21-1-2-3-1002";

    #[test]
    fn encodes_with_terminators() {
        let wide = |s: &str| s.encode_utf16().collect::<Vec<u16>>();
        let mut expected = wide("ab");
        expected.push(0);
        expected.extend(wide("c"));
        expected.extend([0, 0]);
        assert_eq!(encode_multi_sz(&["ab".into(), "c".into()]), expected);
    }

    #[test]
    fn empty_list_is_double_nul() {
        assert_eq!(encode_multi_sz(&[]), vec![0, 0]);
        assert!(parse_multi_sz(&[0, 0]).is_empty());
        assert!(parse_multi_sz(&[0]).is_empty());
        assert!(parse_multi_sz(&[]).is_empty());
    }

    #[test]
    fn round_trips() {
        let items = vec![A.to_string(), B.to_string()];
        assert_eq!(parse_multi_sz(&encode_multi_sz(&items)), items);
    }

    #[test]
    fn tolerates_missing_terminators() {
        let wide = |s: &str| s.encode_utf16().collect::<Vec<u16>>();
        assert_eq!(parse_multi_sz(&wide("abc")), vec!["abc"]);
        let mut one_nul = wide("a");
        one_nul.push(0);
        one_nul.extend(wide("b"));
        one_nul.push(0);
        assert_eq!(parse_multi_sz(&one_nul), vec!["a", "b"]);
    }

    #[test]
    fn stops_at_first_empty_entry() {
        let mut data: Vec<u16> = "a".encode_utf16().collect();
        data.extend([0, 0]);
        data.extend("junk".encode_utf16());
        data.extend([0, 0]);
        assert_eq!(parse_multi_sz(&data), vec!["a"]);
    }

    #[test]
    fn missing_service_loads_empty() {
        let list = load("DeadlockPlusTestNoSuchService").unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn rejects_bad_service_names() {
        for name in ["", "a\\b", "a/b", "a\0b"] {
            assert!(load(name).is_err(), "{name:?}");
            assert!(save(name, &ApprovedSids::default()).is_err(), "{name:?}");
        }
    }

    #[test]
    fn unelevated_save_on_missing_service_fails_and_creates_nothing() {
        if dp_elevation::is_elevated() {
            return;
        }
        let name = "DeadlockPlusTestNoSuchService";
        let list = ApprovedSids::from_stored(vec![A.into()]);
        assert!(save(name, &list).is_err());
        assert!(load(name).unwrap().is_empty());
        assert!(!key_exists(name));
    }

    fn key_exists(service: &str) -> bool {
        let path = wide(&format!("SYSTEM\\CurrentControlSet\\Services\\{service}"));
        let mut key = HKEY::default();
        // SAFETY: `path` is NUL-terminated and outlives the call; `key` is a valid out pointer.
        let status = unsafe { RegOpenKeyExW(HKEY_LOCAL_MACHINE, PCWSTR(path.as_ptr()), 0, KEY_QUERY_VALUE, &mut key) };
        if status.is_ok() {
            // SAFETY: `key` was opened above.
            let _ = unsafe { RegCloseKey(key) };
        }
        status.is_ok()
    }
}
