# dp-voice-bans

Finds and safely rewrites the game's mute list, `voice_ban.dt`. It is ring 2 because it combines the Steam account lookup and the game process check with file rules specific to this file.

## Public API

- `current_path()` returns the mute list path for the signed-in Steam account, or an error text if there is no account or no userdata folder.
- `voice_ban_path(userdata_dir)` builds `<userdata>/1422450/remote/voice_ban.dt`.
- `looks_like_voice_ban(bytes)` is true for valid UTF-8 text that contains `users`.
- `backup_then_write(path, bytes, timestamp)` copies the file to `<path>.backup-<timestamp>[-n]`, then overwrites it. It returns the backup path.
- `game_running_recent()` reports whether Deadlock runs, with a cached answer up to 5 seconds old.
- `VoiceBanFile` holds `path`, `exists`, `text` and `game_running`. It exports to `packages/ipc-types/src/VoiceBanFile.ts`.

## Dependencies

- `dp-atomic`, `dp-sync`, `dp-game` and `dp-steam`
- `serde`, `ts-rs`, `log`

No platform-specific code.

## Gotchas

- `backup_then_write` refuses to create a file. If `voice_ban.dt` does not exist, it returns an error and writes nothing.
- The original file is untouched unless the backup copy succeeded. The write itself goes through `dp_atomic::write_atomic`.
- Two writes in the same second do not overwrite the first backup. The function tries `-1`, `-2` and so on, up to 64 names, and then fails.
- `game_running_recent` exists for polling. A write must use an uncached check such as `dp_game::is_running`, so a stale answer cannot allow a write while the game holds the file.
- The cache lives in a static `Mutex` and uses `lock_or_recover` from `dp-sync`.

## Testing

```
cargo test -p dp-voice-bans
```

The tests write under the system temp folder. They do not need Steam or the game.
