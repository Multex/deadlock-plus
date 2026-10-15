# Discord bot

The internal Deadlock+ bot. It is a Cloudflare Worker that answers Discord's interactions over HTTP and runs an hourly cron. It only works in the Deadlock+ server, and only members with Manage Server see its commands.

## Commands

- `/cost list|add|edit|end`: the running costs on the website's transparency page.
- `/invite list|stats|create|edit|delete`: the invite codes the website and the app link to, with joins per invite.
- `/landing add|delete`: short paths such as `deadlockplus.app/ig` and the invite each one counts under.
- `/announce channel [role]`: opens a form for a title, text and an optional link, then posts it as the bot. It mentions only the picked role.

Every reply is private. `/cost`, `/invite` and `/landing` write the website's `TRANSPARENCY` KV namespace (keys `costs` and `links`). The website reads them from there.

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
    ```
    - `DISCORD_GUILD_ID`: the server's id. While it is empty, the bot refuses every command.
    - `POSTHOG_KEY`: the project key (`phc_…`), to send the hourly counts.
    - `POSTHOG_PERSONAL_KEY`: a personal key with `query:read`, for `/invite stats`.
5. In the developer portal, open **General Information**. Set **Interactions Endpoint URL** to `https://deadlock-plus-discord-bot.<your-subdomain>.workers.dev/` and save. Discord checks the URL when you save, so steps 3 and 4 come first.
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
