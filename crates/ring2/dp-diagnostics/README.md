# dp-diagnostics

Static scan of installed addon VPK files for Panorama scripts that can leave timers running. It lists the addons, reads each VPK, pulls out the JavaScript and reports findings. It is ring 2 because it joins Steam path discovery to the game's addon format. It does not depend on Tauri. The app supplies progress and pause handling through the `ScanObserver` trait.

## Public API

- `scan::scan_all(dir, observer)` scans every addon in `dir` and returns a `Flow`. It calls `observer.checkpoint()` before each addon.
- `scan::ScanObserver` is the seam to the app. Its methods are `listed`, `progress`, `checkpoint`, `scanned` and `failed`. `checkpoint` may block to pause the scan and returns `Flow::Cancelled` to stop it.
- `scan::Flow` is `Continue` or `Cancelled`.
- `scan::list_addons_from(dir)` returns an `AddonListing`.
- `scan::scan_addon_in(dir, file_name)` scans one addon and returns an `AddonScan`.
- `addons::addons_dir()` finds the Deadlock addons folder through `dp-steam`. It returns `None` when the folder does not exist.
- `addons::list_addons_in`, `addons::resolve_addon`, `addons::parse_dmm` and `addons::label` list addons and name them from the Mod Manager file `.dmm.json`.
- `scripts::scan_vpk(path)` scans one `*_dir.vpk`. `scripts::extract_source` pulls the script source and `SearchPath` out of a compiled `.vjs_c` or `.vts_c` resource.
- `rules::scan(source)` runs the rules on one script and returns `Finding` values. The rules are `NulledNotCancelled` and `UnguardedRearm`. Severity is `Low`, `Medium` or `High`.
- `js` holds the helpers the rules use: `strip`, `functions`, `matching`, `line_of` and `line_text`.
- `vpk` is a VPK v2 reader and writer. It has `Vpk::prefix_len`, `Vpk::parse`, `Vpk::embedded_range`, `Vpk::read`, `write`, `crc32` and `VpkError`.

TypeScript types exported to `packages/ipc-types/src`: `AddonInfo`, `AddonListing`, `ScriptReport`, `AddonScan`, `AddonFailure`, `AddonScanReport`, `Finding`, `Rule` and `Severity`.

## Dependencies

- `dp-steam`
- `flate2` (for the CRC32 in `vpk`), `regex`, `serde`, `serde_json`, `thiserror`, `ts-rs`, `log`

## Platform behaviour

The code is the same on every platform. Finding the addons folder depends on `dp-steam` locating the Deadlock install. With no folder, `scan_all` reports an empty listing and scans nothing.

## Gotchas

- Findings are hints. A finding marks a place worth reading and is not proof that a script misbehaves.
- The `vpk` module reads and writes version 2 only. Other versions return `VpkError::UnsupportedVersion`. The writer produces one self-contained file with no MD5 or signature sections. The app tests use it to build fixtures.
- `scan_vpk` reads only the header and directory tree, then only the `.vjs_c` and `.vts_c` entries. Entries in numbered archives (`name_000.vpk`) are read from beside the dir file. Entries whose archive is missing are skipped.
- `search_path` is best effort. The resource header is compressed, so the key is not always readable.
- `list_addons_in` returns `*_dir.vpk` files in filename order, which is the game's load order.
- `resolve_addon` rejects names with a path separator or a parent reference, because the name comes from the frontend.
- A failed addon calls `failed` and the scan continues with the next one.

## Testing

```
cargo test -p dp-diagnostics
```

The tests build VPK files and compiled script resources in memory and in temporary folders. They need no game install.
