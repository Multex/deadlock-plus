import { buildEvent, send, type AnalyticsEvent, type Fetcher } from "@deadlock-plus/analytics";
import { inviteByCode, type Links } from "@deadlock-plus/links";
import type { DiscordApi, LiveInvite } from "./discord";

export interface AnalyticsEnv {
    POSTHOG_KEY?: string;
    POSTHOG_HOST?: string;
}

/** `uses` is Discord's running total per invite, so joins over a period are the difference between two snapshots. */
export function snapshot(rows: readonly LiveInvite[], links: Links, now = new Date()): AnalyticsEvent[] {
    return rows.map(({ code, uses }) => {
        const listed = inviteByCode(code, links.invites);
        return buildEvent(
            "discord_invite_uses",
            { code, ref: listed?.ref ?? "unlisted", channel: listed?.channel ?? "direct", uses },
            now,
        );
    });
}

export async function pollInvites(
    env: AnalyticsEnv,
    discord: Pick<DiscordApi, "listInvites">,
    links: Links,
    fetcher: Fetcher = fetch,
    now = new Date(),
): Promise<void> {
    let rows: LiveInvite[];
    try {
        rows = await discord.listInvites();
    } catch (e) {
        console.error(`Reading the invite list failed: ${e instanceof Error ? e.message : "unknown error"}`);
        return;
    }
    await send({ apiKey: env.POSTHOG_KEY, host: env.POSTHOG_HOST, fetch: fetcher }, snapshot(rows, links, now));
}
