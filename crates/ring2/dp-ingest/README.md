# dp-ingest

Finds Deadlock replay download URLs in Steam's HTTP cache and turns them into match salts. It is ring 2 because it encodes Valve's replay URL format and the Steam cache layout. It depends on no other workspace crate.

## Public API

`salts` module:

- `Salts` holds `match_id`, `cluster_id`, `metadata_salt`, `replay_salt` and an optional `username`. It derives `Serialize` only.
- `Salts::from_url(url, steam_id3)` parses `http://replay<cluster>.valve.net/<app>/<match>_<salt>.meta.bz2` or `.dem.bz2`. A `.meta.bz2` URL sets `metadata_salt` and a `.dem.bz2` URL sets `replay_salt`.
- `Salts::is_plausible()` is false when `match_id` is over 10,000,000,000.

`scan` module:

- `extract_replay_url_from_bytes(data)` finds a `replay*.valve.net` URL for app 1422450 in the bytes it is given.
- `extract_replay_url(path)` reads the first 200 bytes of a file and calls it.
- `scan_directory(dir, out)` walks a folder tree and pushes each URL found into `out`.

`seen` module:

- `Seen` remembers which match ids already have a metadata salt or a replay salt. `is_new(salts)` and `mark(salts)` update it.

## Dependencies

- `serde`, and `serde_json` for tests
- No workspace crates.

No platform-specific code.

## Gotchas

- `Salts` serialises `username` as `"deadlockplus:<id>"` and leaves the field out when it is unknown.
- The metadata salt and the replay salt are tracked separately in `Seen`. A match with only its metadata salt seen still counts as new for a replay salt.
- `Seen` clears itself when it holds more than 10,000 matches.
- `scan_directory` descends into subfolders, reads at most 200 bytes per file and skips folders and files it cannot read.
- `Salts::from_url` ignores the query string. A URL whose salt is not a number still parses, with the salt left empty.

## Testing

```
cargo test -p dp-ingest
```
