# Discord updates

Posts a release announcement to a Discord channel as a Components V2 message. The `Announce release` workflow runs it when a release is published.

It reads the release notes (the `CHANGELOG.md` entry that `release.yml` put in the draft) and builds one container: the version, a link button, one block per section (Added, Changed, Fixed) and a footer. Text over Discord's 4000-character limit is cut with an "…and N more" line.

Drafts and prereleases are not announced. Publish the draft to announce it.

## One-time setup

1. In Discord, create a webhook on the `#updates` channel. Set its name and avatar there.
2. In the GitHub repo, add the webhook URL as the Actions secret `DISCORD_UPDATES_WEBHOOK`. Without it the workflow skips.

## No install

The workflow runs `announce.mjs` straight from a checkout of this folder and `packages/discord-messages`, with no `pnpm install`. So the shared message builders are imported by relative path, and Node 24 runs their TypeScript source as it is. Keep both folders in the workflow's `sparse-checkout` list.

## Local use

```sh
node --test
DISCORD_UPDATES_WEBHOOK=<url> RELEASE_TAG=v0.8.0 RELEASE_URL=<url> RELEASE_BODY="$(cat notes.md)" node announce.mjs
```
