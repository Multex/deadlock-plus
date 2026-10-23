# Crates

## Ring 0, primitives

- [dp-sync](ring0/dp-sync/README.md): Locks that recover from poisoning.
- [dp-text](ring0/dp-text/README.md): HTML stripping and entity decoding for feed text.
- [dp-atomic](ring0/dp-atomic/README.md): Crash-safe file writes.
- [dp-versioned](ring0/dp-versioned/README.md): JSON files with a schema version and migrations.
- [dp-export](ring0/dp-export/README.md): Validation and writing for user exports.
- [dp-kv](ring0/dp-kv/README.md): A key-value store over a fixed list of JSON files.
- [dp-frames-wire](ring0/dp-frames-wire/README.md): The frame file format, a lock-free ring and XDG paths shared by the Vulkan layer and the app.
- [dp-crash](ring0/dp-crash/README.md): Crash markers, the session sentinel, crash reports and the issue link.
- [dp-privilege](ring0/dp-privilege/README.md): Outcomes and rules for asking for administrator rights (pkexec, UAC).

## Ring 1, platform

- [dp-game](ring1/dp-game/README.md): Detects the Deadlock process.
- [dp-icmp](ring1/dp-icmp/README.md): One ICMP echo with a round-trip time.
- [dp-connection](ring1/dp-connection/README.md): UDP packet events, through ETW or a root capture helper.
- [dp-elevation](ring1/dp-elevation/README.md): Checks for administrator rights.
- [dp-firewall](ring1/dp-firewall/README.md): Blocks relay addresses with Windows Firewall, nftables or pf.
- [dp-steam](ring1/dp-steam/README.md): Finds Steam, the signed-in account and the Deadlock folders.
- [dp-frames](ring1/dp-frames/README.md): Frame time capture through ETW or a Vulkan layer, with statistics and spike detection.
- [dp-frames-layer](ring1/dp-frames-layer/README.md): The Vulkan layer that records present times on Linux.

## Ring 2, domain

- [dp-storage](ring2/dp-storage/README.md): Sizes and clears the files the game and app keep.
- [dp-builds](ring2/dp-builds/README.md): Reads and writes the game's local hero build file.
- [dp-voice-bans](ring2/dp-voice-bans/README.md): Backs up and rewrites the mute list.
- [dp-demos](ring2/dp-demos/README.md): Lists, pins, cleans up and deletes replays.
- [dp-server-picker](ring2/dp-server-picker/README.md): Relay groups, pings, block validation and block sync.
- [dp-alerts](ring2/dp-alerts/README.md): The update feed and its stored alert list.
- [dp-network](ring2/dp-network/README.md): The live connection monitor.
- [dp-gc](ring2/dp-gc/README.md): Match salt recovery through the Steam Game Coordinator.
- [dp-ingest](ring2/dp-ingest/README.md): Replay URLs from Steam's cache, parsed into match salts.
- [dp-patch-notes](ring2/dp-patch-notes/README.md): Offline patch note search with a bundled embedding model.
- [dp-diagnostics](ring2/dp-diagnostics/README.md): Static scan of addon VPK files for scripts that leave timers running.
- [dp-helper](ring2/dp-helper/README.md): The privileged server for firewall writes and ETW on Windows, as a UAC helper or an on-demand service.

The app in `apps/desktop/src-tauri` is ring 3. It is the only place that knows Tauri.

## Dependency rule

A crate may depend only on crates in a lower ring. The allowed same-ring edges are `dp-versioned` to `dp-atomic`, `dp-kv` to `dp-versioned`, `dp-export` to `dp-atomic` and `dp-helper` to `dp-server-picker` (the helper checks every address against Valve's relay list itself). Each `Cargo.toml` declares its ring in `[package.metadata.dp]`, and the number must match the folder. `pnpm tiers:check` enforces this, including the ban on `tauri` outside ring 3, and it fails on an allowlist entry whose edge no longer exists. The allowlist sits at the top of `scripts/tiers.mjs`, and `CONTRIBUTING.md` describes the rule under "Crate tiers".
