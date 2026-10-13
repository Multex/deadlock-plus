# dp-network

Live connection monitor. It finds the game's UDP flow to a Steam relay, pings the relay once a second, and keeps a short latency history. It is ring 2 because it joins the packet source, the ICMP pinger and the game process check into one feature.

## Public API

- `NetworkMonitor` is the handle. Build one with `NetworkMonitor::default()`.
- `NetworkMonitor::start(runtime, relays, history_path, prompt)` starts the monitor threads and a relay loader task on the given tokio runtime handle.
- `NetworkMonitor::stop()` stops them.
- `NetworkMonitor::snapshot()` returns the current `Snapshot`.
- `NetworkMonitor::history()` returns the in-memory `HistoryPoint` list.
- `RelaySource` is an async function that returns a `RelayMap`, a map from relay IPv4 address to `PopInfo`.
- `PopInfo` holds `code`, `description` and `country_code`.

TypeScript types exported to `packages/ipc-types/src`: `NetworkSnapshot` (the Rust `Snapshot`), `PingStats`, `RelayInfo` and `HistoryPoint`.

## Dependencies

- `dp-connection`, `dp-icmp`, `dp-game`, `dp-atomic` and `dp-sync`
- `tokio`, `serde`, `serde_json`, `ts-rs`, `log`

## Platform behaviour

The monitor reads packets through `dp-connection`, so it needs the same rights. On Windows the process must be elevated. On Linux a root helper starts after a password prompt.

- With `prompt` false and no rights yet, the snapshot sets `needs_permission` and captures nothing.
- Calling `start` again restarts the source when it failed (`trace_error` is set), or when permission was missing and `prompt` is now true. Any other second `start` call while running does nothing.
- On platforms with no source, the snapshot carries a `trace_error`.

## Gotchas

- The relay map reloads every hour, and every 30 seconds after a failure. Until it loads, relay info has no pop code or description. On Linux the helper reports only packets to addresses in this map, so nothing is detected before it loads.
- Windows packets carry a process id, so the monitor matches the game by process. Unix packets carry none, so any packet to a relay counts as the game's, and only while the game runs.
- A flow counts as the game's relay only at 15 packets per second or more, and the busiest one wins.
- Ping stats use the last 60 samples. Jitter is the mean gap between consecutive successful samples. Lost samples are skipped.
- History is written to `history_path` as one JSON line per point. A crash can damage only the last line, and the loader skips it. The file is trimmed to the newest 20,000 points on open and again when it reaches twice that size. If the file cannot be opened, the monitor runs without saving and history resets on restart.
- The in-memory history holds 900 points.

## Testing

```
cargo test -p dp-network
```

The tests cover statistics, flow selection and the history file. They open no capture source and send no packets.
