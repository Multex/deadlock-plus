import { DiscordHono } from "discord-hono";
import { costChoices, runCost } from "./cost";
import { discordEnv, type BotEnv, type Verify } from "./env";
import { staffOnly, staffSuggestions } from "./guard";

export interface BotOptions {
    /** Replaced in tests; Discord's Ed25519 check otherwise. */
    verify?: Verify;
}

export function createBot(options: BotOptions = {}) {
    return new DiscordHono<BotEnv>({ verify: options.verify, discordEnv }).autocomplete(
        "cost",
        staffSuggestions(async (c) =>
            c.resAutocomplete(await costChoices(c.sub.command, String(c.focused?.value ?? ""), c.env.TRANSPARENCY)),
        ),
        staffOnly(async (c) =>
            c.flags("EPHEMERAL").res(await runCost(c.sub.command, c.var, c.env.TRANSPARENCY, new Date())),
        ),
    );
}
