import { buildEvent, type AnalyticsEvent, type Fetcher } from "@deadlock-plus/analytics";
import { inviteByCode } from "@deadlock-plus/links";
import { send, type AnalyticsEnv } from "./analytics";

export interface PollEnv extends AnalyticsEnv {
    DISCORD_BOT_TOKEN?: string;
    DISCORD_GUILD_ID?: string;
}

function isInvite(row: unknown): row is { code: string; uses: number } {
    const invite = row as { code?: unknown; uses?: unknown } | null;
    return typeof invite === "object" && typeof invite?.code === "string" && typeof invite.uses === "number";
}

/** `uses` is Discord's running total per invite, so joins over a period are the difference between two snapshots. */
export function snapshot(rows: unknown[], now = new Date()): AnalyticsEvent[] {
    return rows.filter(isInvite).map(({ code, uses }) => {
        const listed = inviteByCode(code);
        return buildEvent(
            "discord_invite_uses",
            { code, ref: listed?.ref ?? "unlisted", channel: listed?.channel ?? "direct", uses },
            now,
        );
    });
}

export async function pollInvites(env: PollEnv, fetcher: Fetcher = fetch, now = new Date()): Promise<void> {
    if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return;

    let rows: unknown;
    try {
        const response = await fetcher(`https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/invites`, {
            headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
        });
        if (!response.ok) {
            console.error(`Discord refused the invite list: ${response.status}`);
            return;
        }
        rows = await response.json();
    } catch {
        console.error("Request to Discord failed");
        return;
    }
    if (!Array.isArray(rows)) return;
    await send(env, snapshot(rows, now), fetcher);
}
