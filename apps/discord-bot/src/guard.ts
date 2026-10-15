import type { AutocompleteHandler, CommandHandler } from "discord-hono";
import type { RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";
import type { BotEnv, Env } from "./env";

function inServer(env: Env, guild_id: string | undefined): boolean {
    return !!env.DISCORD_GUILD_ID && guild_id === env.DISCORD_GUILD_ID;
}

/**
 * Staff roles are enforced by Discord through `default_member_permissions`. This only stops the bot from acting
 * anywhere but the Deadlock+ server, should it ever be added to another one.
 */
export function staffOnly<T extends RESTPostAPIApplicationCommandsJSONBody>(
    handler: CommandHandler<BotEnv, T>,
): CommandHandler<BotEnv, T> {
    return (c) =>
        inServer(c.env, c.interaction.guild_id)
            ? handler(c)
            : c.flags("EPHEMERAL").res("This bot only works in the Deadlock+ server.");
}

export function staffSuggestions(handler: AutocompleteHandler<BotEnv>): AutocompleteHandler<BotEnv> {
    return (c) => (inServer(c.env, c.interaction.guild_id) ? handler(c) : c.resAutocomplete([]));
}
