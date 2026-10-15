import type { Fetcher } from "@deadlock-plus/analytics";

const API = "https://discord.com/api/v10";

export class DiscordError extends Error {
    readonly status: number;

    constructor(status: number) {
        super(`Discord answered ${status}`);
        this.status = status;
    }
}

export interface LiveInvite {
    code: string;
    uses: number;
}

export interface DiscordApi {
    listInvites(): Promise<LiveInvite[]>;
    createInvite(channelId: string): Promise<string>;
    revokeInvite(code: string): Promise<void>;
}

function isLive(row: unknown): row is LiveInvite {
    const invite = row as { code?: unknown; uses?: unknown } | null;
    return typeof invite === "object" && typeof invite?.code === "string" && typeof invite.uses === "number";
}

export function discordApi(token: string, guildId: string, fetcher: Fetcher = fetch): DiscordApi {
    async function call(method: string, path: string, body?: object): Promise<Response> {
        const headers: Record<string, string> = { authorization: `Bot ${token}` };
        if (body) headers["content-type"] = "application/json";
        const response = await fetcher(`${API}${path}`, {
            method,
            headers,
            body: body && JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new DiscordError(response.status);
        return response;
    }

    return {
        async listInvites() {
            const rows: unknown = await (await call("GET", `/guilds/${guildId}/invites`)).json();
            return Array.isArray(rows) ? rows.filter(isLive).map(({ code, uses }) => ({ code, uses })) : [];
        },
        async createInvite(channelId) {
            const response = await call("POST", `/channels/${channelId}/invites`, {
                max_age: 0,
                max_uses: 0,
                unique: true,
            });
            const { code } = (await response.json()) as { code?: unknown };
            if (typeof code !== "string") throw new DiscordError(response.status);
            return code;
        },
        async revokeInvite(code) {
            await call("DELETE", `/invites/${encodeURIComponent(code)}`);
        },
    };
}
