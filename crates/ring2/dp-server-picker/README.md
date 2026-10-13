# dp-server-picker

Fetches Valve's Steam Datagram Relay (SDR) server groups, pings them, validates block requests, keeps the firewall blocks current and imports blocks from other server pickers. It is ring 2 because it combines the firewall and ICMP crates with Valve's relay data.

## Public API

`definitions` module:

- `load_definitions()` returns the games in `resources/games.json`, compiled into the binary. `find_definition(game_id)` returns one.
- `GameDefinition` holds the app id, the keyword filter and the routing notes. `KeywordFilterMode` and `RoutingNoteDefinition` support it.

`sdr` module:

- `fetch_server_data(client, def)` reads Valve's `GetSDRConfig` endpoint and returns `ServerData` with `unclustered` and `clustered` lists of `ServerGroup`. It returns `SdrError` on a failed request or when no usable pop exists.
- `RoutingNoteInfo` is a routing note attached to a group.

`ping` module:

- `ping_group(ips)` returns the lowest round-trip time in whole milliseconds, or `None` if no relay replied.

`validate` module:

- `validate_group_id(id)` and `validate_block_request(id, description, relay_ips)` return `Result<(), String>`.

`sync` module:

- `sync_blocks(lock, http)` refetches relays for every game and calls `dp_firewall::refresh_stale_groups`. It returns a `SyncOutcome` with `updated` and `failed` region descriptions.

`external` module:

- `scan(data, def)` looks for block rules made by ServerPickerX and CS2ServerPicker and returns a `ScanResult`.
- `import(data, scan)` recreates the covered groups as Deadlock+ rules and returns their group ids.

TypeScript types exported to `packages/ipc-types/src`: `KeywordFilterMode`, `RoutingNoteDefinition`, `GameDefinition`, `RoutingNoteInfo`, `ServerGroup`, `ServerData` and `SyncOutcome`.

## Dependencies

- `dp-firewall` and `dp-icmp`
- `reqwest` with rustls, `tokio`, `serde`, `serde_json`, `thiserror`, `ts-rs`, `log`

No platform-specific code. The firewall and ping backends differ by OS, and this crate inherits that.

## Gotchas

- `validate_block_request` limits ids to 48 characters of `[A-Za-z0-9_.-]`, descriptions to 200 bytes without control characters, and lists to 1 through 256 addresses. It refuses unspecified, loopback, private, link-local, multicast and broadcast addresses, and IPv6 unique-local addresses, because a block on those would cut the machine off its own network. It cannot tell a public address that is not a relay.
- `sync_blocks` drops any group that fails validation and never adds a block. A skipped group keeps its existing rule. The caller passes the `tokio::sync::Mutex` so the picker opening and a timer cannot run two syncs at once.
- `ping_group` samples the first 3 relays of a group and retries with timeouts of 1, 2, 3 and 4 seconds, only for groups with no reply. A semaphore allows 24 groups at a time.
- `import` removes an external rule only if every IP it blocks is covered by a group Deadlock+ now blocks, so nothing is lifted by accident.
- `load_definitions` panics if `resources/games.json` does not match `GameDefinition`.

## Testing

```
cargo test -p dp-server-picker
```

The tests make no real network calls. The `sync_blocks` tests use a client pointed at a dead local proxy.
