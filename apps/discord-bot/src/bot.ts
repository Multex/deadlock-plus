import { DiscordHono } from "discord-hono";
import { discordEnv, type BotEnv, type Verify } from "./env";

export interface BotOptions {
    /** Replaced in tests; Discord's Ed25519 check otherwise. */
    verify?: Verify;
}

export function createBot(options: BotOptions = {}) {
    return new DiscordHono<BotEnv>({ verify: options.verify, discordEnv });
}
