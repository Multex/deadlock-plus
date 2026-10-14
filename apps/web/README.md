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

Two more routes only redirect. `/<ref>` is for a video that shows the address as text: it answers `302` to `/?ref=<ref>` for each ref in `LANDING_REFS` (`packages/links/src/landing.ts`) and is a 404 for any other. Those refs are `tt` (TikTok) or `yt` (YouTube), alone for the address shown in the video, with `-b` for the bio or channel description, or with `-p` for a pinned comment. `/get/<platform>?v=<version>&ref=<ref>` (`windows`, `deb`, `appimage`) records the download and answers `302` to that file in the release list, or to the newest release that has it when `v` is missing or unknown.

## Invites

`packages/links/src/invites.ts` (`@deadlock-plus/links`) lists every invite: its ref, its channel and its code.

| Channel  | Meaning                                    |
| -------- | ------------------------------------------ |
| `web`    | Reached through `/discord/<ref>`           |
| `app`    | Opened from inside Deadlock+               |
| `direct` | A `discord.gg` link posted somewhere as is |

Each `web` ref has an invite of its own, except `bluesky` and `steam`, which share the general code until they get one.

| Ref            | Channel  | For                                                       | Code         |
| -------------- | -------- | --------------------------------------------------------- | ------------ |
| `app`          | `app`    | Opened from inside Deadlock+                              | `VM9utA3enT` |
| `general`      | `direct` | General use and the fallback for refs without a code      | `w8x6HGUefT` |
| `github`       | `web`    | GitHub; the README and `CONTRIBUTING.md` link it directly | `652zsGZZgD` |
| `deadlock-api` | `web`    | The Deadlock API                                          | `YCbXPdbekW` |
| `website`      | `web`    | The website, for visitors who did not come from a video   | `KzWBUrQW3D` |
| `tiktok`       | `web`    | The website, for visitors from TikTok                     | `VR375cZwRJ` |
| `youtube`      | `web`    | The website, for visitors from YouTube                    | `Sa8PdZrVEa` |
| `reddit`       | `web`    | Reddit                                                    | `aTmYARWhdV` |
| `twitter`      | `web`    | Twitter                                                   | `tH5ZYTRGF5` |
| `bluesky`      | `web`    | Bluesky (no code yet)                                     | none         |
| `steam`        | `web`    | Steam (no code yet)                                       | none         |

The website's Discord buttons pick the ref from the visitor's landing ref: `tt`, `tt-b` and `tt-p` use `tiktok`, `yt`, `yt-b` and `yt-p` use `youtube`, a visitor whose ref has an invite code of its own (for example `?ref=reddit`) uses that ref, and every other visitor uses `website` (`inviteRefFor` in `landing.ts`).

Discord counts joins per invite code and nothing else. So a ref is only countable by joins when it has a code of its own. A `web` ref with `code: null` shares the fallback code: its clicks are counted, its joins are not separable.

To add a ref:

1. In Discord, create an invite that never expires and has no use limit.
2. Add a line to `INVITES` with the ref, the channel and the code.

Never revoke an `app` or `direct` invite. Shipped app builds and posted links point at it.

## Events

| Event                  | Sent when                      | Properties                                                                                      |
| ---------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `$pageview`            | A page is served               | `$pathname`, `$referrer`, `$referring_domain`, `ref`, `country`                                 |
| `discord_invite_click` | `/discord/<ref>` is requested  | `ref`, `channel`, `known`, `code`, `$referrer`, `$referring_domain`, `country`                  |
| `download_click`       | `/get/<platform>` is requested | `platform`, `version`, `latest`, `ref`, `fallback`, `$referrer`, `$referring_domain`, `country` |
| `discord_invite_uses`  | Hourly, one per invite         | `code`, `ref`, `channel`, `uses`                                                                |

- Clicks and joins are different numbers. A click is a request to the redirect. A join is a use of the invite.
- `uses` is Discord's running total. Joins over a period are the difference between two snapshots.
- Link previewers and crawlers are redirected but not counted.
- `fallback: true` means the release list had no file for the platform. The visitor was sent to the latest release page and `version` is `null`.

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

## Link preview image

`static/og.png` (1200 x 630) is the picture Discord and other apps show for a pasted link. `src/lib/components/seo.svelte` writes the tags that point at it. The picture is the `/og` page, captured with Edge. That page only exists on the dev server; the deployed site answers 404 for it. To make it again after a change to the theme, the brand mark or `src/routes/og/+page.svelte`:

```sh
pnpm dev --port 5218 --strictPort
node scripts/og.mjs http://localhost:5218
```

Run the second command in another terminal. It uses the Playwright that `apps/desktop` installs. `pnpm test` fails if the file is not 1200 x 630 or is over 300 kB.

## Two wrangler files

- `wrangler.toml` is the deployed config. Its `main` is `src/worker.ts`, which wraps the SvelteKit Worker and adds the hourly job.
- `wrangler.kit.toml` is read by the SvelteKit adapter only. The adapter writes its Worker to `main`, so it needs a config whose `main` is the build output.
