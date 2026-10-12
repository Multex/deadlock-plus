use std::path::{Path, PathBuf};

const PROGRAM_FILES_STEAM: [&str; 2] = ["Program Files (x86)/Steam", "Program Files/Steam"];
const WHISKY_BOTTLES: &str = "Library/Containers/com.isaacmarovitz.Whisky/Bottles";
const CROSSOVER_BOTTLES: &str = "Library/Application Support/CrossOver/Bottles";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Host {
    Windows,
    Linux,
    MacOs,
}

impl Host {
    pub fn current() -> Self {
        if cfg!(windows) {
            Host::Windows
        } else if cfg!(target_os = "macos") {
            Host::MacOs
        } else {
            Host::Linux
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Env {
    pub home: Option<PathBuf>,
    pub xdg_data_home: Option<PathBuf>,
    pub snap_user_data: Option<PathBuf>,
    pub wineprefix: Option<PathBuf>,
}

impl Env {
    pub fn from_process() -> Self {
        let var = |name| std::env::var_os(name).filter(|v| !v.is_empty()).map(PathBuf::from);
        Env {
            home: std::env::home_dir(),
            xdg_data_home: var("XDG_DATA_HOME"),
            snap_user_data: var("SNAP_USER_DATA"),
            wineprefix: var("WINEPREFIX"),
        }
    }
}

/// Steam installs that live on the host file system. Windows is left to `steamlocate`.
pub fn native_steam_candidates(env: &Env, host: Host) -> Vec<PathBuf> {
    let Some(home) = &env.home else {
        return Vec::new();
    };
    match host {
        Host::Windows => Vec::new(),
        Host::MacOs => vec![home.join("Library/Application Support/Steam")],
        Host::Linux => {
            let data_home = env.xdg_data_home.clone().unwrap_or_else(|| home.join(".local/share"));
            let snap = env.snap_user_data.clone().unwrap_or_else(|| home.join("snap"));
            let flatpak = home.join(".var/app/com.valvesoftware.Steam");
            vec![
                flatpak.join(".local/share/Steam"),
                flatpak.join(".steam/steam"),
                flatpak.join(".steam/root"),
                data_home.join("Steam"),
                home.join(".steam/steam"),
                home.join(".steam/root"),
                home.join(".steam/debian-installation"),
                snap.join("steam/common/.local/share/Steam"),
                snap.join("steam/common/.steam/steam"),
                snap.join("steam/common/.steam/root"),
            ]
        }
    }
}

/// Directories that hold one Wine prefix per child (Whisky and CrossOver bottles).
pub fn bottle_parents(env: &Env, host: Host) -> Vec<PathBuf> {
    match (&env.home, host) {
        (Some(home), Host::MacOs) => vec![home.join(WHISKY_BOTTLES), home.join(CROSSOVER_BOTTLES)],
        _ => Vec::new(),
    }
}

/// Prefixes that need no directory listing. `WINEPREFIX` first, since it is an explicit choice.
pub fn fixed_prefixes(env: &Env, host: Host) -> Vec<PathBuf> {
    if host == Host::Windows {
        return Vec::new();
    }
    let mut out: Vec<PathBuf> = env.wineprefix.iter().cloned().collect();
    if let Some(home) = &env.home {
        out.push(home.join(".wine"));
    }
    out
}

/// Proton keeps the prefix of each game at `steamapps/compatdata/<appid>/pfx` in the library that holds it.
pub fn compat_prefix(library: &Path, app_id: u32) -> PathBuf {
    library.join("steamapps").join("compatdata").join(app_id.to_string()).join("pfx")
}

/// Where a Windows Steam install sits inside a prefix.
pub fn steam_dirs_in_prefix(prefix: &Path) -> Vec<PathBuf> {
    PROGRAM_FILES_STEAM.iter().map(|rel| prefix.join("drive_c").join(rel)).collect()
}

/// Maps a Windows path (`D:\SteamLibrary`) to the host path it names inside `prefix`. Wine exposes drive
/// letters as symlinks in `dosdevices`; `c:` falls back to `drive_c` and `z:` to `/` when they are missing.
pub fn prefix_host_path(prefix: &Path, windows_path: &str, exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    let mut chars = windows_path.chars();
    let letter = chars.next()?.to_ascii_lowercase();
    if !letter.is_ascii_lowercase() || chars.next()? != ':' {
        return None;
    }
    let rest = windows_path[2..].trim_start_matches(['\\', '/']);
    let device = prefix.join("dosdevices").join(format!("{letter}:"));
    let base = if exists(&device) {
        device
    } else if letter == 'c' {
        prefix.join("drive_c")
    } else if letter == 'z' {
        PathBuf::from("/")
    } else {
        return None;
    };
    Some(rest.split(['\\', '/']).filter(|p| !p.is_empty()).fold(base, |acc, part| acc.join(part)))
}

fn unescape(value: &str) -> String {
    value.replace("\\\\", "\\")
}

fn quoted(line: &str) -> Vec<&str> {
    line.split('"').skip(1).step_by(2).collect()
}

/// The `path` of every library in `libraryfolders.vdf`, as written (Windows style inside a prefix).
pub fn parse_library_paths(vdf: &str) -> Vec<String> {
    vdf.lines()
        .filter_map(|line| match quoted(line).as_slice() {
            ["path", value] => Some(unescape(value)),
            _ => None,
        })
        .collect()
}

pub fn parse_install_dir(acf: &str) -> Option<String> {
    acf.lines().find_map(|line| match quoted(line).as_slice() {
        ["installdir", value] if !value.is_empty() => Some(unescape(value)),
        _ => None,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SteamRoot {
    pub path: PathBuf,
    /// Set when Steam runs under Wine: library paths in its config are Windows paths of this prefix.
    pub prefix: Option<PathBuf>,
}

struct RootList {
    roots: Vec<SteamRoot>,
    seen: Vec<PathBuf>,
}

impl RootList {
    fn push(&mut self, path: PathBuf, prefix: Option<PathBuf>) {
        if !path.join("steamapps").is_dir() {
            return;
        }
        let key = path.canonicalize().unwrap_or_else(|_| path.clone());
        if !self.seen.contains(&key) {
            self.seen.push(key);
            self.roots.push(SteamRoot { path, prefix });
        }
    }
}

fn child_dirs(parent: &Path) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(parent)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    dirs
}

/// Every Steam install found on this machine, native ones first, then Steam running under Wine.
pub fn steam_roots(env: &Env, host: Host) -> Vec<SteamRoot> {
    let mut list = RootList { roots: Vec::new(), seen: Vec::new() };
    for path in native_steam_candidates(env, host) {
        list.push(path, None);
    }
    let mut prefixes = fixed_prefixes(env, host);
    for parent in bottle_parents(env, host) {
        prefixes.extend(child_dirs(&parent));
    }
    prefixes.extend(list.roots.iter().map(|r| compat_prefix(&r.path, crate::DEADLOCK_APP_ID)));
    for prefix in prefixes {
        for steam in steam_dirs_in_prefix(&prefix) {
            list.push(steam, Some(prefix.clone()));
        }
    }
    list.roots
}

fn library_dirs(root: &SteamRoot) -> Vec<PathBuf> {
    let vdf = ["steamapps", "config"]
        .iter()
        .find_map(|dir| std::fs::read_to_string(root.path.join(dir).join("libraryfolders.vdf")).ok())
        .unwrap_or_default();
    let mut dirs = vec![root.path.clone()];
    for raw in parse_library_paths(&vdf) {
        let dir = match &root.prefix {
            Some(prefix) => prefix_host_path(prefix, &raw, |p| p.exists()),
            None => Some(PathBuf::from(raw)),
        };
        if let Some(dir) = dir.filter(|d| !dirs.contains(d)) {
            dirs.push(dir);
        }
    }
    dirs
}

/// Finds an installed app through the manifests of every library of this Steam install.
pub fn find_game_dir(root: &SteamRoot, app_id: u32) -> Option<PathBuf> {
    library_dirs(root).into_iter().find_map(|library| {
        let steamapps = library.join("steamapps");
        let acf = std::fs::read_to_string(steamapps.join(format!("appmanifest_{app_id}.acf"))).ok()?;
        let dir = steamapps.join("common").join(parse_install_dir(&acf)?);
        dir.is_dir().then_some(dir)
    })
}

pub fn parse_build_id(acf: &str) -> Option<u64> {
    acf.lines().find_map(|line| match quoted(line).as_slice() {
        ["buildid", value] => value.parse().ok(),
        _ => None,
    })
}

/// Reads `buildid` from the manifest in the `steamapps` folder that holds `common/<game_dir>`.
pub fn installed_build_id(game_dir: &Path, app_id: u32) -> Option<u64> {
    let common = game_dir.parent()?;
    if !common.file_name()?.eq_ignore_ascii_case("common") {
        return None;
    }
    let manifest = common.parent()?.join(format!("appmanifest_{app_id}.acf"));
    parse_build_id(&std::fs::read_to_string(manifest).ok()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    struct Home(PathBuf);

    impl Home {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("dp-steam-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            Home(dir)
        }

        fn env(&self) -> Env {
            Env { home: Some(self.0.clone()), ..Env::default() }
        }

        fn write(&self, rel: &str, content: &str) {
            let path = self.0.join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }

        fn dir(&self, rel: &str) -> PathBuf {
            let path = self.0.join(rel);
            fs::create_dir_all(&path).unwrap();
            path
        }
    }

    impl Drop for Home {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    const MANIFEST: &str = "\"AppState\"\n{\n\t\"installdir\"\t\t\"Deadlock\"\n}";

    #[test]
    fn finds_flatpak_steam_and_the_game_in_its_library() {
        let home = Home::new("flatpak");
        let steam = ".var/app/com.valvesoftware.Steam/.local/share/Steam";
        home.dir(&format!("{steam}/steamapps/common/Deadlock"));
        home.write(&format!("{steam}/steamapps/appmanifest_1422450.acf"), MANIFEST);
        let roots = steam_roots(&home.env(), Host::Linux);
        assert_eq!(roots, vec![SteamRoot { path: home.0.join(steam), prefix: None }]);
        assert_eq!(find_game_dir(&roots[0], 1422450), Some(home.0.join(steam).join("steamapps/common/Deadlock")));
    }

    #[test]
    fn a_second_library_in_libraryfolders_is_searched() {
        let home = Home::new("library");
        let steam = home.dir(".local/share/Steam/steamapps");
        let lib = home.dir("games/lib/steamapps/common/Deadlock");
        let vdf = format!(
            "\"libraryfolders\"\n{{\n\"1\"\n{{\n\"path\"\t\"{}\"\n}}\n}}",
            lib.ancestors().nth(3).unwrap().display()
        );
        fs::write(steam.join("libraryfolders.vdf"), vdf.replace('\\', "\\\\")).unwrap();
        fs::write(home.0.join("games/lib/steamapps/appmanifest_1422450.acf"), MANIFEST).unwrap();
        let root = SteamRoot { path: home.0.join(".local/share/Steam"), prefix: None };
        assert_eq!(find_game_dir(&root, 1422450), Some(lib));
    }

    #[test]
    fn finds_steam_inside_a_whisky_bottle() {
        let home = Home::new("whisky");
        let bottle = "Library/Containers/com.isaacmarovitz.Whisky/Bottles/ABC";
        let steam = format!("{bottle}/drive_c/Program Files (x86)/Steam");
        home.dir(&format!("{steam}/steamapps/common/Deadlock"));
        home.write(&format!("{steam}/steamapps/appmanifest_1422450.acf"), MANIFEST);
        home.write(
            &format!("{steam}/steamapps/libraryfolders.vdf"),
            "\"libraryfolders\"\n{\n\"0\"\n{\n\"path\"\t\"C:\\\\Program Files (x86)\\\\Steam\"\n}\n}",
        );
        let roots = steam_roots(&home.env(), Host::MacOs);
        assert_eq!(roots, vec![SteamRoot { path: home.0.join(&steam), prefix: Some(home.0.join(bottle)) }]);
        assert_eq!(find_game_dir(&roots[0], 1422450), Some(home.0.join(&steam).join("steamapps/common/Deadlock")));
    }

    #[test]
    fn finds_steam_in_wineprefix_and_default_prefix() {
        let home = Home::new("wine");
        home.dir("custom/drive_c/Program Files (x86)/Steam/steamapps");
        home.dir(".wine/drive_c/Program Files/Steam/steamapps");
        let env = Env { wineprefix: Some(home.0.join("custom")), ..home.env() };
        let paths: Vec<PathBuf> = steam_roots(&env, Host::Linux).into_iter().map(|r| r.path).collect();
        assert_eq!(
            paths,
            vec![
                home.0.join("custom/drive_c/Program Files (x86)/Steam"),
                home.0.join(".wine/drive_c/Program Files/Steam")
            ]
        );
    }

    #[test]
    fn native_steam_is_listed_before_wine_steam() {
        let home = Home::new("order");
        home.dir(".wine/drive_c/Program Files (x86)/Steam/steamapps");
        home.dir(".steam/steam/steamapps");
        let roots = steam_roots(&home.env(), Host::Linux);
        assert_eq!(roots[0].prefix, None);
        assert_eq!(roots[1].prefix, Some(home.0.join(".wine")));
    }

    #[test]
    fn nothing_is_found_on_an_empty_home_and_on_windows() {
        let home = Home::new("empty");
        assert!(steam_roots(&home.env(), Host::Linux).is_empty());
        home.dir(".steam/steam/steamapps");
        assert!(steam_roots(&home.env(), Host::Windows).is_empty());
    }

    #[test]
    fn a_missing_manifest_or_game_folder_means_not_installed() {
        let home = Home::new("missing");
        let steam = home.dir(".steam/steam/steamapps");
        let root = SteamRoot { path: steam.parent().unwrap().to_path_buf(), prefix: None };
        assert_eq!(find_game_dir(&root, 1422450), None);
        fs::write(steam.join("appmanifest_1422450.acf"), MANIFEST).unwrap();
        assert_eq!(find_game_dir(&root, 1422450), None);
    }

    const BUILD_MANIFEST: &str = "\"AppState\"
{
	\"installdir\"		\"Deadlock\"
	\"buildid\"		\"25841406\"
	\"TargetBuildID\"		\"25841999\"
}";

    #[test]
    fn the_build_id_is_read_from_the_manifest() {
        assert_eq!(parse_build_id(BUILD_MANIFEST), Some(25841406));
        assert_eq!(parse_build_id(MANIFEST), None);
        assert_eq!(parse_build_id("\"buildid\"	\"abc\""), None);
    }

    #[test]
    fn the_installed_build_id_comes_from_the_manifest_beside_common() {
        let home = Home::new("build-id");
        home.write("lib/steamapps/appmanifest_1422450.acf", BUILD_MANIFEST);
        let game = home.dir("lib/steamapps/common/Deadlock");
        assert_eq!(installed_build_id(&game, 1422450), Some(25841406));
        assert_eq!(installed_build_id(&game, 99), None);
    }

    #[test]
    fn an_install_outside_a_steam_library_has_no_build_id() {
        let home = Home::new("build-id-loose");
        home.write("steamapps/appmanifest_1422450.acf", BUILD_MANIFEST);
        let loose = home.dir("elsewhere/Deadlock");
        assert_eq!(installed_build_id(&loose, 1422450), None);
    }

    fn env(home: &str) -> Env {
        Env { home: Some(PathBuf::from(home)), ..Env::default() }
    }

    #[test]
    fn linux_lists_native_flatpak_and_snap_steam() {
        let c = native_steam_candidates(&env("/home/u"), Host::Linux);
        assert!(c.contains(&PathBuf::from("/home/u/.var/app/com.valvesoftware.Steam/.local/share/Steam")));
        assert!(c.contains(&PathBuf::from("/home/u/.local/share/Steam")));
        assert!(c.contains(&PathBuf::from("/home/u/.steam/steam")));
        assert!(c.contains(&PathBuf::from("/home/u/snap/steam/common/.local/share/Steam")));
    }

    #[test]
    fn linux_honours_xdg_data_home_and_snap_user_data() {
        let e = Env { xdg_data_home: Some("/data".into()), snap_user_data: Some("/snapdata".into()), ..env("/home/u") };
        let c = native_steam_candidates(&e, Host::Linux);
        assert!(c.contains(&PathBuf::from("/data/Steam")));
        assert!(!c.contains(&PathBuf::from("/home/u/.local/share/Steam")));
        assert!(c.contains(&PathBuf::from("/snapdata/steam/common/.steam/steam")));
    }

    #[test]
    fn macos_uses_application_support() {
        assert_eq!(
            native_steam_candidates(&env("/Users/u"), Host::MacOs),
            vec![PathBuf::from("/Users/u/Library/Application Support/Steam")]
        );
    }

    #[test]
    fn windows_and_a_missing_home_give_no_candidates() {
        assert!(native_steam_candidates(&env("C:/Users/u"), Host::Windows).is_empty());
        assert!(native_steam_candidates(&Env::default(), Host::Linux).is_empty());
        assert!(fixed_prefixes(&env("C:/Users/u"), Host::Windows).is_empty());
        assert!(bottle_parents(&env("C:/Users/u"), Host::Windows).is_empty());
    }

    #[test]
    fn wineprefix_comes_before_the_default_prefix() {
        let e = Env { wineprefix: Some("/opt/pfx".into()), ..env("/home/u") };
        assert_eq!(fixed_prefixes(&e, Host::Linux), vec![PathBuf::from("/opt/pfx"), PathBuf::from("/home/u/.wine")]);
    }

    #[test]
    fn macos_bottles_are_whisky_and_crossover() {
        let parents = bottle_parents(&env("/Users/u"), Host::MacOs);
        assert_eq!(parents[0], PathBuf::from("/Users/u/Library/Containers/com.isaacmarovitz.Whisky/Bottles"));
        assert_eq!(parents[1], PathBuf::from("/Users/u/Library/Application Support/CrossOver/Bottles"));
        assert!(bottle_parents(&env("/home/u"), Host::Linux).is_empty());
    }

    #[test]
    fn proton_prefix_sits_in_compatdata() {
        assert_eq!(
            compat_prefix(Path::new("/lib"), 1422450),
            Path::new("/lib").join("steamapps").join("compatdata").join("1422450").join("pfx")
        );
    }

    #[test]
    fn steam_inside_a_prefix_is_under_drive_c() {
        let dirs = steam_dirs_in_prefix(Path::new("/p"));
        assert_eq!(dirs[0], Path::new("/p").join("drive_c").join("Program Files (x86)").join("Steam"));
        assert_eq!(dirs[1], Path::new("/p").join("drive_c").join("Program Files").join("Steam"));
    }

    #[test]
    fn drive_letters_map_through_dosdevices() {
        let prefix = Path::new("/p");
        let device = prefix.join("dosdevices").join("d:");
        let mapped = prefix_host_path(prefix, r"D:\SteamLibrary\x", |p| p == device).unwrap();
        assert_eq!(mapped, device.join("SteamLibrary").join("x"));
        assert_eq!(prefix_host_path(prefix, r"E:\Games", |p| p == device), None);
    }

    #[test]
    fn c_drive_and_z_drive_work_without_dosdevices() {
        let p = Path::new("/nonexistent-prefix");
        let steam = prefix_host_path(p, r"C:\Program Files (x86)\Steam", |_| false);
        assert_eq!(steam, Some(p.join("drive_c").join("Program Files (x86)").join("Steam")));
        assert_eq!(prefix_host_path(p, r"Z:\home\u", |_| false), Some(PathBuf::from("/").join("home").join("u")));
    }

    #[test]
    fn non_windows_paths_are_not_mapped() {
        let p = Path::new("/p");
        assert_eq!(prefix_host_path(p, "/home/u/lib", |_| true), None);
        assert_eq!(prefix_host_path(p, "", |_| true), None);
        assert_eq!(prefix_host_path(p, "C", |_| true), None);
    }

    #[test]
    fn library_paths_are_unescaped() {
        let vdf = "\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n\t\t\"label\"\t\t\"\"\n\t\t\"apps\"\n\t\t{\n\t\t\t\"1422450\"\t\t\"123\"\n\t\t}\n\t}\n\t\"1\"\n\t{\n\t\t\"path\"\t\t\"D:\\\\SteamLibrary\"\n\t}\n}";
        assert_eq!(
            parse_library_paths(vdf),
            vec![r"C:\Program Files (x86)\Steam".to_string(), r"D:\SteamLibrary".to_string()]
        );
        assert_eq!(parse_library_paths(""), Vec::<String>::new());
    }

    #[test]
    fn install_dir_comes_from_the_manifest() {
        let acf = "\"AppState\"\n{\n\t\"appid\"\t\t\"1422450\"\n\t\"installdir\"\t\t\"Deadlock\"\n}";
        assert_eq!(parse_install_dir(acf), Some("Deadlock".into()));
        assert_eq!(parse_install_dir("\"AppState\"\n{\n}"), None);
    }
}
