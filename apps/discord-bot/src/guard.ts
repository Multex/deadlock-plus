import type { CommandHandler } from "discord-hono";
import type { RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";
import type { BotEnv } from "./env";

/**
 * Staff roles are enforced by Discord through `default_member_permissions`. This only stops the bot from acting
 * anywhere but the Deadlock+ server, should it ever be added to another one.
 */
export function staffOnly<T extends RESTPostAPIApplicationCommandsJSONBody>(
    handler: CommandHandler<BotEnv, T>,
): CommandHandler<BotEnv, T> {
    return (c) => {
        const guild = c.env.DISCORD_GUILD_ID;
        if (!guild || c.interaction.guild_id !== guild) {
            return c.flags("EPHEMERAL").res("This bot only works in the Deadlock+ server.");
        }
        return handler(c);
    };
}
