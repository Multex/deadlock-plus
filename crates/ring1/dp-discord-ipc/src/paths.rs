use std::path::PathBuf;

pub(crate) const MAX_PIPES: u8 = 10;

/// The index in a `discord-ipc-N` endpoint name, for the indexes Discord uses.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn pipe_index(name: &str) -> Option<u8> {
    let digits = name.strip_prefix("discord-ipc-")?;
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok().filter(|i| *i < MAX_PIPES)
}

#[cfg_attr(windows, allow(dead_code))]
const SANDBOX_SUBDIRS: [&str; 7] = [
    ".flatpak/dev.vencord.Vesktop/xdg-run",
    "app/com.discordapp.Discord",
    "app/com.discordapp.DiscordPTB",
    "app/com.discordapp.DiscordCanary",
    "snap.discord",
    "snap.discord-ptb",
    "snap.discord-canary",
];

/// Directories that can hold `discord-ipc-N` sockets, most specific first and without duplicates.
/// Flatpak and Snap Discord put the socket in a sandbox subdirectory of the runtime dir.
#[cfg_attr(windows, allow(dead_code))]
pub(crate) fn socket_dirs(xdg_runtime: Option<&str>, tmpdir: Option<&str>) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    let mut push = |p: PathBuf| {
        if !out.contains(&p) {
            out.push(p);
        }
    };
    let non_empty = |v: Option<&str>| v.filter(|s| !s.is_empty()).map(PathBuf::from);
    let xdg = non_empty(xdg_runtime);
    let tmp = non_empty(tmpdir);
    for base in [xdg.clone(), tmp.clone(), Some(PathBuf::from("/tmp"))].into_iter().flatten() {
        push(base);
    }
    for base in [xdg, tmp].into_iter().flatten() {
        for sub in SANDBOX_SUBDIRS {
            push(base.join(sub));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pipe_names_give_their_index() {
        assert_eq!(pipe_index("discord-ipc-0"), Some(0));
        assert_eq!(pipe_index("discord-ipc-9"), Some(9));
        assert_eq!(pipe_index("discord-ipc-10"), None);
        assert_eq!(pipe_index("discord-ipc-"), None);
        assert_eq!(pipe_index("discord-ipc-+1"), None);
        assert_eq!(pipe_index("discord-ipc-1x"), None);
        assert_eq!(pipe_index("mojo.1234.discord-ipc-0"), None);
        assert_eq!(pipe_index("Discord-IPC-0"), None);
    }

    #[test]
    fn plain_dirs_come_first_then_sandbox_subpaths() {
        let d = socket_dirs(Some("/run/user/1000"), Some("/var/tmp"));
        assert_eq!(d[..3], [PathBuf::from("/run/user/1000"), PathBuf::from("/var/tmp"), PathBuf::from("/tmp")]);
        assert!(d.contains(&PathBuf::from("/run/user/1000").join("app/com.discordapp.Discord")));
        assert!(d.contains(&PathBuf::from("/run/user/1000").join("snap.discord")));
    }

    #[test]
    fn vesktop_flatpak_and_other_clients_are_candidates() {
        let d = socket_dirs(Some("/run/user/1000"), None);
        let base = PathBuf::from("/run/user/1000");
        for sub in [
            ".flatpak/dev.vencord.Vesktop/xdg-run",
            "app/com.discordapp.DiscordPTB",
            "app/com.discordapp.DiscordCanary",
            "snap.discord-ptb",
            "snap.discord-canary",
        ] {
            assert!(d.contains(&base.join(sub)), "missing {sub}");
        }
    }

    #[test]
    fn unset_and_empty_vars_fall_back_to_tmp() {
        assert_eq!(socket_dirs(None, Some("")), vec![PathBuf::from("/tmp")]);
    }

    #[test]
    fn duplicates_are_removed() {
        let d = socket_dirs(Some("/tmp"), Some("/tmp"));
        assert_eq!(d.iter().filter(|p| p.as_path() == std::path::Path::new("/tmp")).count(), 1);
    }
}
