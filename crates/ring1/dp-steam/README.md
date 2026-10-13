# dp-steam

Finds the Steam install, the signed-in account and the Deadlock folders. It is ring 1 because it reads Steam files from the host.

## Public API

- `SteamAccount` holds `steam_id64`, `steam_id32`, `persona_name`, `avatar_data_url` and `userdata_dir`. It serialises as camelCase and exports to `packages/ipc-types/src/SteamAccount.ts`.
- `current_account()` returns the most recent Steam login as a `SteamAccount`.
- `current_steam_id32()` returns only the 32-bit id of that account.
- `local_account_ids()` lists every 32-bit id found in `loginusers.vdf` and in `userdata/`, current account first, without duplicates.
- `steam_root()` returns the Steam folder that holds `loginusers.vdf`.
- `game_install_dir()` returns the Deadlock install folder (Steam app id 1422450).
- `addons_dir(install)` and `replays_dir(install)` build `game/citadel/addons` and `game/citadel/addons/replays` under an install folder.
- `userdata_dir(root, id32)` returns `<root>/userdata/<id32>` if it exists.
- `steam32(id64)` converts a 64-bit id to 32 bits, or `None` if it is out of range.
- `parse_most_recent(vdf)`, `parse_all_ids(vdf)` and `merge_ids(current, login, userdata)` are the pure parsing steps. `LoginUser` is their result type.

## Dependencies

- `steamlocate`, `base64`, `serde`, `ts-rs`, `log`
- No workspace crates.

No platform-specific code. `steamlocate` finds Steam on each OS. Every function returns `None` or an empty list when Steam is not found.

## Gotchas

- `parse_most_recent` prefers the account flagged `"MostRecent" "1"`. Current Steam builds drop that key, so it falls back to the entry with the highest `Timestamp`. If neither exists, it returns `None`.
- The VDF parser is line based. It reads quoted keys and values and does not handle nested blocks or multi-line values.
- The avatar comes from `config/avatarcache/<id64>.png` and is inlined as a base64 data URL. It is `None` when the file is missing.

## Testing

```
cargo test -p dp-steam
```

The tests use sample VDF text. They do not need Steam installed.
