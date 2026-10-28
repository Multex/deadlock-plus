# Discord updates

Posts a release announcement to a Discord channel as a Components V2 message. The `Announce release` workflow runs it when a release is published.

It reads the release notes (the `CHANGELOG.md` entry that `release.yml` put in the draft) and builds one container: the version, a link button, one block per section (Added, Changed, Fixed) and a footer.

Notes over Discord's limits (4000 characters of text and 40 components per message) continue in more messages, posted in order. Only the first has the version and link, only the last has the footer. A message breaks between sections where it can, then between `####` groups, then between bullets, and never inside a bullet or right after a heading. A message that picks up partway through a section repeats that section's title, and the group heading too when it picks up partway through a group. Each message waits for Discord to accept the one before; a rate limit is waited out, and any other failure stops the post and fails the job, naming the message that failed.

Drafts and prereleases are not announced. Publish the draft to announce it.

## One-time setup

1. In Discord, create a webhook on the `#updates` channel. Set its name and avatar there.
2. In the GitHub repo, add the webhook URL as the Actions secret `DISCORD_UPDATES_WEBHOOK`. Without it the workflow skips.

## No install

The workflow runs `announce.mjs` straight from a checkout of this folder and `packages/discord-messages`, with no `pnpm install`. So the shared message builders are imported by relative path, and Node 24 runs their TypeScript source as it is. Keep both folders in the workflow's `sparse-checkout` list.

## Local use

```sh
node --test
node preview.mjs [version]  # how a CHANGELOG.md entry would split, sends nothing (default: Unreleased)
DISCORD_UPDATES_WEBHOOK=<url> RELEASE_TAG=v0.8.0 RELEASE_URL=<url> RELEASE_BODY="$(cat notes.md)" node announce.mjs
```
