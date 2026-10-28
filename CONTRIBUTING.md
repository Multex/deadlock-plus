# Contributing

Deadlock+ is a Tauri v2 app: a Rust backend and a SvelteKit (Svelte 5) frontend. Windows is the main platform. Linux is best-effort and untested. macOS is not supported.

## Setup

Needs Node with pnpm, Rust, and `protoc` (the Protocol Buffers compiler; `valveprotos` runs it in its build script). The desktop app lives in `apps/desktop/` (frontend at its root, Rust crate in `apps/desktop/src-tauri/`). Cargo runs from the repo root (a workspace). pnpm is one workspace as well (`pnpm-workspace.yaml` and a single `pnpm-lock.yaml` at the root): `pnpm install` from any folder installs every app under `apps/`, and scripts run from the app's own folder. The commands below run from `apps/desktop/`.

Telemetry is compiled in only when `DP_POSTHOG_KEY`, `DP_POSTHOG_HOST` and `DP_SENTRY_DSN` are set at build time, and never in a debug build. Local builds and forks send nothing.

```
pnpm install
pnpm tauri dev            # prompts for UAC
pnpm check                # svelte-check
pnpm format               # Prettier (4 spaces, width 120); CI runs pnpm format:check
pnpm test                 # Vitest
cargo test --workspace --lib                            # from the repo root; also regenerates packages/ipc-types/src
cargo fmt --all -- --config max_width=120,use_small_heuristics=Max
pnpm tauri build          # NSIS installer on Windows (per-machine, branded images); needs the update signing key, see Releasing
bash scripts/build-frames-layer.sh   # Linux only, before `pnpm tauri build`: builds the Vulkan frame layer (needs cargo-zigbuild, zig, objdump)
pnpm tauri build          # Linux: AppImage and deb
```

CI also runs `pnpm audit --prod` and `cargo audit`, and fails if `packages/ipc-types/src` is out of date. Commit the regenerated files with any Rust type change. `.editorconfig` sets a 4-space indent (2 for `package.json` and YAML).

## Crate tiers

- Workspace crates live in `crates/ring<N>/`. Tier 0 is primitives, tier 1 is platform, tier 2 is domain, and the app (`apps/desktop/src-tauri`) is tier 3.
- A crate may depend only on lower tiers. Each `Cargo.toml` declares its tier in `[package.metadata.dp]`, and it must match the directory.
- Only tier 3 may depend on `tauri` or `tauri-*`. Same-tier exceptions are listed at the top of `scripts/tiers.mjs`.
- `pnpm tiers:check` (from `apps/desktop/`) verifies all of this; CI runs it.

## Security notes

- The web view runs under a Content Security Policy (`app.security` in `src-tauri/tauri.conf.json`): scripts from the app only, network calls to the Deadlock API only, images over https. Add an origin there before a new feature fetches from it.
- Saving a file goes through the backend (`save_text_file`), which opens the save dialog itself. The web view never supplies a path.
- Firewall block requests are validated in `features/server_picker/validate.rs` (group id characters, public unicast relay IPs only).

## Conventions

- The web view never supplies paths for reads, writes or deletes. Rust commands derive or validate them (fixed allowlists, checks that a path stays inside its root).
- The web view does not write files. Persisted data goes through backend commands: `features/kv.rs` (stores must be listed in `STORES`), `features/versioned.rs` (`{ schema_version, data }` envelope; every stored file needs a `MIGRATIONS` slice, and a file with a newer version is refused, never overwritten), `features/atomic.rs` (`write_atomic`) and `features/export.rs`. Changing the stored fields of the alerts file means bumping `STORE_VERSION` in `alerts/mod.rs`.
- New setting: add an item to `settings/catalog.ts`, then wrap it in `{#if show(id)}` in its section component.
- User-facing names are "Mutes" and "Replays"; code, routes, files and types keep `voice-ban` and `demo`.
- Firewall rules are named `deadlock_plus_<id>_tcp` and `_udp`; the prefix stays. The bundle identifier `app.deadlockplus` names the app data folder, so changing it orphans users' data.
- `tauri.linux.conf.json` sets the Linux targets (AppImage, deb) and installs `libdp_frames_layer.so` into `/usr/lib/deadlock-plus/`. The layer is built against glibc 2.31 so it loads in Steam's Linux runtime.
- `release.yml` builds Windows, Linux AppImage and Linux deb on a tag. All three are in `latest.json` (`windows-x86_64`, `linux-x86_64-appimage`, `linux-x86_64-deb`) and update in place. `bundle.yml` is a manual, secret-free Linux test build.
- Tailwind's `@theme inline` inlines values. To make a token overridable at runtime, point it at a `:root` variable.
- The consent text for uploading match salts to the Deadlock API is worded deliberately; do not change it without discussion.
- Moving the repo breaks `node_modules` and `target` (absolute paths). Reinstall and rebuild.
- Icons: put the source at `src-tauri/icons/source-1024.png`, run `pnpm tauri icon`, then delete the generated `android/`, `ios/` and `64x64.png`.
- Font notices live in both `THIRD-PARTY-NOTICES.md` and `src/lib/features/settings/licenses.ts`; keep them in sync.

