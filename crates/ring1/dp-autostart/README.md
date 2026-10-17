# dp-autostart

Starts Deadlock+ at login on Linux. It is ring 1 because it writes to the OS's login-item locations. Windows autostart (Task Scheduler) stays in the app crate.

## Public API

- `state() -> Result<State, String>`, `enable()`, `disable()` exist on non-Windows targets only. `State` is `{ enabled, stale }`.
- `stale` means the entry launches a different exe than the one to launch now.
- `LAUNCH_ARG` is `--autostart`.
- `desktop_entry` renders and parses the Linux entry file. It compiles on every host.
- `run_key` is the pure half of Windows Run-key autostart. It compiles on every host and does no registry I/O:
  - `VALUE_NAME`, `RUN_KEY`, `APPROVED_KEY` name the value and the two `HKCU` key paths.
  - `render(exe)` gives the value data, `"<exe>" --autostart`. `parse_exe(data)` reads the exe back, quoted or unquoted.
  - `approved(bytes)` reads the `StartupApproved` bytes: low bit of the first byte set means disabled, none or empty means enabled. `APPROVED_ENABLED` is the 12-byte enabled value.
  - `state(run_data, approved_bytes, target_exe)` combines them. Disabled in Task Manager reads as `enabled: false, stale: false`.
- `launch_exe`, `read_state`, `write_entry`, `remove_entry` are the file-level building blocks.

## Dependencies

- No external crates.
- No workspace crates.

## Platform behaviour

- Linux writes `$XDG_CONFIG_HOME/autostart/deadlock-plus.desktop`. A relative or empty `$XDG_CONFIG_HOME` is ignored and `~/.config` is used.
- It launches the exe with `--autostart`. When `$APPIMAGE` is set, that image file is the exe.
- Disabling deletes the file. A missing file is not an error.

## Gotchas

- The `Exec` value is escaped twice: reserved characters inside the quotes, then the desktop-file string escape. `%` becomes `%%`.
- Nothing here has run on a real Linux desktop. The file format follows the XDG Desktop Entry documentation.

## Testing

```
cargo test -p dp-autostart
```

The tests render and parse both file formats and use temp directories for the file operations.
