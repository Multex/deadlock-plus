# dp-storage

Measures and clears the files Deadlock and Deadlock+ keep on disk, grouped into named entries. It is ring 2 because it holds domain knowledge about which files belong to the game, to Steam and to the app. It reads paths only and calls no other workspace crate.

## Public API

- `EntryId` names one entry, such as `Replays`, `ShaderCache`, `VoiceBanBackups` or `Logs`. `ALL_ENTRIES` lists all 21 in order.
- `Roots` holds the four folders the caller passes in: `install`, `userdata`, `app_data` and `logs`. Each is optional.
- `entry_size(id, roots)` returns the size in bytes.
- `entry_stats(id, roots)` returns `EntryStats` with `bytes`, `count` and `oldest_secs`.
- `location(id, roots)` returns the folder to reveal for an entry.
- `is_clearable(id)` says whether `clear` accepts the entry.
- `clear(id, roots)` deletes the entry's files and returns a `ClearReport` with `freed_bytes`, `removed` and `failed`.
- `is_our_backup(name)` matches `<name>.backup-<unix seconds>[-<n>]`.
- `within(root, path)` checks that a path sits strictly under a root with no `..` segment.
- `dir_size(path, skip_top_level)` sums file sizes under a path.
- `EntryInfo` carries an entry id, its path and whether it is clearable.

TypeScript types exported to `packages/ipc-types/src`: `EntryId`, `EntryStats`, `ClearReport` and `EntryInfo`.

## Dependencies

- `serde`, `ts-rs`, `log`
- No workspace crates.

No platform-specific code. The tests use `cfg(windows)` and `cfg(unix)` to create symlinks.

## Gotchas

- Only shader cache, `console.log`, voice ban backups and rolled logs are clearable. Addons, `gameinfo.gi*` files and the app's own settings are never offered.
- `clear` filters its target list before deleting. It drops symlinks and any path that is not inside one of the four roots.
- `dir_size` counts a symlink or junction as zero and does not enter it. The game's `replays` link would otherwise count twice, and a link can point outside the measured folder.
- Clearing the shader cache removes its contents and keeps the folder. Clearing `Logs` removes only `*.log.gz` archives, because the active log files stay open.
- Any file in the app data folder that no entry lists counts as `OtherAppFiles`, so a new file shows up in the totals without a code change. To give a file its own entry, add it to `APP_FILES`.
- `is_our_backup` requires a non-empty name and a numeric suffix, so a user's own `voice_ban.dt.backup-old` is left alone.

## Testing

```
cargo test -p dp-storage
```

The tests build a fake install, account and app data folder under the system temp folder.