## Frontend layout

Everything is under `apps/desktop/src/`.

- `lib/core/`: app-wide plumbing with no feature knowledge. `tauri.ts` (`command`, `listen`), `prefs`, `kv`, `poller`, `files`, `platform`, `opener`, `updater`, `log`, `utils`.
- `lib/ui/`: presentational primitives (Button, Dialog, Tabs, Switch, ...) and page wrappers: `Page`, `PageHeader`, `EmptyState`, `Card`, `Section`, `ConfirmDialog`, `IconButton`, `SettingRow`. Reuse these before writing new markup.
- `lib/shell/`: the window frame (titlebar, sidebar, statusbar, content region) and the overlay host.
- `lib/features/<name>/`: one folder per feature.
    - `api.ts`: the only file that calls the backend.
    - `*.svelte.ts`: reactive stores.
    - `*.ts` plus `*.test.ts`: pure logic and its tests.
    - `components/`: Svelte components for that feature.
- `lib/features/registry.ts`: the feature list (drives the sidebar and Home cards) and app start-up wiring.
- `routes/`: thin. A page mounts a feature component and holds no logic. Route groups pick the layout: `(app)` (sidebar and pages), `(settings)` (settings overlay) and `(standalone)` (no chrome, e.g. onboarding).
- z-index tokens (`--z-local`, `--z-content-overlay`, `--z-popover`, `--z-toast`, `--z-grain`) are in `src/app.css`. Use them, not raw numbers.
- Dialogs portal into the content region (`shell/overlay-host`), so they never cover the titlebar or sidebar. Use the `lib/ui` dialog wrappers, not a custom portal.

### Import rules

`pnpm layers:check` (`scripts/frontend-layers.mjs`) enforces these on `.ts` and `.svelte` files, ignoring `lib/generated/`:

- `@tauri-apps/*` may be imported only from `lib/core/` and `lib/features/*/api.ts`. Test files are exempt.
- `lib/core/` and `lib/ui/` must not import `lib/features/`.
- `lib/shell/` may reach features only through `lib/features/registry`.
- The allow-list in the script may only shrink. A stale entry fails the check.

### Checks

From `apps/desktop/`: `pnpm check`, `pnpm test`, `pnpm format:check`, `pnpm layers:check`. CI runs them.

## Translations

All user-facing text lives in `locales/<area>/en.json`, one file per app area (`app`, `settings`, `matches`, `builds`, `live`, `tools`, `dispatch`). `dispatch` loads only when the Dispatch page opens. Each top-level namespace belongs to exactly one area. Never hardcode text in `.svelte` or `.ts` files.

- Keys are nested, snake_case, dotted: `t("settings.language.label")`. Placeholders are `{name}`.
- Plurals use sibling keys with CLDR suffixes: `replays_count_one`, `replays_count_other`. Call `tn("replays_count", n)`.
- No markup in strings. Split a sentence around a link or button into separate keys.
- Errors use `errors.<feature>.<name>`; the Rust side returns a code, the frontend renders it.
- Rust formats only tray and notification text, through `features/i18n.rs`. Keep log lines and `detail` strings in English.
- `pnpm i18n:check` (also in CI) fails on a missing key, a mismatched placeholder or a bad plural suffix.
- Other languages go through Crowdin (`crowdin.yml`). Do not edit `locales/<area>/<lang>.json` by hand.

### Crowdin flow

