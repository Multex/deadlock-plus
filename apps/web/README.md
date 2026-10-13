# Website

The Deadlock+ website. SvelteKit on a Cloudflare Worker.

## What it does

- **Pages**: `/`, `/features`, `/download` and `/privacy`. `<body data-sveltekit-reload>` makes every navigation a full request, so the server counts each page view. Feature copy lives in `src/lib/content/features.ts`.
- **Look**: the theme, fonts and UI primitives (bits-ui, tailwind-variants) come from `packages/ui` (`@deadlock-plus/ui`), the same package the desktop app uses. `src/app.css` imports them and adds only the website's own rules.
- **Discord redirect** at `/discord/<ref>`. It records the click and answers `302` to the invite for that ref.
- **Referrer counts.** Every page view records where the visitor came from.
- **Join counts.** Once an hour a bot reads how many times each Discord invite was used.

All counts go to PostHog. Without `POSTHOG_KEY` and `POSTHOG_HOST` the site sends nothing.

## Refs

A ref names where a link was posted: `github`, `deadlock-api`, `reddit`.

- Link to Discord with `/discord/<ref>`.
- Link to the site with `/?ref=<ref>`. `utm_source` works too.
- A ref is lowercase letters, digits and `-`, up to 32 characters.
- An unlisted ref still works. It is recorded with `known: false` and uses the fallback invite.

Give a partner site a `?ref=` link. A browser may withhold the `Referer` header, and then the visit counts as direct.

## Invites

`packages/links/src/invites.ts` (`@deadlock-plus/links`) lists every invite: its ref, its channel and its code.

| Channel  | Meaning                                    |
| -------- | ------------------------------------------ |
| `web`    | Reached through `/discord/<ref>`           |
| `app`    | Opened from inside Deadlock+               |
| `direct` | A `discord.gg` link posted somewhere as is |

Discord counts joins per invite code and nothing else. So a ref is only countable by joins when it has a code of its own. A `web` ref with `code: null` shares the fallback code: its clicks are counted, its joins are not separable.

To add a ref:

1. In Discord, create an invite that never expires and has no use limit.
2. Add a line to `INVITES` with the ref, the channel and the code.

Never revoke an `app` or `direct` invite. Shipped app builds and posted links point at it.

## Events

| Event                  | Sent when                     | Properties                                                                     |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| `$pageview`            | A page is served              | `$pathname`, `$referrer`, `$referring_domain`, `ref`, `country`                |
| `discord_invite_click` | `/discord/<ref>` is requested | `ref`, `channel`, `known`, `code`, `$referrer`, `$referring_domain`, `country` |
| `discord_invite_uses`  | Hourly, one per invite        | `code`, `ref`, `channel`, `uses`                                               |

- Clicks and joins are different numbers. A click is a request to the redirect. A join is a use of the invite.
- `uses` is Discord's running total. Joins over a period are the difference between two snapshots.
- Link previewers and crawlers are redirected but not counted.

## Privacy

- No cookies and no client-side tracking script.
- Each event has a fresh random id and no person profile. Two requests cannot be linked to one visitor.
- The visitor's IP address is not sent. The country comes from Cloudflare.
- Only the origin of the referring page is stored, never its path or query.

## One-time setup

1. From this folder: `pnpm install`, then `pnpm deploy`. Secrets can only be set once a first deploy exists.
2. Set the PostHog secrets:
    ```sh
    pnpm wrangler secret put POSTHOG_KEY
    pnpm wrangler secret put POSTHOG_HOST
    ```
3. For join counts, create a Discord application with a bot, add the bot to the server with the Manage Server permission, then:
    ```sh
    pnpm wrangler secret put DISCORD_BOT_TOKEN
    pnpm wrangler secret put DISCORD_GUILD_ID
    ```
    Without these two the hourly job does nothing.
4. The site is served at `deadlockplus.app` (`routes` in `wrangler.toml`, a Cloudflare custom domain). The domain must be a zone in the same Cloudflare account as the Worker, or the deploy fails. `www.deadlockplus.app` is routed too and redirects to the bare domain (`src/lib/server/host.ts`). The `workers.dev` address is turned off.

## Deploy workflow

`.github/workflows/deploy-web.yml` runs the tests, builds, then runs `wrangler deploy` on every push to `main` that touches `apps/web/`. It needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets and skips while either is unset.

## Develop

- `pnpm test`, `pnpm check`, `pnpm format:check`.
- `pnpm dev` runs the site with Vite.
- `pnpm build`, then `pnpm preview`, runs the built Worker in `wrangler dev`. Add `--test-scheduled` and open `/__scheduled` to run the hourly job.
- Put secrets for local runs in a `.dev.vars` file (gitignored).

## Two wrangler files

- `wrangler.toml` is the deployed config. Its `main` is `src/worker.ts`, which wraps the SvelteKit Worker and adds the hourly job.
- `wrangler.kit.toml` is read by the SvelteKit adapter only. The adapter writes its Worker to `main`, so it needs a config whose `main` is the build output.
