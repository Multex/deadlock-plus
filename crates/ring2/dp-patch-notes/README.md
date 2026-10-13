# dp-patch-notes

Offline search over Deadlock patch notes. It parses patch bodies into lines, embeds each line with a bundled sentence model, stores the index as JSON and answers queries with keyword matching plus semantic matching. It is ring 2 because it combines text cleanup, versioned storage and the model into one feature. It does no networking. The app fetches the feeds and passes the text in.

## Public API

- `PatchLine` is re-exported at the crate root. It is one parsed bullet with `section`, `subject`, `tier`, `description`, `verb`, `old_value`, `new_value` and `raw`.
- `store` holds the index and the ingest functions.
  - `Index`, `IndexedPatch`, `IndexedLine`, `PatchSource`, `PatchOrigin` and `PatchDetail` are the data types. `PatchOrigin` is `Forum` or `Steam`.
  - `store::load(path)` and `store::save(path, index)` read and write the index through `dp-versioned`. `store::FILE_NAME` is `patch-notes-index.json`.
  - `store::build_new_patches` parses and embeds items whose id is not yet known. It holds no lock and touches no shared state.
  - `store::reconcile_steam_news` merges Steam News items into existing patches, or adds them as new patches.
  - `store::count_new_patches_lines` and `store::count_steam_news_lines` count the lines that would need a real embedding, for progress totals.
- `search::search(index, query, embedder, limit)` returns `PatchSearchResult` values, best score first.
- `steam_news::URL` and `steam_news::parse_news_with_text(json)` handle the Steam News response. The URL asks for `maxlength=0`, which returns full bodies.
- `embed::embedder()` returns the shared `Embedder`, loaded on first use. `Embedder::embed(text)` returns a 384-value normalised vector. `embed::cosine` compares two vectors and `embed::EMBEDDING_DIM` is 384.

TypeScript types exported to `packages/ipc-types/src`: `PatchLine`, `PatchOrigin`, `PatchDetail` and `PatchSearchResult`.

## Dependencies

- `dp-sync`, `dp-text` and `dp-versioned`
- `tract-onnx` and `tract-data`, both pinned in the workspace
- `tokenizers` with the `onig` backend, `regex`, `time`, `serde`, `serde_json`, `ts-rs`, `log`

## Platform behaviour

The crate is the same on every platform. The model (`minilm-l6-v2-int8.onnx`, all-MiniLM-L6-v2 quantised to int8) and `tokenizer.json` are compiled in with `include_bytes!`, so search needs no network and no download.

## Gotchas

- The root `Cargo.toml` pins `tract-onnx` and `tract-data` to `=0.21.18` in `[workspace.dependencies]`. Version 0.21.14 loops forever in the optimiser on this model's graph, repeatedly transposing the same `EinSumMatMul` nodes with unbounded memory growth. Version 0.21.18 does not. Keep both crates on the same exact version, since an unpinned build resolves `tract-data` ahead of the other tract crates. Test any bump against the bundled model.
- `Embedder` holds a `call_lock` around each `embed`. The `onig` backend of `tokenizers` is not safe to call from several threads on one `Tokenizer`, and parallel calls crashed under `cargo test`. The lock makes calls take turns, but the intent is one embedding thread. Do not add parallel embedding.
- `embedder()` loads and optimises the model on first call and caches the result, including a load failure. Callers that never search never pay for it.
- Embeddings are reused by comparing the whole `PatchLine`, not only `raw`. `merge_lines` looks a line up by `raw` and then requires `l.line == line`. `PatchLine` must not gain a field that cannot be derived cheaply from `raw`. A new field that differs from what the stored lines hold makes every stored line miss the cache and re-embeds the whole index.
- Image marker lines get a zero vector instead of a model call. Cosine against a zero vector is 0, so they never pass `SEMANTIC_FLOOR` (0.35) and the search also skips them.
- Search scores keyword matches first. A best score of 2.0 or more is confident. The semantic pass runs when the best keyword score is below 2.0 or fewer than `limit` results were found, and it adds hits at or above 0.35 cosine similarity.
- Steam News is the preferred source. A patch keeps `Forum` origin only until a fuller Steam post matches it. `reconcile_steam_news` replaces a patch's lines and origin only when the new parsed body is longer than the stored one, and it compares parsed lines with parsed lines because parsing drops section headers.
- `load` fixes two older index shapes in memory: it marks Steam-sourced ids as `Steam` and removes section header lines that older parsing stored as body text. Neither fix is written back until the next `save`.
- `build_new_patches` and `reconcile_steam_news` take no lock, because embedding a feed can take a long time. Callers hold the index lock only to read `known` and to store the result.

## Testing

```
cargo test -p dp-patch-notes
```

The tests load the real model, so the first run is slow, about 80 seconds. The model test also checks that the ONNX graph and the tokenizer work together.
