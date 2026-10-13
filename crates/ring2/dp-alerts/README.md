# dp-alerts

Turns the Deadlock update feed into a stored list of alerts and decides which ones are new. It is ring 2 because it knows the feed format and Valve's title conventions. It uses `dp-text` and `dp-versioned` from ring 0.

## Public API

- `Alert` is one update, with `id`, `title`, `link`, `source`, `published`, `kind`, `summary`, `image` and `read`. It exports to `packages/ipc-types/src/Alert.ts`.
- `Stored` is the saved state. Its `alerts` field is public and the rest is private.
- `merge(stored, items)` folds a fetched feed into `Stored` and returns the alerts that are new, newest first.
- `load(path)` reads `Stored` and `save(path, stored)` writes it. `STORE_FILE` is `"alerts.json"`.
- `feed::parse_feed_with_text(json)` parses the feed JSON into `(Alert, full body text)` pairs.

## Dependencies

- `dp-text` and `dp-versioned`
- `serde`, `serde_json`, `ts-rs`, `log`

No platform-specific code.

## Gotchas

- The first successful poll lists existing items as already read and returns nothing, so a new install does not raise a burst of alerts.
- `merge` never looks at an id twice. A parsing fix therefore does not reach items already saved. Raise `STORE_VERSION` when stored alerts gain a field or when `published` is computed differently. `load` then discards a file with an older version and relists from the next poll.
- `Stored::version` is separate from the file's schema version in `dp-versioned`. A version mismatch relists. It does not migrate.
- The list keeps the newest 50 alerts and remembers the last 500 seen ids.
- `parse_feed_with_text` drops items without a title or a stable id. A forum changelog entry that embeds a Steam post also in the feed folds into the Steam post and only lends its image.
- The feed's `pub_date` can be a forum edit time. When the date in the title disagrees with it on the calendar day, the title's `MM-DD-YYYY` wins. Same-day items keep the feed's time of day.
- An alert takes the first image in the post whose host ends in `.steamstatic.com` and whose URL is not a favicon. Other images in a post are icons.

## Testing

```
cargo test -p dp-alerts
```

The tests use inline sample data and the system temp folder. They make no network calls.
