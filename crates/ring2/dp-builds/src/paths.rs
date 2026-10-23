use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use dp_sync::LockExt;

const DEADLOCK_APP_ID: &str = "1422450";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Target {
    pub account_id32: u32,
    pub path: PathBuf,
}

#[derive(Debug, PartialEq, Eq)]
pub enum PathError {
    NoAccount,
    NoUserdata,
}

impl std::fmt::Display for PathError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::NoAccount => "No Steam account found.",
            Self::NoUserdata => "This account has no Steam userdata folder.",
        })
    }
}

impl std::error::Error for PathError {}

pub fn builds_path(userdata_dir: &Path) -> PathBuf {
    userdata_dir.join(DEADLOCK_APP_ID).join("remote").join("cfg").join("cached_hero_builds.kv3")
}

pub fn current_target() -> Result<Target, PathError> {
    let account = dp_steam::current_account().ok_or(PathError::NoAccount)?;
    let dir = account.userdata_dir.ok_or(PathError::NoUserdata)?;
    Ok(Target { account_id32: account.steam_id32, path: builds_path(Path::new(&dir)) })
}

static LAST_CHECK: Mutex<Option<(Instant, bool)>> = Mutex::new(None);

fn cached_check(
    slot: &Mutex<Option<(Instant, bool)>>,
    now: Instant,
    max_age: Duration,
    probe: impl FnOnce() -> bool,
) -> bool {
    let mut last = slot.lock_or_recover();
    match *last {
        Some((at, value)) if now.saturating_duration_since(at) < max_age => value,
        _ => {
            let value = probe();
            *last = Some((now, value));
            value
        }
    }
}

/// The page polls for the lock state, and a full process scan per poll is wasteful. A write uses
/// `game_running_now`, so a stale answer can never let one through.
pub fn game_running_recent() -> bool {
    cached_check(&LAST_CHECK, Instant::now(), Duration::from_secs(5), dp_game::is_running)
}

pub fn game_running_now() -> bool {
    dp_game::is_running()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_recent_answer_is_reused_and_an_old_one_is_probed_again() {
        let slot = Mutex::new(None);
        let t0 = Instant::now();
        let age = Duration::from_secs(5);
        assert!(cached_check(&slot, t0, age, || true));
        assert!(cached_check(&slot, t0 + Duration::from_secs(4), age, || panic!("probed within the window")));
        assert!(!cached_check(&slot, t0 + Duration::from_secs(6), age, || false));
    }

    #[test]
    fn builds_path_is_the_cached_hero_builds_file_under_remote_cfg() {
        let p = builds_path(Path::new("U"));
        assert_eq!(p, Path::new("U").join("1422450").join("remote").join("cfg").join("cached_hero_builds.kv3"));
    }

    #[test]
    fn path_errors_read_as_sentences() {
        assert_eq!(PathError::NoAccount.to_string(), "No Steam account found.");
        assert_eq!(PathError::NoUserdata.to_string(), "This account has no Steam userdata folder.");
    }
}
