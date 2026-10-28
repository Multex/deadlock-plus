# Update channels

Deadlock+ updates itself from one of three channels. Users pick one in Settings > About; the default is Release.

| Channel | Who it is for | Built from | Version | Feed |
| --- | --- | --- | --- | --- |
| Release | Everyone | a `vX.Y.Z` tag, published by hand | `X.Y.Z` | `releases/latest/download/latest.json` |
| Beta | Testers who want the next release a few days early and will report problems | a `vX.Y.Z-beta.N` tag | `X.Y.Z-beta.N` | `releases/download/beta-feed/latest.json` |
| Nightly | Contributors and testers who want every change on `main`, and accept a broken build now and then | `main`, every night | `X.Y.Z-nightly.YYYYMMDD` | `releases/download/nightly-feed/latest.json` |

All feeds live on `github.com/deadlock-plus/deadlock-plus`. Every build is signed with the same updater key
(`TAURI_SIGNING_PRIVATE_KEY`), so a channel needs no extra trust in the app.

Beta and Nightly builds are GitHub prereleases. GitHub's "latest" release never points at a prerelease, so Release
users never see them. `beta-feed` and `nightly-feed` are rolling prereleases that hold nothing but the channel's
current `latest.json`; CI replaces that file on every build.

## Version scheme

`X.Y.Z` in a Beta or Nightly version is the release being worked towards, so semver order matches age:

```
0.14.0                      last release
0.14.1-nightly.20261028     nightly, no beta open yet: the patch after the last release
0.15.0-beta.1               first beta of 0.15.0
0.15.0-beta.2
0.15.0-nightly.20261030     nightly once 0.15.0 has a beta: above every 0.15.0 beta
0.15.0-nightly.20261030.2   a second nightly on the same day (manual run)
0.15.0                      the release: above all of its betas and nightlies
0.15.1-nightly.20261101     next nightly after the release
```

- Prerelease labels compare as text, and `beta` < `nightly`, so a nightly sorts above every beta of the same release.
  Numeric parts compare as numbers (`beta.10` > `beta.2`).
- The nightly version is worked out by `scripts/nightly.mjs`: the version of the newest beta (or nightly) tag above
  the last release if there is one, else the patch after `apps/desktop/package.json`'s version. A nightly never takes
  a lower version than the one before it.
- Only `beta.N` and `nightly.YYYYMMDD[.N]` labels ship. `release.yml` refuses any other label (`-rc.1` fails the
  build at once).
- Windows ships the NSIS installer only. Do not add the MSI target: MSI rejects prerelease versions that are not
  numbers.

## How the app picks an update

- A channel follows its own feed and every more stable one: Release reads the release feed; Beta reads release and
  beta; Nightly reads all three. It offers the newest version among them. This is what moves a beta user onto
  `0.15.0` once it ships, without a new beta.
- Nothing at or below the running version is ever offered, on any channel. Switching to a more stable channel
  therefore never downgrades: a user on `0.15.0-nightly.20261030` who picks Beta stays on that build until Beta or
  Release has something newer (here, `0.15.0` or a `0.16.0` beta). Settings saved by a newer build may not load in an
  older one, which is why there is no "go back now" button.
- A feed that cannot be read is skipped while another feed answered. The beta feed answers 404 until the first beta
  is cut; Beta users simply follow Release until then.
- Nightly is built for Windows only. On Linux the nightly feed has no entry, so Linux users on Nightly get Beta and
  Release builds.
- Code: `apps/desktop/src-tauri/src/features/updates/mod.rs` (`check_update` command, feeds, `newest`),
  `apps/desktop/src/lib/features/updates/updater.svelte.ts` (`channel`, `setChannel`, `check`). The setting is
  `updateChannel` in the `app-settings` store.
- Dev builds skip the automatic check (a manual check still works). The demo never touches the network: the
  `update-available` scenario offers a fake build per channel.

## Cutting builds

### Release

Unchanged: bump the version, tag `vX.Y.Z`, `release.yml` drafts the release, check the assets, then
`gh release edit vX.Y.Z --draft=false --latest`. Publishing posts to Discord.

### Beta

