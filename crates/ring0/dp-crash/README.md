# dp-crash

Crash marker files, the session sentinel, the crash report text and the pre-filled issue link. It is ring 0 because it is std, serde and string code with no platform or Tauri types.

## Public API

- `CrashContext { dir, version, os, dev }` says where markers go and which build is running. `dev` is true only for `tauri dev` builds.
- `write_marker(ctx, kind, message, backtrace, timestamp_ms)` writes `<dir>/<timestamp>-<kind>.json` and returns its id. `record_panic(ctx, message, backtrace)` is the panic-hook form.
- `list_markers(dir)`, `pending(dir)`, `read_marker(dir, id)` read markers, newest first.
- `begin_session(ctx, previous_log)` runs once per launch and `end_session(dir)` on a clean exit.
- `dismiss_all(dir)` deletes every marker and report file. `prune(dir, keep)` keeps the newest markers; `KEEP_MARKERS` is 10.
- `write_bundle(dir, id, current_log)` writes `deadlock-plus-crash-<id>.txt` and returns its path. `build_bundle(marker, current_log)` builds the text.
- `issue_url(marker, bundle_file_name)` builds the GitHub link for `deadlock-plus/deadlock-plus`.
- `redact_user_paths`, `redact_secrets`, `redact` mask user names in paths and token values.
- `CrashReport` is the summary the web view gets. It is exported to TypeScript with `CrashKind`.

## Dependencies

- `serde`, `serde_json`, `ts-rs`

No platform-specific code.

## Gotchas

- `write_marker` and `record_panic` use plain `std::fs` and take no locks or shared state, so a panic hook can call them.
- A sentinel left by the last run becomes an `unclean-exit` marker, unless a marker written since that run started already explains it or the sentinel came from another version. The Windows updater ends the old process without a clean exit, and the version check keeps that from looking like a crash.
- With `dev` set no `unclean-exit` marker is written, because `tauri dev` kills the app on every rebuild. Panic markers are still written, so a dev panic still shows the dialog. A native crash in a dev build does not.
- A marker gets the tail of the previous run's log at the next `begin_session`, because the log files roll at startup. A marker created in the current run has no log yet, and `build_bundle` falls back to `current_log`.
- Marker ids are validated (`[a-z0-9-]`) before any path is built, so a web view argument cannot leave the folder.
- The bundle keeps the last 500 log lines. The whole text goes through `redact`, which masks values after `token`, `bearer`, `secret`, `password` and `api_key`. It does not know other secret shapes.
- `/home/<name>/` is masked only when `/home/` starts a path, so URLs like `example.com/home/page` are left alone.

## Testing

```
cargo test -p dp-crash
```
