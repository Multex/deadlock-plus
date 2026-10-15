import { register } from "discord-hono";
import { commands } from "../src/commands.ts";

const { DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID } = process.env;

// Global commands would show in every server the bot joins; this bot belongs to one.
if (!DISCORD_GUILD_ID) {
    console.error("DISCORD_GUILD_ID is not set.");
    process.exit(1);
}

const log = await register(commands, DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID);
if (!log.includes("Success")) process.exitCode = 1;
