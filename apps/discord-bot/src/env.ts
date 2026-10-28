import type { Store } from "@deadlock-plus/costs";
import type { InitOptions } from "discord-hono";
import type { PostHogQueryEnv } from "./joins";
import type { AnalyticsEnv } from "./poll";

/** Workers KV as the bot uses it: the cost package's store plus expiring keys. */
export interface Kv extends Store {
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>;
}

export interface Env extends PostHogQueryEnv, AnalyticsEnv {
    DISCORD_APPLICATION_ID: string;
    DISCORD_PUBLIC_KEY: string;
    /** The same bot token the website's Worker stores under this name. */
    DISCORD_BOT_TOKEN: string;
    /** The only server whose commands are answered. */
    DISCORD_GUILD_ID: string;
    /** The website's KV namespace: the site reads the cost list, the links table and the announcements feed from it. */
    TRANSPARENCY: Kv;
    /** Ed25519 private JWK that signs the app's announcements feed; `/notice` refuses to write without it. */
    ANNOUNCE_SIGNING_KEY?: string;
}

export type BotEnv = { Bindings: Env };

export function discordEnv(env: Env | undefined) {
    return { TOKEN: env?.DISCORD_BOT_TOKEN };
}

export type Verify = NonNullable<InitOptions<BotEnv>["verify"]>;