1. Set `apps/desktop/package.json` to `X.Y.Z-beta.N` and run `pnpm version:sync` in `apps/desktop`.
2. Commit, tag `vX.Y.Z-beta.N` (lightweight, like releases), push the tag.
3. `release.yml` builds Windows and Linux, publishes the prerelease at once (no draft: a draft's assets are not
   public, so the feed could not point at them), and replaces `latest.json` on `beta-feed`. It creates `beta-feed` the
   first time.

Notes come from a `## [X.Y.Z-beta.N]` CHANGELOG entry if there is one, else from `## [Unreleased]`. Betas are never
announced on Discord, and What's New shows nothing for a beta with no CHANGELOG entry of its own; the release's notes
show once the user reaches it.

### Nightly

`nightly.yml` runs at 03:17 UTC every day:

1. `plan` reads the tags. If `main` is at the same commit as the newest nightly tag, the run stops there.
2. `build` stamps the nightly version into `package.json`, `Cargo.toml` and `Cargo.lock` (in CI only, never
   committed) and builds the signed NSIS installer.
3. `publish` creates the `vX.Y.Z-nightly.YYYYMMDD` prerelease on that commit, replaces `latest.json` on
   `nightly-feed` (creating it the first time), then deletes older nightlies so the last 7 remain
   (`gh release delete <tag> --cleanup-tag`). To keep a different number, change `KEEP` in `scripts/nightly.mjs`.

Run one by hand with `gh workflow run nightly.yml` (add `-f force=true` to build an unchanged `main`). Nightly tags
are made by the workflow's token, so they do not start `release.yml`; `release.yml` also ignores `v*-nightly.*` tags
pushed by hand.

## Pausing or rolling back a channel

Users already on a bad build keep it: the updater never downgrades. Rolling back a feed only stops more people from
getting the bad build. The real fix is a newer build: `vX.Y.Z-beta.(N+1)`, or a nightly from the fixed `main`
(`gh workflow run nightly.yml`).

- **Point a feed back at an older build** (pauses that channel too):

  ```sh
  gh release download vX.Y.Z-beta.(N-1) -p latest.json -D feed-rollback
  gh release upload beta-feed feed-rollback/latest.json --clobber
  ```

  Same for `nightly-feed` with a kept nightly tag. Every prerelease keeps its own `latest.json` asset for this.
- **Stop nightlies**: `gh workflow disable nightly.yml`; `gh workflow enable nightly.yml` to resume.
- **Pull a bad build**: roll the feed back first, then `gh release delete <tag> --cleanup-tag`. Deleting the release
  the feed points at breaks every check on that channel until the feed is re-pointed.
- **Release**: `gh release edit vPREV --latest` makes the previous release "latest" again, so the release feed serves
  it.

## Troubleshooting

- **"Tag ... does not match apps/desktop/package.json version"**: the tagged commit's `package.json` must carry the
  full prerelease version (`0.15.0-beta.1`), synced with `pnpm version:sync`.
- **"No update channel ships prerelease ..."**: the tag's label is not `beta.N`. Delete the tag and tag again.
- **A nightly run did nothing**: `main` had no commit since the last nightly. Check the `plan` job log, or force a
  build with `-f force=true`.
- **Beta users are offered nothing after a beta was published**: check `beta-feed` has a `latest.json` whose
  `version` is that beta, and that the asset URLs in it download. A user above that version (for example on a nightly)
  is correctly offered nothing.
- **"Update check failed" on a channel**: every feed that channel follows failed. Open the feed URLs above; a 404 on
  all of them means the release feed itself is broken (no published "latest" release).
- **Signature error on install**: the build was signed with a different key than the one in `tauri.conf.json`. All
  three channels must use the same `TAURI_SIGNING_PRIVATE_KEY`.
- **The website's download page or the Discord post shows a beta or nightly**: they must skip prereleases. The
  download page drops `prerelease` rows; `announce-release.yml` skips prereleases, including a manual re-announce.
- **The website's download page lost the last release**: it reads the 30 newest GitHub releases. Seven nightlies, two
  feeds and the open betas fit well inside that; raise `per_page` if betas pile up.
