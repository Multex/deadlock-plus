# dp-demos

Lists, classifies, pins, cleans up and deletes Deadlock replay files, and looks up match summaries from the Deadlock API. It is ring 2 because it holds domain rules for the replay format and folder. It uses `dp-versioned` from ring 0.

## Public API

Root module:

- `list_demos_in(dir)` returns a `DemoEntry` for each `<match id>.dem` or `<match id>.dem.partial` file, newest first.
- `parse_demo_filename(name)` returns the match id and a `DemoKind`.
- `parse_header(bytes)` reads `network_protocol` and `build_num` from a replay header.
- `classify(kind, header, reference_build)` returns a `DemoStatus`.
- `is_deletable(replays_dir, path)` is the guard for every delete.

`pin` module:

- `Pins` is a set of match ids. `PinStore` keeps it in memory and in `demo-pins.json`. `snapshot(dir)` reads it and `update(dir, f)` changes and saves it.
- `split_pinned(names, pins)` separates deletable names from refusals.
- `load(path)` and `save(path, pins)` read and write the file directly.

`cleanup` module:

- `Rule` has an `id`, `enabled` and a `RuleKind` of `OlderThanDays`, `LargerThanMb`, `Outdated` or `Partial`.
- `validate(rules)` rejects duplicate ids and zero thresholds.
- `select(rules, demos, pins, now_ms)` returns `CleanupMatch` values for replays that match an enabled rule.
- `load_rules(path)` and `save_rules(path, rules)` persist the rules.

`delete` module:

- `resolve_targets(dir, names)` turns file names into `Target` values or `Failure` values.
- `delete_to_bin(targets)` sends files to the trash. `delete_permanently(targets)` removes them. Both return a `DeleteReport`.
- `availability_for(dir, incoming)` returns a `RecycleAvailability`. `recycle_availability` and `default_limit` are the size rules behind it. `bin_info(dir)` returns Windows bin usage as `BinInfo`.

`metadata` module:

- `lookup(cache, dir, match_id)` fetches `https://api.deadlock-api.com/v1/matches/<id>/metadata`, keeps a `MatchSummary` and returns a `MetaResult`. `DemoMetaCache` holds the cache. `summarize(body)` is the parser.

TypeScript types exported to `packages/ipc-types/src`: `DemoStatus`, `Demo`, `DemoListing`, `CleanupRule`, `CleanupRuleKind`, `CleanupMatch`, `RecycleAvailability`, `DeleteFailure`, `DeleteReport`, `PlayerSummary`, `MatchSummary` and `MetaResult`.

## Dependencies

- `dp-versioned`
- `reqwest` with rustls, `trash`, `serde`, `serde_json`, `ts-rs`, `log`
- `windows` on Windows only

## Platform behaviour

- On Windows, `bin_info` and `availability_for` read the Recycle Bin size and limit. Windows deletes an item that would overflow the bin instead of recycling it, so the check runs before anything is sent. `availability_for` returns `TooLarge` when the bin size cannot be read, and `Disabled` when the drive bypasses the bin.
- On other platforms, `bin_info` returns `None` and `availability_for` always returns `Available`. The freedesktop trash has no size cap.

## Gotchas

- Only file names from the web view are accepted. `resolve_targets` joins each name onto the replays folder and runs `is_deletable`, which requires a replay file name, no `.` or `..` segment, and a direct child of that folder.
- The game's own build number is not comparable with the header's `build_num`. `Outdated` means older than the newest build among the local replays, and it is `Unknown` if no header could be read.
- `select` never returns a pinned replay, whatever the rules say. The `OlderThanDays` rule ignores a replay whose modified time is 0, so an unreadable time cannot mark it as very old.
- Pins live in the app data folder and not in the replays folder, so the game and Steam never see them.
- `lookup` never refetches a found match. It caches a 404 as `Missing` and asks again after 6 hours. Errors are not cached.
- A corrupt pin, rule or cache file reads as empty and the next save replaces it.

## Testing

```
cargo test -p dp-demos
```

The tests write under the system temp folder. They make no network calls.
