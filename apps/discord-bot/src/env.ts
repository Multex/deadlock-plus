import type { Store } from "@deadlock-plus/costs";
import type { InitOptions } from "discord-hono";
import type { PostHogQueryEnv } from "./joins";
import type { AnalyticsEnv } from "./poll";

export interface Env extends PostHogQueryEnv, AnalyticsEnv {
    DISCORD_APPLICATION_ID: string;
    DISCORD_PUBLIC_KEY: string;
    /** The same bot token the website's Worker stores under this name. */
    DISCORD_BOT_TOKEN: string;
    /** The only server whose commands are answered. */
    DISCORD_GUILD_ID: string;
    /** The website's KV namespace: the site reads the cost list and the links table from it. */
    TRANSPARENCY: Store;
}

export type BotEnv = { Bindings: Env };

export function discordEnv(env: Env | undefined) {
    return { TOKEN: env?.DISCORD_BOT_TOKEN };
}

export type Verify = NonNullable<InitOptions<BotEnv>["verify"]>;
