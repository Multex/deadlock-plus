# dp-gc

Recovers Deadlock match salts through the Steam Game Coordinator, using the user's own remembered Steam login. It is ring 2 because it encodes Valve's session storage and GC protocol. It does no file or network I/O except the GC connection itself.

## Public API

- `quota::QuotaWindow<LIMIT>` is a rolling 24 hour window. `SaltQuota` caps salt fetches at 40, `HistoryQuota` caps friend history lookups at 20. `try_consume`, `remaining` and `exhaust` take the clock as an argument.
- `auth::recover_all(steam_dir)` returns an `AuthContext` for every remembered account whose refresh token decrypts. `connect_cache_blob`, `steam_id_from_jwt`, `decrypt_aes_blob` and `local_vdf_path` are its steps. `account_id_of` turns a SteamID64 into the 32-bit id.
- `client::GcSession::connect(ctx)` logs in, reads the account's friends list into `friends` and handshakes the Deadlock GC. `fetch_match_salts(id)` makes one `GetMatchMetaData` call. `request_personas(ids)` asks Steam for friends' presence. `fetch_recent_matches(account)` reads the newest `GetMatchHistory` page and `fetch_match_history(account)` reads every page. `interpret_salts_response`, `interpret_history_response`, `next_history_cursor` and `friend_account_ids` are the pure mappings.
- `friends::pick(now, candidates, personas, budget)` ranks which friends probably played since deadlock-api last stored a match for them. `ActiveFriend::from_history` builds a candidate from their stored history.
- `ledger::SaltAttempts` counts salt fetches per match and gives up after `MAX_SALT_ATTEMPTS`. `ledger::FriendCooldowns` holds when each friend may be looked up again.
- `picks::fresh_newest_first(ids, processed, take)` chooses which matches to fetch.
- `pass::fetch_loop` fetches salts within the quota. `pass::history_loop` looks up friends' histories. `pass::fetch_all` fetches without a quota for a run the user started. The caller implements `Host` for pacing, the stop condition and delivery. `AccountState` holds both quotas and the backoff deadline and derives `Serialize` so the app can persist it.
- `error::GcError`.

## Dependencies

- `steam-vent` and `valveprotos`, git dependencies pinned to commits in `deadlock-api` repositories
- `tokio`, `futures-util`, `prost`, `aes`, `cbc`, `sha2`, `keyvalues-parser`, `crc32fast`, `hex`, `base64`, `serde`, `serde_json`, `log`
- `windows-dpapi` on Windows
- No workspace crates.

## Gotchas

- `AuthContext::refresh_token` is a live account credential. Keep it in memory. Its `Debug` output hides it and no error message may include it.
- Windows decrypts with DPAPI and the account name as entropy, so it only works for the signed-in Windows user. Other systems use AES with a key derived from the account name.
- Steam under Wine, Proton or Whisky stores a DPAPI blob that a native build cannot decrypt. Those accounts are skipped.
- `ConnectCache` is keyed by the CRC32 of the account name. A token whose Steam id differs from the `loginusers.vdf` entry is rejected.
- A rate-limited fetch exhausts the whole window and does not mark the match as processed, so another account can still take it.
- A failed fetch is not retried. It costs no quota.
- The caller must not run a pass while Deadlock is open. Steam routes GC traffic to the game's own pipe.
- A match counts as one attempt when the GC fails on it or when deadlock-api accepts its salts. Rate limits and failed posts do not count.
- Every friend history request costs history quota, whatever Steam answers. A friend is left alone for 6 hours after a lookup, or 7 days when their history is private.

## Testing

```
cargo test -p dp-gc
```

The tests need no Steam install and make no network calls. The GC connection itself is not covered.
