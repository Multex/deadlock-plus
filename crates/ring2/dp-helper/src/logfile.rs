use std::ffi::OsString;
use std::fs::File;
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use log::{Level, LevelFilter, Log, Metadata, Record};

pub const DIR_NAME: &str = "Deadlock+";
pub const FILE_NAME: &str = "helper.log";
pub const MAX_LEN: u64 = 1024 * 1024;
#[cfg_attr(not(windows), allow(dead_code))]
const LEVEL: LevelFilter = LevelFilter::Info;

/// `program_data` is `%ProgramData%`. Anything but an absolute path without `..` gives `None`.
pub fn default_path(program_data: Option<OsString>) -> Option<PathBuf> {
    let base = PathBuf::from(program_data?);
    if !base.is_absolute() || base.components().any(|c| c == Component::ParentDir) {
        return None;
    }
    Some(base.join(DIR_NAME).join(FILE_NAME))
}

/// Installs the privileged server's file logger. Returns `false`, and nothing is logged, when the file cannot be
/// opened safely (see `secure`) or a logger is already installed. Only Windows has a privileged server.
pub fn init(path: &Path) -> bool {
    #[cfg(windows)]
    {
        let Ok(store) = secure::SecureStore::open(path) else {
            return false;
        };
        let Ok(writer) = Rotating::open(store, MAX_LEN) else {
            return false;
        };
        let logger: &'static FileLogger<secure::SecureStore> =
            Box::leak(Box::new(FileLogger { writer: Mutex::new(writer) }));
        if log::set_logger(logger).is_err() {
            return false;
        }
        log::set_max_level(LEVEL);
        true
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        false
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
fn rotated_name(path: &Path) -> Option<OsString> {
    let mut name = path.file_name()?.to_os_string();
    name.push(".1");
    Some(name)
}

#[cfg_attr(not(windows), allow(dead_code))]
trait Store: Send {
    /// The log file opened for appending, and its current length.
    fn open(&mut self) -> io::Result<(File, u64)>;
    /// Moves the current file to the rotated name, replacing the previous one.
    fn rotate(&mut self, file: File) -> io::Result<()>;
}

#[cfg_attr(not(windows), allow(dead_code))]
struct Rotating<S> {
    store: S,
    file: Option<File>,
    len: u64,
    limit: u64,
}

#[cfg_attr(not(windows), allow(dead_code))]
impl<S: Store> Rotating<S> {
    fn open(mut store: S, limit: u64) -> io::Result<Self> {
        let (file, len) = store.open()?;
        Ok(Self { store, file: Some(file), len, limit })
    }

    /// A failed write, rotation or reopen switches logging off for good: retrying would reopen a path whose
    /// checks just failed, possibly because someone is tampering with it.
    fn write(&mut self, record: &str) {
        let record = truncate(record, self.limit);
        let n = record.len() as u64;
        if self.len > 0 && self.len.saturating_add(n) > self.limit {
            let Some(file) = self.file.take() else {
                return;
            };
            match self.store.rotate(file).and_then(|()| self.store.open()) {
                Ok((file, len)) => {
                    self.file = Some(file);
                    self.len = len;
                }
                Err(_) => return,
            }
        }
        let Some(file) = self.file.as_mut() else {
            return;
        };
        if file.write_all(record.as_bytes()).is_err() {
            self.file = None;
            return;
        }
        self.len = self.len.saturating_add(n);
    }

    fn flush(&mut self) {
        if let Some(file) = self.file.as_mut() {
            let _ = file.flush();
        }
    }
}

fn truncate(record: &str, limit: u64) -> String {
    let limit = usize::try_from(limit).unwrap_or(usize::MAX);
    if record.len() <= limit {
        return record.to_owned();
    }
    let mut end = limit.saturating_sub(1);
    while !record.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n", &record[..end])
}

#[cfg_attr(not(windows), allow(dead_code))]
struct FileLogger<S> {
    writer: Mutex<Rotating<S>>,
}

impl<S: Store> Log for FileLogger<S> {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= LEVEL
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let line = format_record(now_millis(), record.level(), record.target(), &record.args().to_string());
        self.writer.lock().unwrap_or_else(PoisonError::into_inner).write(&line);
    }

    fn flush(&self) {
        self.writer.lock().unwrap_or_else(PoisonError::into_inner).flush();
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
fn now_millis() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// One line per record: line breaks in the message become spaces so a client-supplied string cannot forge a
/// second record.
#[cfg_attr(not(windows), allow(dead_code))]
fn format_record(unix_millis: u64, level: Level, target: &str, message: &str) -> String {
    let message: String = message.chars().map(|c| if c == '\n' || c == '\r' { ' ' } else { c }).collect();
    format!("{} {:<5} {target}: {message}\n", utc(unix_millis), level.as_str())
}

#[cfg_attr(not(windows), allow(dead_code))]
fn utc(unix_millis: u64) -> String {
    let secs = unix_millis / 1000;
    let rem = secs % 86_400;
    let (year, month, day) = civil_from_days((secs / 86_400) as i64);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60,
        unix_millis % 1000
    )
}

// Howard Hinnant's `civil_from_days`: proleptic Gregorian date of a day count since 1970-01-01.
#[cfg_attr(not(windows), allow(dead_code))]
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// The server runs as SYSTEM or an administrator, and any user may create folders in `%ProgramData%`. A user who
/// owns the log folder could plant a junction, a symlink or a hard link to a file they cannot write (hard links
/// need no write access to the target), and the server's appends would land there. So a folder is used only when
/// SYSTEM or Administrators own it, and every open re-checks the folder and the file through their handles.
#[cfg(windows)]
mod secure {
    use std::ffi::{c_void, OsStr, OsString};
    use std::fs::{File, OpenOptions};
    use std::io;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use std::path::{Path, PathBuf};

    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{LocalFree, BOOLEAN, ERROR_ALREADY_EXISTS, ERROR_SUCCESS, HANDLE, HLOCAL};
    use windows::Win32::Security::Authorization::{
        ConvertStringSecurityDescriptorToSecurityDescriptorW, GetSecurityInfo, SDDL_REVISION_1, SE_FILE_OBJECT,
    };
    use windows::Win32::Security::{
        IsWellKnownSid, WinBuiltinAdministratorsSid, WinLocalSystemSid, OWNER_SECURITY_INFORMATION,
        PSECURITY_DESCRIPTOR, PSID, SECURITY_ATTRIBUTES,
    };
    use windows::Win32::Storage::FileSystem::{
        CreateDirectoryW, FileRenameInfo, GetFileInformationByHandle, GetFinalPathNameByHandleW,
        SetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION, DELETE, FILE_APPEND_DATA, FILE_ATTRIBUTE_DIRECTORY,
        FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_LIST_DIRECTORY,
        FILE_NAME_NORMALIZED, FILE_READ_ATTRIBUTES, FILE_RENAME_INFO, FILE_SHARE_READ, FILE_SHARE_WRITE,
        GETFINALPATHNAMEBYHANDLE_FLAGS, READ_CONTROL, SYNCHRONIZE, VOLUME_NAME_DOS,
    };

    use super::Store;

    /// Protected (no inherited ACEs): SYSTEM and Administrators full control, Users read and traverse.
    pub(super) const DIR_SDDL: &str = "D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FRFX;;;BU)";

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub(super) enum Refusal {
        ReparsePoint,
        NotDirectory,
        Directory,
        Links(u32),
        Path,
        Owner,
        Io(io::ErrorKind),
    }

    impl From<io::Error> for Refusal {
        fn from(e: io::Error) -> Self {
            Refusal::Io(e.kind())
        }
    }

    impl From<Refusal> for io::Error {
        fn from(r: Refusal) -> Self {
            match r {
                Refusal::Io(kind) => kind.into(),
                other => io::Error::new(io::ErrorKind::PermissionDenied, format!("{other:?}")),
            }
        }
    }

    pub(super) struct SecureStore {
        // Held open without FILE_SHARE_DELETE for the logger's lifetime, so the checked folder cannot be renamed
        // away and replaced by a junction between checks.
        dir: File,
        path: PathBuf,
        rotated: OsString,
    }

    impl SecureStore {
        pub(super) fn open(path: &Path) -> Result<Self, Refusal> {
            let dir_path = path.parent().ok_or(Refusal::Path)?;
            let rotated = super::rotated_name(path).ok_or(Refusal::Path)?;
            create_dir(dir_path)?;
            let dir = open_dir(dir_path)?;
            Ok(Self { dir, path: path.to_owned(), rotated })
        }
    }

    impl Store for SecureStore {
        fn open(&mut self) -> io::Result<(File, u64)> {
            let dir_final = final_path(&self.dir)?;
            Ok(open_file(&self.path, &dir_final)?)
        }

        fn rotate(&mut self, file: File) -> io::Result<()> {
            rename_in_place(&file, &self.dir, &self.rotated)
        }
    }

    fn wide(s: &OsStr) -> Vec<u16> {
        s.encode_wide().chain(Some(0)).collect()
    }

    fn handle(file: &File) -> HANDLE {
        HANDLE(file.as_raw_handle())
    }

    /// Creates the folder with `DIR_SDDL`. An existing folder is left alone here; `open_dir` decides whether to
    /// trust it.
    pub(super) fn create_dir(dir: &Path) -> io::Result<()> {
        let sddl = wide(OsStr::new(DIR_SDDL));
        let mut sd = PSECURITY_DESCRIPTOR::default();
        // SAFETY: `sddl` is a NUL-terminated UTF-16 string that outlives the call, and `sd` is a valid out-pointer.
        // On success `sd` owns a LocalAlloc'd descriptor that is freed below.
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(PCWSTR(sddl.as_ptr()), SDDL_REVISION_1, &mut sd, None)
        }?;
        let attributes = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: sd.0,
            bInheritHandle: false.into(),
        };
        let path = wide(dir.as_os_str());
        // SAFETY: `path` is NUL-terminated and `attributes` points at the descriptor converted above; both live
        // until the call returns.
        let created = unsafe { CreateDirectoryW(PCWSTR(path.as_ptr()), Some(&attributes)) };
        // SAFETY: `sd` came from the conversion above and nothing else holds it, so this is its only free.
        let _ = unsafe { LocalFree(HLOCAL(sd.0)) };
        match created {
            Ok(()) => Ok(()),
            Err(e) if e.code() == ERROR_ALREADY_EXISTS.to_hresult() => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    /// Opens the folder itself, never a junction's target, without FILE_SHARE_DELETE. Sharing rules ignore handles
    /// that hold only attribute or READ_CONTROL access, so FILE_LIST_DIRECTORY is what makes the missing
    /// FILE_SHARE_DELETE stop others from renaming the folder.
    pub(super) fn open_dir_handle(dir: &Path) -> io::Result<File> {
        OpenOptions::new()
            .access_mode(FILE_LIST_DIRECTORY.0 | READ_CONTROL.0 | FILE_READ_ATTRIBUTES.0 | SYNCHRONIZE.0)
            .share_mode(FILE_SHARE_READ.0 | FILE_SHARE_WRITE.0)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS.0 | FILE_FLAG_OPEN_REPARSE_POINT.0)
            .open(dir)
    }

    /// The final path must equal the requested one, so no component of the path is a junction or symlink.
    pub(super) fn open_dir(dir: &Path) -> Result<File, Refusal> {
        let file = open_dir_handle(dir)?;
        let attributes = info(&file)?.dwFileAttributes;
        if attributes & FILE_ATTRIBUTE_REPARSE_POINT.0 != 0 {
            return Err(Refusal::ReparsePoint);
        }
        if attributes & FILE_ATTRIBUTE_DIRECTORY.0 == 0 {
            return Err(Refusal::NotDirectory);
        }
        if !same_path_ignoring_case(&final_path(&file)?, &verbatim(dir)) {
            return Err(Refusal::Path);
        }
        if !owned_by_system_or_admins(&file)? {
            return Err(Refusal::Owner);
        }
        Ok(file)
    }

    /// Shares only reads, so nobody else can rename, delete or write the open log.
    pub(super) fn open_log_handle(path: &Path) -> io::Result<File> {
        OpenOptions::new()
            .append(true)
            .create(true)
            .access_mode(FILE_APPEND_DATA.0 | FILE_READ_ATTRIBUTES.0 | READ_CONTROL.0 | DELETE.0 | SYNCHRONIZE.0)
            .share_mode(FILE_SHARE_READ.0)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT.0)
            .open(path)
    }

    /// A hard link keeps the target's owner and security, so only the link count catches one.
    pub(super) fn open_file(path: &Path, dir_final: &[u16]) -> Result<(File, u64), Refusal> {
        let file = open_log_handle(path)?;
        let info = info(&file)?;
        if info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT.0 != 0 {
            return Err(Refusal::ReparsePoint);
        }
        if info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY.0 != 0 {
            return Err(Refusal::Directory);
        }
        if info.nNumberOfLinks != 1 {
            return Err(Refusal::Links(info.nNumberOfLinks));
        }
        let file_final = final_path(&file)?;
        let parent = file_final.iter().rposition(|&c| c == u16::from(b'\\')).map(|i| &file_final[..i]);
        if parent != Some(dir_final) {
            return Err(Refusal::Path);
        }
        if !owned_by_system_or_admins(&file)? {
            return Err(Refusal::Owner);
        }
        let len = (u64::from(info.nFileSizeHigh) << 32) | u64::from(info.nFileSizeLow);
        Ok((file, len))
    }

    /// Renames the open file to `name` inside `dir`. The source is the checked handle, not a path. The target path
    /// is `dir`'s current final path, which holds no junction, and cannot change while `dir` is open: the folder
    /// itself is held without FILE_SHARE_DELETE, and NTFS refuses to rename a folder above an open handle.
    pub(super) fn rename_in_place(file: &File, dir: &File, name: &OsStr) -> io::Result<()> {
        let mut name_wide = final_path(dir)?;
        name_wide.push(u16::from(b'\\'));
        name_wide.extend(name.encode_wide());
        let name = name_wide;
        let name_bytes = std::mem::size_of_val(name.as_slice());
        let size = std::mem::size_of::<FILE_RENAME_INFO>() + name_bytes;
        let mut buffer = vec![0u64; size.div_ceil(8)];
        let info = buffer.as_mut_ptr().cast::<FILE_RENAME_INFO>();
        // SAFETY: `buffer` is zeroed, 8-byte aligned and at least `size` bytes, which covers the struct header and
        // the name written after `FileName`. A bare name or a non-null `RootDirectory` does not work here: the first
        // is resolved against the current directory, the second fails with ERROR_INVALID_PARAMETER.
        unsafe {
            (*info).Anonymous.ReplaceIfExists = BOOLEAN(1);
            (*info).FileNameLength = name_bytes as u32;
            std::ptr::copy_nonoverlapping(
                name.as_ptr(),
                std::ptr::addr_of_mut!((*info).FileName).cast::<u16>(),
                name.len(),
            );
            SetFileInformationByHandle(handle(file), FileRenameInfo, info.cast::<c_void>(), size as u32)
        }?;
        Ok(())
    }

    fn info(file: &File) -> io::Result<BY_HANDLE_FILE_INFORMATION> {
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        // SAFETY: the handle is open for the duration of the call and `info` is a valid out-pointer.
        unsafe { GetFileInformationByHandle(handle(file), &mut info) }?;
        Ok(info)
    }

    pub(super) fn final_path(file: &File) -> io::Result<Vec<u16>> {
        let mut buffer = vec![0u16; 512];
        loop {
            // SAFETY: the handle is open and the slice is a valid writable buffer of its own length.
            let n = unsafe {
                GetFinalPathNameByHandleW(
                    handle(file),
                    &mut buffer,
                    GETFINALPATHNAMEBYHANDLE_FLAGS(FILE_NAME_NORMALIZED.0 | VOLUME_NAME_DOS.0),
                )
            } as usize;
            if n == 0 {
                return Err(io::Error::last_os_error());
            }
            if n < buffer.len() {
                buffer.truncate(n);
                return Ok(buffer);
            }
            buffer.resize(n, 0);
        }
    }

    fn verbatim(path: &Path) -> Vec<u16> {
        let mut path: Vec<u16> = path.as_os_str().encode_wide().collect();
        while path.len() > 1 && path.last() == Some(&u16::from(b'\\')) {
            path.pop();
        }
        let prefix: Vec<u16> = r"\\?\".encode_utf16().collect();
        if path.starts_with(&prefix) {
            path
        } else {
            prefix.into_iter().chain(path).collect()
        }
    }

    fn same_path_ignoring_case(a: &[u16], b: &[u16]) -> bool {
        String::from_utf16_lossy(a).to_lowercase() == String::from_utf16_lossy(b).to_lowercase()
    }

    fn owned_by_system_or_admins(file: &File) -> io::Result<bool> {
        let mut owner = PSID::default();
        let mut sd = PSECURITY_DESCRIPTOR::default();
        // SAFETY: the handle was opened with READ_CONTROL and both out-pointers are valid. On success `owner`
        // points into `sd`, a LocalAlloc'd descriptor freed below after the last use of `owner`.
        let status = unsafe {
            GetSecurityInfo(
                handle(file),
                SE_FILE_OBJECT,
                OWNER_SECURITY_INFORMATION,
                Some(&mut owner),
                None,
                None,
                None,
                Some(&mut sd),
            )
        };
        if status != ERROR_SUCCESS {
            return Err(io::Error::from_raw_os_error(status.0 as i32));
        }
        // SAFETY: `owner` points into `sd`, which is still alive.
        let trusted = unsafe {
            IsWellKnownSid(owner, WinLocalSystemSid).as_bool()
                || IsWellKnownSid(owner, WinBuiltinAdministratorsSid).as_bool()
        };
        // SAFETY: `sd` came from `GetSecurityInfo` above and nothing else holds it, so this is its only free.
        let _ = unsafe { LocalFree(HLOCAL(sd.0)) };
        Ok(trusted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::OpenOptions;

    struct Scratch(PathBuf);

    impl std::ops::Deref for Scratch {
        type Target = Path;

        fn deref(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    /// Canonical, so the folder checks compare against long names even when `%TEMP%` holds an 8.3 name.
    fn scratch(name: &str) -> Scratch {
        let base = std::fs::canonicalize(std::env::temp_dir()).unwrap();
        let dir = base.join(format!("dp-helper-logfile-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Scratch(dir)
    }

    struct PlainStore {
        path: PathBuf,
    }

    impl Store for PlainStore {
        fn open(&mut self) -> io::Result<(File, u64)> {
            let file = OpenOptions::new().create(true).append(true).open(&self.path)?;
            let len = file.metadata()?.len();
            Ok((file, len))
        }

        fn rotate(&mut self, file: File) -> io::Result<()> {
            drop(file);
            std::fs::rename(&self.path, self.path.with_file_name(rotated_name(&self.path).unwrap()))
        }
    }

    struct FailingRotate(PlainStore);

    impl Store for FailingRotate {
        fn open(&mut self) -> io::Result<(File, u64)> {
            self.0.open()
        }

        fn rotate(&mut self, _: File) -> io::Result<()> {
            Err(io::ErrorKind::PermissionDenied.into())
        }
    }

    fn read(path: &Path) -> String {
        std::fs::read_to_string(path).unwrap_or_default()
    }

    #[test]
    fn default_path_needs_an_absolute_program_data() {
        let base = std::env::temp_dir();
        assert_eq!(default_path(Some(base.clone().into_os_string())), Some(base.join("Deadlock+").join("helper.log")));
        assert_eq!(default_path(None), None);
        assert_eq!(default_path(Some(OsString::new())), None);
        assert_eq!(default_path(Some("ProgramData".into())), None);
        assert_eq!(default_path(Some(base.join("..").join("x").into_os_string())), None);
        #[cfg(windows)]
        {
            assert_eq!(default_path(Some(r"\ProgramData".into())), None);
            assert_eq!(default_path(Some(r"C:ProgramData".into())), None);
        }
    }

    #[test]
    fn records_are_one_line_with_a_utc_stamp() {
        assert_eq!(format_record(0, Level::Info, "dp", "up"), "1970-01-01T00:00:00.000Z INFO  dp: up\n");
        assert_eq!(
            format_record(1_700_000_000_123, Level::Error, "t", "a\nb\r\nc"),
            "2023-11-14T22:13:20.123Z ERROR t: a b  c\n"
        );
        assert_eq!(utc(951_782_400_000), "2000-02-29T00:00:00.000Z");
        assert_eq!(utc(4_107_542_399_999), "2100-02-28T23:59:59.999Z");
    }

    #[test]
    fn rotates_once_the_limit_would_be_passed() {
        let dir = scratch("rotate");
        let path = dir.join("helper.log");
        let old = dir.join("helper.log.1");
        let mut log = Rotating::open(PlainStore { path: path.clone() }, 10).unwrap();
        log.write("aaaa\n");
        log.write("bbbb\n");
        assert_eq!(read(&path), "aaaa\nbbbb\n");
        log.write("cccc\n");
        assert_eq!(read(&old), "aaaa\nbbbb\n");
        assert_eq!(read(&path), "cccc\n");
        log.write("dddd\n");
        log.write("eeee\n");
        assert_eq!(read(&old), "cccc\ndddd\n", "the previous rotated file is replaced");
        assert_eq!(read(&path), "eeee\n");
    }

    #[test]
    fn an_oversized_record_is_cut_to_the_limit() {
        let dir = scratch("oversize");
        let path = dir.join("helper.log");
        let mut log = Rotating::open(PlainStore { path: path.clone() }, 8).unwrap();
        log.write("0123456789abcdef\n");
        assert_eq!(read(&path), "0123456\n");
        assert_eq!(truncate("ééé\n", 5), "éé\n");
    }

    #[test]
    fn an_existing_full_file_rotates_on_the_first_write() {
        let dir = scratch("existing");
        let path = dir.join("helper.log");
        std::fs::write(&path, "0123456789").unwrap();
        let mut log = Rotating::open(PlainStore { path: path.clone() }, 10).unwrap();
        log.write("new\n");
        assert_eq!(read(&dir.join("helper.log.1")), "0123456789");
        assert_eq!(read(&path), "new\n");
    }

    #[test]
    fn a_failed_rotation_stops_logging() {
        let dir = scratch("failed");
        let path = dir.join("helper.log");
        let mut log = Rotating::open(FailingRotate(PlainStore { path: path.clone() }), 6).unwrap();
        log.write("abcd\n");
        log.write("efgh\n");
        log.write("i\n");
        assert_eq!(read(&path), "abcd\n");
        assert!(!dir.join("helper.log.1").exists());
    }

    #[test]
    fn the_logger_writes_enabled_records_only() {
        let dir = scratch("logger");
        let path = dir.join("helper.log");
        let logger =
            FileLogger { writer: Mutex::new(Rotating::open(PlainStore { path: path.clone() }, MAX_LEN).unwrap()) };
        logger.log(&Record::builder().level(Level::Info).target("dp").args(format_args!("kept")).build());
        logger.log(&Record::builder().level(Level::Debug).target("dp").args(format_args!("dropped")).build());
        let text = read(&path);
        assert!(text.ends_with(" INFO  dp: kept\n"), "{text}");
        assert_eq!(text.lines().count(), 1);
    }

    #[cfg(windows)]
    mod win {
        use super::super::secure::*;
        use super::*;
        use std::ffi::OsStr;
        use std::process::Command;

        fn junction(link: &Path, target: &Path) {
            let plain = |p: &Path| p.to_string_lossy().trim_start_matches(r"\\?\").to_owned();
            let status =
                Command::new("cmd").args(["/C", "mklink", "/J"]).arg(plain(link)).arg(plain(target)).output().unwrap();
            assert!(status.status.success(), "mklink /J failed: {status:?}");
        }

        fn dir_final(dir: &Path) -> Vec<u16> {
            final_path(&open_dir_handle(dir).unwrap()).unwrap()
        }

        fn dacl_sddl(dir: &Path) -> String {
            use std::os::windows::io::AsRawHandle;
            use windows::core::PWSTR;
            use windows::Win32::Foundation::{LocalFree, ERROR_SUCCESS, HANDLE, HLOCAL};
            use windows::Win32::Security::Authorization::{
                ConvertSecurityDescriptorToStringSecurityDescriptorW, GetSecurityInfo, SDDL_REVISION_1, SE_FILE_OBJECT,
            };
            use windows::Win32::Security::{DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR};

            let file = open_dir_handle(dir).unwrap();
            let mut sd = PSECURITY_DESCRIPTOR::default();
            // SAFETY: the handle has READ_CONTROL and `sd` is a valid out-pointer, freed below.
            let status = unsafe {
                GetSecurityInfo(
                    HANDLE(file.as_raw_handle()),
                    SE_FILE_OBJECT,
                    DACL_SECURITY_INFORMATION,
                    None,
                    None,
                    None,
                    None,
                    Some(&mut sd),
                )
            };
            assert_eq!(status, ERROR_SUCCESS);
            let mut text = PWSTR::null();
            // SAFETY: `sd` is the descriptor read above and `text` a valid out-pointer, freed below.
            unsafe {
                ConvertSecurityDescriptorToStringSecurityDescriptorW(
                    sd,
                    SDDL_REVISION_1,
                    DACL_SECURITY_INFORMATION,
                    &mut text,
                    None,
                )
            }
            .unwrap();
            // SAFETY: `text` is the NUL-terminated string the conversion returned.
            let out = unsafe { text.to_string() }.unwrap();
            // SAFETY: both were LocalAlloc'd by the calls above and are freed once.
            unsafe {
                let _ = LocalFree(HLOCAL(text.0.cast()));
                let _ = LocalFree(HLOCAL(sd.0));
            }
            out
        }

        #[test]
        fn a_created_folder_gets_the_protected_dacl() {
            let base = scratch("dacl");
            let dir = base.join("Deadlock+");
            create_dir(&dir).unwrap();
            let sddl = dacl_sddl(&dir);
            assert!(sddl.starts_with("D:P"), "{sddl}");
            assert!(sddl.contains("(A;OICI;FA;;;SY)"), "{sddl}");
            assert!(sddl.contains("(A;OICI;FA;;;BA)"), "{sddl}");
            assert!(sddl.contains("(A;OICI;0x1200a9;;;BU)"), "{sddl}");
            assert_eq!(sddl.matches('(').count(), 3, "{sddl}");
        }

        #[test]
        fn a_user_owned_folder_is_refused() {
            if dp_elevation::is_elevated() {
                return;
            }
            let dir = scratch("user-owned");
            assert_eq!(open_dir(&dir).err(), Some(Refusal::Owner));
        }

        #[test]
        fn a_folder_we_create_is_still_refused_when_not_elevated() {
            let base = scratch("store");
            let dir = base.join("Deadlock+");
            let result = SecureStore::open(&dir.join("helper.log"));
            if dp_elevation::is_elevated() {
                let mut log = Rotating::open(result.ok().unwrap(), 10).unwrap();
                log.write("aaaa\n");
                log.write("bbbb\n");
                log.write("cccc\n");
                assert_eq!(read(&dir.join("helper.log.1")), "aaaa\nbbbb\n");
                assert_eq!(read(&dir.join("helper.log")), "cccc\n");
            } else {
                assert_eq!(result.err(), Some(Refusal::Owner));
            }
        }

        #[test]
        fn a_junction_folder_is_refused() {
            let base = scratch("junction");
            let real = base.join("real");
            std::fs::create_dir(&real).unwrap();
            let link = base.join("Deadlock+");
            junction(&link, &real);
            assert_eq!(open_dir(&link).err(), Some(Refusal::ReparsePoint));
            assert_eq!(SecureStore::open(&link.join("helper.log")).err(), Some(Refusal::ReparsePoint));
        }

        #[test]
        fn a_junction_above_the_folder_is_refused() {
            let base = scratch("ancestor");
            let real = base.join("real");
            std::fs::create_dir_all(real.join("Deadlock+")).unwrap();
            let link = base.join("link");
            junction(&link, &real);
            assert_eq!(open_dir(&link.join("Deadlock+")).err(), Some(Refusal::Path));
        }

        #[test]
        fn a_file_in_place_of_the_folder_is_refused() {
            let base = scratch("not-dir");
            let file = base.join("Deadlock+");
            std::fs::write(&file, "").unwrap();
            assert_eq!(open_dir(&file).err(), Some(Refusal::NotDirectory));
        }

        #[test]
        fn a_hard_linked_log_is_refused() {
            let dir = scratch("hard-link");
            let target = dir.join("target.txt");
            std::fs::write(&target, "keep").unwrap();
            std::fs::hard_link(&target, dir.join("helper.log")).unwrap();
            assert_eq!(open_file(&dir.join("helper.log"), &dir_final(&dir)).err(), Some(Refusal::Links(2)));
            assert_eq!(read(&target), "keep");
        }

        #[test]
        fn a_symlinked_log_is_refused() {
            let dir = scratch("symlink");
            let target = dir.join("target.txt");
            std::fs::write(&target, "keep").unwrap();
            if std::os::windows::fs::symlink_file(&target, dir.join("helper.log")).is_err() {
                // Creating a symlink needs Developer Mode or SeCreateSymbolicLinkPrivilege.
                return;
            }
            assert_eq!(open_file(&dir.join("helper.log"), &dir_final(&dir)).err(), Some(Refusal::ReparsePoint));
            assert_eq!(read(&target), "keep");
        }

        /// Tags a file with a third-party reparse point. Unlike a symlink this needs no privilege, so it stands in
        /// for a planted symlink when testing the reparse check on the log file itself.
        fn tag_as_reparse_point(path: &Path) {
            use std::os::windows::fs::OpenOptionsExt;
            use std::os::windows::io::AsRawHandle;
            use windows::Win32::Foundation::HANDLE;
            use windows::Win32::System::IO::DeviceIoControl;

            const FSCTL_SET_REPARSE_POINT: u32 = 0x0009_00a4;
            const OPEN_REPARSE_POINT_AND_BACKUP: u32 = 0x0020_0000 | 0x0200_0000;
            let file = OpenOptions::new().write(true).custom_flags(OPEN_REPARSE_POINT_AND_BACKUP).open(path).unwrap();
            // REPARSE_GUID_DATA_BUFFER: tag, data length, reserved, GUID, then no data.
            let mut buffer = Vec::new();
            buffer.extend(0x0000_beefu32.to_le_bytes());
            buffer.extend(0u16.to_le_bytes());
            buffer.extend(0u16.to_le_bytes());
            buffer.extend([0x5a; 16]);
            let mut returned = 0u32;
            // SAFETY: the handle is open for writing and `buffer` is a complete REPARSE_GUID_DATA_BUFFER that lives
            // until the call returns; no output buffer is passed.
            unsafe {
                DeviceIoControl(
                    HANDLE(file.as_raw_handle()),
                    FSCTL_SET_REPARSE_POINT,
                    Some(buffer.as_ptr().cast()),
                    buffer.len() as u32,
                    None,
                    0,
                    Some(&mut returned),
                    None,
                )
            }
            .unwrap();
        }

        #[test]
        fn a_reparse_point_named_like_the_log_is_refused() {
            let dir = scratch("tagged");
            let path = dir.join("helper.log");
            std::fs::write(&path, "").unwrap();
            tag_as_reparse_point(&path);
            assert_eq!(open_file(&path, &dir_final(&dir)).err(), Some(Refusal::ReparsePoint));
        }

        #[test]
        fn a_junction_named_like_the_log_is_refused() {
            let dir = scratch("junction-log");
            let real = dir.join("real");
            std::fs::create_dir(&real).unwrap();
            junction(&dir.join("helper.log"), &real);
            assert!(open_file(&dir.join("helper.log"), &dir_final(&dir)).is_err());
            assert_eq!(std::fs::read_dir(&real).unwrap().count(), 0);
        }

        #[test]
        fn a_log_outside_the_checked_folder_is_refused() {
            let checked = scratch("checked");
            let other = scratch("other");
            assert_eq!(open_file(&other.join("helper.log"), &dir_final(&checked)).err(), Some(Refusal::Path));
        }

        #[test]
        fn a_plain_log_passes_every_check_but_the_owner_when_not_elevated() {
            let dir = scratch("plain");
            let result = open_file(&dir.join("helper.log"), &dir_final(&dir));
            if dp_elevation::is_elevated() {
                assert!(result.is_ok());
            } else {
                assert_eq!(result.err(), Some(Refusal::Owner));
            }
        }

        #[test]
        fn the_open_log_cannot_be_renamed_or_deleted_by_others() {
            let dir = scratch("share");
            let path = dir.join("helper.log");
            let _log = open_log_handle(&path).unwrap();
            assert!(std::fs::rename(&path, dir.join("moved")).is_err());
            assert!(std::fs::remove_file(&path).is_err());
        }

        #[test]
        fn the_checked_folder_cannot_be_renamed_while_open() {
            let base = scratch("pinned");
            let dir = base.join("Deadlock+");
            std::fs::create_dir(&dir).unwrap();
            let _held = open_dir_handle(&dir).unwrap();
            assert!(std::fs::rename(&dir, base.join("moved")).is_err());
        }

        #[test]
        fn a_folder_above_the_checked_folder_cannot_be_renamed_while_open() {
            let base = scratch("ancestor-pinned");
            let dir = base.join("a").join("Deadlock+");
            std::fs::create_dir_all(&dir).unwrap();
            let _held = open_dir_handle(&dir).unwrap();
            assert!(std::fs::rename(base.join("a"), base.join("b")).is_err());
        }

        #[test]
        fn rotation_renames_the_open_file_in_place() {
            let dir = scratch("rename");
            let path = dir.join("helper.log");
            std::fs::write(dir.join("helper.log.1"), "old").unwrap();
            let mut log = open_log_handle(&path).unwrap();
            log.write_all(b"new").unwrap();
            rename_in_place(&log, &open_dir_handle(&dir).unwrap(), OsStr::new("helper.log.1")).unwrap();
            drop(log);
            assert!(!path.exists());
            assert_eq!(read(&dir.join("helper.log.1")), "new");
        }
    }
}
