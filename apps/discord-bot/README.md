# Discord bot

The internal Deadlock+ bot. It is a Cloudflare Worker that answers Discord's interactions over HTTP and runs an hourly cron. It only works in the Deadlock+ server, and only members with Manage Server see its commands.

## Commands

- `/cost list|add|edit|end`: the running costs on the website's transparency page.
- `/invite list|stats|create|edit|delete`: the invite codes the website and the app link to, with joins per invite.
- `/landing add|delete`: short paths such as `deadlockplus.app/ig` and the invite each one counts under.
- `/announce channel [role]`: opens a form for a title, text and an optional link, then posts it as the bot. It mentions only the picked role.
- `/notice post|list|end|remove`: the announcements the app shows in its banner. See [App announcements](#app-announcements).

Every reply is private. `/cost`, `/invite`, `/landing` and `/notice post|end|remove` write the website's `TRANSPARENCY` KV namespace (keys `costs`, `links` and `announcements`). The website reads them from there.

## App announcements

The app fetches `https://deadlockplus.app/announcements.json`, which the website serves straight from the `announcements` key. The bot is the only writer.

- `/notice post` takes a title (80 characters), a text (600 characters, `\n` for a new line), a severity, and optionally a version range (Rust semver syntax, e.g. `>=0.13.0, <0.13.2`), a platform, start and end times, and a link with a label. Links may only go to `deadlockplus.app`, `discord.gg`, `discord.com/invite` or `github.com/deadlock-plus`.
- It answers with a preview and Confirm/Cancel. Nothing is written until Confirm. The preview's draft waits under `notice-draft:<id>` for an hour.
- Confirm re-reads the feed, adds the announcement with an id made of the title and the day, and signs the whole feed again.
- `/notice end <id>` sets its end to now. `/notice remove <id>` deletes it. `/notice list` shows every one.
- The feed holds 20 announcements and 64 KiB at most. Remove old ones once they have ended.

The feed is an envelope `{"keyId", "payload", "signature"}`. `payload` is the feed's JSON as base64url, and `signature` is an Ed25519 signature over those bytes. Every write moves `issuedAt` forward, since the app ignores a feed older than the last one it checked. The key id is `ANNOUNCE_KEY_ID` in `src/feed.ts`.

Every hour the cron sends each invite's use count to PostHog as `discord_invite_uses`. `/invite stats` reads those counts back.

## One-time setup

1. In the [Discord developer portal](https://discord.com/developers/applications), open the application:
    - **General Information**: copy the Application ID and the Public Key.
    - **Bot**: turn **Public Bot** off. The bot token is the one the website already uses.
2. In the Deadlock+ server, give the bot's role:
    - **Manage Server**, to list invites.
    - **Create Invite**, to create invites. Manage Server also lets it revoke them.
    - **View Channel** and **Send Messages** in every channel `/announce` posts to.
    - **Mention @everyone, @here and All Roles**, to ping `@everyone` or a role that is not set as mentionable. Without it the post still goes out, but nobody gets pinged.
3. Deploy once, so the Worker exists: push a change under `apps/discord-bot/` to `main`, or run `pnpm run deploy` from this folder.
4. From this folder, set the Worker's secrets:
    ```sh
    pnpm wrangler secret put DISCORD_APPLICATION_ID
    pnpm wrangler secret put DISCORD_PUBLIC_KEY
    pnpm wrangler secret put DISCORD_BOT_TOKEN
    pnpm wrangler secret put DISCORD_GUILD_ID
    pnpm wrangler secret put POSTHOG_KEY
    pnpm wrangler secret put POSTHOG_PERSONAL_KEY
    pnpm wrangler secret put ANNOUNCE_SIGNING_KEY
    ```
    - `DISCORD_GUILD_ID`: the server's id. While it is empty, the bot refuses every command.
    - `POSTHOG_KEY`: the project key (`phc_…`), to send the hourly counts.
    - `POSTHOG_PERSONAL_KEY`: a personal key with `query:read`, for `/invite stats`.
    - `ANNOUNCE_SIGNING_KEY`: the Ed25519 private key that signs the app's announcements, as a JWK (`{"kty":"OKP","crv":"Ed25519","d":...,"x":...}`). Without it, `/notice post|end|remove` write nothing. Its public half (`x`) is built into the app; a new key needs a new `ANNOUNCE_KEY_ID` and an app release that knows it. To make a key and set it in one go, run this from this folder instead of the `secret put` line above. It prints only the public `x` for the app and hands the private key straight to wrangler (not through a PowerShell pipe, which would add a BOM). The private key is never shown, so a lost secret means a new key and a new key id:
        ```sh
        node -e "const k=require('crypto').generateKeyPairSync('ed25519').privateKey.export({format:'jwk'});console.log('x='+k.x);require('child_process').execSync('pnpm wrangler secret put ANNOUNCE_SIGNING_KEY',{input:JSON.stringify(k),stdio:['pipe','inherit','inherit']})"
        ```
5. In the developer portal, open **General Information**. Set **Interactions Endpoint URL** to `https://discord-bot.deadlockplus.app/` and save. Discord checks the URL when you save, so steps 3 and 4 come first. The first deploy creates the domain's DNS record and certificate, which can take a few minutes.
6. Register the commands in the server. Put `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` in a `.dev.vars` file in this folder (gitignored), then run:
    ```sh
    pnpm register
    ```
    Run it again whenever `src/commands.ts` changes. The deploy workflow does not register commands.

To let more people use the commands, open **Server Settings > Integrations** and change the bot's command permissions there.

## Deploy workflow

`.github/workflows/deploy-discord-bot.yml` runs the type check and the tests, then `wrangler deploy`. It runs on a push to `main` that touches this folder, a package the bot uses, or `pnpm-lock.yaml`. It uses the same two repo secrets as the other Workers and skips while either is unset:

- `CLOUDFLARE_API_TOKEN`: an API token with the Workers edit scope.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account id.

The workflow does not touch the Worker's own secrets (step 4).

## Develop

- `pnpm test`, `pnpm typecheck`, `pnpm format:check`.
- `pnpm dev` runs the Worker locally with the secrets from `.dev.vars`. Discord can only reach it through a tunnel.
- `src/commands.ts` is loaded by `scripts/register.mjs` with Node's type stripping. It may import npm packages only, with no relative or workspace imports.