- `locales/<area>/en.json` are the only sources. A push to `main` that changes one uploads them to Crowdin (`.github/workflows/crowdin.yml`).
- The same workflow downloads translations on a weekly schedule and on manual runs. It opens a PR from `l10n_crowdin_translations`; it never pushes to `main`.
- Language files are named `<code>.json` (`fr.json`). Regional variants that coexist use the full code (`pt-BR.json`, `zh-CN.json`); add new ones under `languages_mapping` in `crowdin.yml`.
- The `en-XA` pseudo-locale is for local development only. It is never uploaded or downloaded.
- Repo secrets: `CROWDIN_PERSONAL_TOKEN` (needs the Projects read/write scope) and `CROWDIN_PROJECT_ID` (numeric, from the project's Tools > API page). The workflow skips while either is unset.
- The repo setting "Allow GitHub Actions to create and approve pull requests" must be on.
- Run `pnpm i18n:check` on downloaded files before merging the PR.
- Crowdin events can post to Discord through a small Worker: see `apps/crowdin-relay/README.md`.

## Community

Questions and ideas are welcome on the [Discord server](https://discord.gg/652zsGZZgD).

### Thanks page

Settings > Thanks lists contributors, translators and donators from `apps/desktop/src/lib/features/thanks/thanks.json`.

- Names are opt-in. Add a donator by name only with their consent, and count everyone else in `donators.others`.
- Contributors (GitHub) and translators (Crowdin) are refreshed weekly by `.github/workflows/thanks.yml`, which opens a PR. Run it locally with `node scripts/gen-thanks.mjs`; set `CROWDIN_PERSONAL_TOKEN` and `CROWDIN_PROJECT_ID` to include translators. Hand edits to those two lists are overwritten.
- Translators are listed by their public Crowdin username, never their full name. Bots go in `EXCLUDE_LOGINS` in the script.
- Donators are never touched by the script. Add names by hand.
- A `url` is optional and must be `https://`. Translator `languages` are codes from `lib/features/settings/languages.ts`.

## Adding a feature

1. Rust: `src-tauri/src/features/<name>/mod.rs`; export it in `features/mod.rs` and register its commands in `lib.rs`.
2. Frontend, following the layout above:
    - `src/lib/features/<name>/api.ts` wraps the commands through `lib/core/tauri`.
    - Pure logic goes in plain `.ts` files with a `*.test.ts` written first. State goes in a `*.svelte.ts` store.
    - Components go in `components/`. Build them from `lib/ui` (`Page`, `PageHeader`, `EmptyState`, `Card`, ...).
    - The route is `src/routes/(app)/<name>/+page.svelte`, and only mounts the feature component.
3. Add an entry to `src/lib/features/registry.ts`. It drives both the sidebar and the tool cards on Home, and its array order is the sidebar order (Server Picker, Connection, Stats, Rank, Sessions, Updates, Mutes, Replays, Storage; Home is fixed in the sidebar itself, and the Settings gear opens the overlay).
4. Run the frontend checks above.

Adding a game to the server picker is data only: add an entry to `crates/ring2/dp-server-picker/resources/games.json`.

## Commit messages

Commits follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
A [Gitmoji](https://gitmoji.dev) is welcome but optional.

### Format

```
<type>(<scope>): <emoji> <description>

<optional body>

<optional footer>
```

Examples:

```
feat(steam): ✨ open store links in the Steam app
fix(desktop): 🐛 stop crash when switching pages
refactor(kv): ♻️ split storage from the cache layer
ci: 👷 add musl build to the bundle workflow
feat(kv)!: ✨ change the on-disk format

BREAKING CHANGE: existing stores must be migrated on first launch.
```

### Types

| Type       | Use for                                          |
| ---------- | ------------------------------------------------ |
| `feat`     | A new feature                                    |
| `fix`      | A bug fix                                        |
| `refactor` | Code change that is neither a fix nor a feature  |
| `perf`     | Performance improvement                          |
| `docs`     | Documentation only                               |
| `test`     | Adding or fixing tests                           |
| `style`    | Formatting, lint fixes. No logic change.         |
| `build`    | Build system, dependencies                       |
| `ci`       | CI and bundle workflows                          |
| `chore`    | Anything else that does not touch `src` or tests |
| `revert`   | Reverts an earlier commit                        |

### Rules

- **Scope:** optional. Use a crate name without `dp-`, or `desktop`, `ci`, `deps`.
- **Description:** imperative ("add", not "added"). Lowercase start. No trailing period. Keep the subject line near 72 characters.
- **Gitmoji:** the character, not the `:shortcode:`. It goes after the colon. One per commit. Skip it if nothing fits.
- **Body:** optional. Wrap near 72 characters. Explain why the change is needed.
- **Breaking changes:** add `!` before the colon and a `BREAKING CHANGE:` footer.
- **Footer:** one blank line before it. Use it for `Fixes: #123` and `Co-Authored-By:` lines. Credit AI tools that helped: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **One change per commit.** Keep commits small and focused.

## Releasing

1. Bump `version` in `apps/desktop/package.json`, run `pnpm version:sync`, and move the `[Unreleased]` notes in `CHANGELOG.md` under a `## [x.y.z] - date` heading. The release fails without that entry; its text is the release body and the "What's new" dialog.
2. Tag `vx.y.z` and push. `.github/workflows/release.yml` builds, signs the update, and creates a **draft** release with the installer and `latest.json`. The app reads `latest.json` from the newest published release, so publishing the draft is what ships the update.
3. Repo secrets: `TAURI_SIGNING_PRIVATE_KEY` (contents of the key from `pnpm tauri signer generate`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Losing the key means installed copies can never update; keep a backup outside the repo. To build locally, set the same two variables in the shell.
4. Optional Windows code signing through SignPath: create the SignPath project (slug `deadlock-plus`, policy `release-signing`), add the secret `SIGNPATH_API_TOKEN` and the variable `SIGNPATH_ORGANIZATION_ID`. The workflow skips the step while the variable is unset.

### Changelog format

- Use Keep a Changelog types as `###` headings.
- Give a headline feature its own `####` heading, with a blank line between groups. A headline feature is one that needs several bullets to explain.
- Keep minor changes as plain bullets directly under their `###` type, listed before any `####` group.
- Keep each bullet to one short sentence that makes sense on its own.
- What's New renders only `###` sections, `####` groups and top-level `- ` bullets. Indented sub-bullets and deeper headings are dropped.

## Dependency licences

`node ../../scripts/gen-licenses.mjs` (from `apps/desktop/`) regenerates `apps/desktop/src/lib/generated/dependency-licenses.json`, which Settings displays. It needs `cargo install cargo-about --locked --features cli`. Rerun it after changing dependencies.
