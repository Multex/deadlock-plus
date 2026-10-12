mod discover;

use discover::{Env, Host, SteamRoot};
use serde::Serialize;
use std::path::{Path, PathBuf};
use ts_rs::TS;

const STEAM_ID_64_IDENT: u64 = 76561197960265728;
pub(crate) const DEADLOCK_APP_ID: u32 = 1422450;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoginUser {
    pub id64: u64,
    pub persona_name: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct SteamAccount {
    pub steam_id64: String,
    pub steam_id32: u32,
    pub persona_name: String,
    pub avatar_data_url: Option<String>,
    pub userdata_dir: Option<String>,
}

pub fn steam32(id64: u64) -> Option<u32> {
    u32::try_from(id64.checked_sub(STEAM_ID_64_IDENT)?).ok()
}

fn quoted(line: &str) -> Vec<&str> {
    line.split('"').skip(1).step_by(2).collect()
}

#[derive(Default)]
struct Block {
    id64: Option<u64>,
    name: String,
    most_recent: bool,
    timestamp: Option<u64>,
}

/// Older Steam builds flag the active account with `"MostRecent" "1"`; current ones drop
/// the key, so the account with the newest `Timestamp` (last login) is used instead. Steam
/// varies the key casing between builds (`Timestamp` / `timestamp`), so keys match case-insensitively.
pub fn parse_most_recent(vdf: &str) -> Option<LoginUser> {
    let mut blocks: Vec<Block> = Vec::new();
    for line in vdf.lines() {
        match quoted(line).as_slice() {
            [key] if key.len() > 10 && key.bytes().all(|b| b.is_ascii_digit()) => {
                blocks.push(Block { id64: key.parse().ok(), ..Block::default() });
            }
            [key, value] => {
                let Some(block) = blocks.last_mut() else {
                    continue;
                };
                match key.to_ascii_lowercase().as_str() {
                    "personaname" => block.name = (*value).to_string(),
                    "mostrecent" => block.most_recent = *value == "1",
                    "timestamp" => block.timestamp = value.parse().ok(),
                    _ => {}
                }
            }
            _ => {}
        }
    }
    let flagged = blocks.iter().position(|b| b.most_recent);
    let chosen = match flagged {
        Some(i) => &blocks[i],
        None => blocks.iter().filter(|b| b.timestamp.is_some()).max_by_key(|b| b.timestamp)?,
    };
    Some(LoginUser { id64: chosen.id64?, persona_name: chosen.name.clone() })
}

fn discovered_roots() -> Vec<SteamRoot> {
    discover::steam_roots(&Env::from_process(), Host::current())
}

/// Windows keeps using `steamlocate` (registry lookup). Elsewhere the Steam install may be native
/// or run under Wine, which `steamlocate` cannot see. The Steam account files live in one install,
/// so the first one that has a `loginusers.vdf` wins.
pub fn steam_root() -> Option<PathBuf> {
    if Host::current() == Host::Windows {
        return match steamlocate::SteamDir::locate() {
            Ok(dir) => Some(dir.path().to_path_buf()),
            Err(e) => {
                log::trace!("Steam install not found: {e}");
                None
            }
        };
    }
    let roots = discovered_roots();
    let chosen = roots.iter().find(|r| r.path.join("config").join("loginusers.vdf").is_file()).or(roots.first());
    if chosen.is_none() {
        log::trace!("Steam install not found");
    }
    chosen.map(|r| r.path.clone())
}

fn read_current_user(root: &Path) -> Option<LoginUser> {
    let vdf = match std::fs::read_to_string(root.join("config").join("loginusers.vdf")) {
        Ok(vdf) => vdf,
        Err(e) => {
            log::trace!("loginusers.vdf could not be read: {e}");
            return None;
        }
    };
    parse_most_recent(&vdf)
}

pub fn current_steam_id32() -> Option<u32> {
    steam32(read_current_user(&steam_root()?)?.id64)
}

pub fn userdata_dir(root: &Path, id32: u32) -> Option<PathBuf> {
    let dir = root.join("userdata").join(id32.to_string());
    dir.is_dir().then_some(dir)
}

fn avatar_path(steam_root: &Path, id64: u64) -> PathBuf {
    steam_root.join("config").join("avatarcache").join(format!("{id64}.png"))
}

fn avatar_data_url(root: &Path, id64: u64) -> Option<String> {
    use base64::Engine;
    let bytes = std::fs::read(avatar_path(root, id64)).ok()?;
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

pub fn game_install_dir() -> Option<PathBuf> {
    if Host::current() == Host::Windows {
        let steam = steamlocate::SteamDir::locate().ok()?;
        let (app, library) = steam.find_app(DEADLOCK_APP_ID).ok()??;
        return Some(library.resolve_app_dir(&app));
    }
    discovered_roots().iter().find_map(|root| discover::find_game_dir(root, DEADLOCK_APP_ID))
}

/// The `buildid` Steam records for the installed game, or `None` when it is not installed.
pub fn game_build_id() -> Option<u64> {
    build_id_of(&game_install_dir()?)
}

/// Build id for a game folder inside a Steam library (`<library>/steamapps/common/<game>`).
pub fn build_id_of(game_dir: &Path) -> Option<u64> {
    discover::installed_build_id(game_dir, DEADLOCK_APP_ID)
}

pub fn httpcache_dir() -> Option<PathBuf> {
    let dir = steam_root()?.join("appcache").join("httpcache");
    dir.is_dir().then_some(dir)
}

pub fn addons_dir(install: &Path) -> PathBuf {
    install.join("game").join("citadel").join("addons")
}

pub fn replays_dir(install: &Path) -> PathBuf {
    addons_dir(install).join("replays")
}

pub fn current_account() -> Option<SteamAccount> {
    let root = steam_root()?;
    let user = read_current_user(&root)?;
    let id32 = steam32(user.id64)?;
    Some(SteamAccount {
        steam_id64: user.id64.to_string(),
        steam_id32: id32,
        persona_name: user.persona_name,
        avatar_data_url: avatar_data_url(&root, user.id64),
        userdata_dir: userdata_dir(&root, id32).map(|p| p.to_string_lossy().into_owned()),
    })
}

pub fn parse_all_ids(vdf: &str) -> Vec<u64> {
    vdf.lines()
        .filter_map(|line| match quoted(line).as_slice() {
            [key] if key.len() > 10 && key.bytes().all(|b| b.is_ascii_digit()) => key.parse().ok(),
            _ => None,
        })
        .collect()
}

pub fn merge_ids(current: Option<u32>, login: &[u32], userdata: &[u32]) -> Vec<u32> {
    let mut out: Vec<u32> = Vec::new();
    for id in current.iter().chain(login).chain(userdata) {
        if !out.contains(id) {
            out.push(*id);
        }
    }
    out
}

/// Every account that has signed in on this PC, current one first.
pub fn local_account_ids() -> Vec<u32> {
    let Some(root) = steam_root() else {
        return Vec::new();
    };
    let current = read_current_user(&root).and_then(|u| steam32(u.id64));
    let login: Vec<u32> = std::fs::read_to_string(root.join("config").join("loginusers.vdf"))
        .map(|v| parse_all_ids(&v).into_iter().filter_map(steam32).collect())
        .unwrap_or_default();
    let userdata: Vec<u32> = std::fs::read_dir(root.join("userdata"))
        .map(|d| {
            d.filter_map(Result::ok)
                .filter_map(|e| e.file_name().to_str()?.parse::<u32>().ok())
                .filter(|id| *id != 0)
                .collect()
        })
        .unwrap_or_default();
    merge_ids(current, &login, &userdata)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replays_live_under_the_citadel_addons_folder() {
        let install = Path::new("games").join("Deadlock");
        assert_eq!(replays_dir(&install), install.join("game").join("citadel").join("addons").join("replays"));
    }

    const VDF: &str = "\"users\"\n{\n\t\"76561198000000001\"\n\t{\n\t\t\"AccountName\"\t\t\"a\"\n\t\t\"PersonaName\"\t\t\"Alpha\"\n\t\t\"MostRecent\"\t\t\"0\"\n\t}\n\t\"76561198000000002\"\n\t{\n\t\t\"AccountName\"\t\t\"b\"\n\t\t\"PersonaName\"\t\t\"Bravo\"\n\t\t\"MostRecent\"\t\t\"1\"\n\t}\n}";

    #[test]
    fn picks_the_most_recent_account_with_its_name() {
        let user = parse_most_recent(VDF).unwrap();
        assert_eq!(user, LoginUser { id64: 76561198000000002, persona_name: "Bravo".into() });
    }

    #[test]
    fn name_comes_from_the_active_block_not_an_earlier_one() {
        let user = parse_most_recent(&VDF.replace("Alpha", "Zed")).unwrap();
        assert_eq!(user.persona_name, "Bravo");
    }

    #[test]
    fn persona_name_may_follow_most_recent() {
        let vdf = "\"users\"\n{\n\t\"76561198000000002\"\n\t{\n\t\t\"MostRecent\"\t\t\"1\"\n\t\t\"PersonaName\"\t\t\"Late\"\n\t}\n}";
        assert_eq!(parse_most_recent(vdf).unwrap().persona_name, "Late");
    }

    #[test]
    fn lowercase_timestamp_key_picks_the_newest_login() {
        let vdf = "\"users\"\n{\n\t\"76561198000000001\"\n\t{\n\t\t\"PersonaName\"\t\t\"Old\"\n\t\t\"timestamp\"\t\t\"1754102298\"\n\t}\n\t\"76561198000000002\"\n\t{\n\t\t\"PersonaName\"\t\t\"New\"\n\t\t\"timestamp\"\t\t\"1791246031\"\n\t}\n}";
        let user = parse_most_recent(vdf).unwrap();
        assert_eq!(user, LoginUser { id64: 76561198000000002, persona_name: "New".into() });
    }

    #[test]
    fn none_when_no_account_is_active() {
        let inactive = VDF.replace("\"MostRecent\"\t\t\"1\"", "\"MostRecent\"\t\t\"0\"");
        assert_eq!(parse_most_recent(&inactive), None);
    }

    #[test]
    fn lists_every_account_in_loginusers() {
        assert_eq!(parse_all_ids(VDF), vec![76561198000000001, 76561198000000002]);
        assert_eq!(parse_all_ids(""), Vec::<u64>::new());
    }

    #[test]
    fn merged_ids_start_with_the_current_account_and_have_no_duplicates() {
        assert_eq!(merge_ids(Some(3), &[1, 2, 3], &[2, 4]), vec![3, 1, 2, 4]);
        assert_eq!(merge_ids(None, &[1], &[1, 5]), vec![1, 5]);
        assert_eq!(merge_ids(None, &[], &[]), Vec::<u32>::new());
    }

    #[test]
    fn converts_id64_to_id32() {
        assert_eq!(steam32(76561197960265728 + 12345), Some(12345));
        assert_eq!(steam32(5), None);
    }

    #[test]
    fn avatar_lives_in_the_config_avatarcache() {
        let p = avatar_path(Path::new("S"), 76561198000000002);
        assert_eq!(p, Path::new("S").join("config").join("avatarcache").join("76561198000000002.png"));
    }

    #[test]
    fn falls_back_to_the_newest_timestamp_when_most_recent_is_absent() {
        let vdf = "\"users\"
{
	\"76561198000000001\"
	{
		\"PersonaName\"		\"Old\"
		\"Timestamp\"		\"100\"
	}
	\"76561198000000002\"
	{
		\"PersonaName\"		\"New\"
		\"Timestamp\"		\"900\"
	}
	\"76561198000000003\"
	{
		\"PersonaName\"		\"Mid\"
		\"Timestamp\"		\"500\"
	}
}";
        let user = parse_most_recent(vdf).unwrap();
        assert_eq!(user, LoginUser { id64: 76561198000000002, persona_name: "New".into() });
    }

    #[test]
    fn most_recent_flag_wins_over_a_newer_timestamp() {
        let vdf = VDF.replace("\"AccountName\"		\"a\"", "\"Timestamp\"		\"999\"");
        assert_eq!(parse_most_recent(&vdf).unwrap().id64, 76561198000000002);
    }

    #[test]
    fn none_when_the_file_has_no_accounts() {
        assert_eq!(
            parse_most_recent(
                "\"users\"
{
}"
            ),
            None
        );
    }
}
