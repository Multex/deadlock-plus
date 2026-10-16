# dp-game

Detects whether Deadlock is running and, on Windows, whether its window is in front. It is ring 1 because it reads the OS process list and windows.

## Public API

- `PROCESS_NAME` is `"deadlock.exe"`.
- `is_process(name)` compares an `OsStr` with `PROCESS_NAME`, ignoring ASCII case.
- `MAX_AGE` is the shared process scan's maximum age (two seconds).
- `is_running()` returns whether any process matches the game.
- `start_time()` returns the oldest matching game's start time in Unix seconds, or `None`.
- `find_pid(matches)` returns the first matching process's PID, or zero.
- `focus::FocusWatcher::start(on_change) -> io::Result<FocusWatcher>` spawns a thread that tracks the game window; `state()` reads the latest `FocusState`, `stop()` ends the thread (also on drop). `on_change` runs on that thread after every change.
- `focus::FocusState { focus, game_rect, monitor_rect }`: `GameFocus::{Closed, Background, Focused}`, the game window's client area and the foreground window's monitor, both as `ScreenRect { x, y, width, height }` in physical pixels.

## Dependencies

- `sysinfo`
- `windows` (Windows only): foreground hook, window enumeration and monitor lookup.
- No workspace crates.

`sysinfo` reads the process list on every host. On Linux, the scan also reads the first command-line argument and excludes secondary threads.

## Gotchas

- Windows matches the exact process name `deadlock.exe`, ignoring ASCII case.
- On Linux, a process may also match by the basename of `argv[0]`, with either `/` or `\` as a separator. This covers Proton processes named `MainThrd` without accepting launchers that mention the game only in later arguments.
- `find_pid` applies its predicate to the process name and, on Linux, the `argv[0]` basename.
- Every query shares a scan cached for at most `MAX_AGE`. The first query scans immediately; the next query after expiry refreshes it.
- Only `argv[0]` is retained in the Linux cache; the rest of the command line is discarded.
- The focus watcher counts Deadlock+'s own windows as not the game: bringing the app forward reads `Background`.
- Off Windows the watcher starts no thread and always reads `Closed`; use `is_running()` for the process.
- The game window is the largest visible, unowned window of the game's PID. Its rect is empty while minimized.
- A foreground change triggers a refresh at once; a 1 s timer catches the game starting, exiting or moving. While the game is closed a refresh reads no windows.

## Testing

```
cargo test -p dp-game
```

Tests cover name matching, Proton paths, rejected launchers, PID and start-time queries, cache expiry, and focus transitions driven by a fake desktop. On Windows one test starts and stops the real watcher thread. Linux tests also scan temporary child processes and check that secondary threads are excluded; they do not launch the game.
