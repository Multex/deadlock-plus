import { DEFAULT_LINKS, LINKS_KEY, parseLinks } from "@deadlock-plus/links";
import { text } from "@deadlock-plus/discord-messages";
import { MessageFlags } from "discord-api-types/v10";
import { DiscordHono } from "discord-hono";
import { ANNOUNCE_MODAL, draftFrom, modalFor, parseTarget, runAnnounce } from "./announce";
import { costChoices, runCost } from "./cost";
import { discordApi } from "./discord";
import { discordEnv, type BotEnv, type Env, type Verify } from "./env";
import { staffModal, staffOnly, staffSuggestions } from "./guard";
import { inviteChoices, landingChoices, runInvite, runLanding, type InviteDeps } from "./invite";
import { joinsByCode } from "./joins";
import { pollInvites } from "./poll";

/** Must match `crons` in wrangler.toml. */
export const POLL_CRON = "0 * * * *";

export interface BotOptions {
    /** Replaced in tests; Discord's Ed25519 check otherwise. */
    verify?: Verify;
}

function inviteDeps(env: Env): InviteDeps {
    return {
        store: env.TRANSPARENCY,
        discord: discordApi(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID),
        joins: (live) => joinsByCode(env, live),
    };
}

export function createBot(options: BotOptions = {}) {
    return new DiscordHono<BotEnv>({ verify: options.verify, discordEnv })
        .autocomplete(
            "cost",
            staffSuggestions(async (c) =>
                c.resAutocomplete(await costChoices(c.sub.command, String(c.focused?.value ?? ""), c.env.TRANSPARENCY)),
            ),
            staffOnly(async (c) =>
                c.flags("EPHEMERAL").res(await runCost(c.sub.command, c.var, c.env.TRANSPARENCY, new Date())),
            ),
        )
        .autocomplete(
            "invite",
            staffSuggestions(async (c) => {
                const mode = c.sub.command === "delete" ? "delete" : "edit";
                return c.resAutocomplete(await inviteChoices(mode, String(c.focused?.value ?? ""), c.env.TRANSPARENCY));
            }),
            // Discord and PostHog can take longer than the 3 seconds Discord waits for an answer.
            staffOnly((c) =>
                c
                    .flags("EPHEMERAL")
                    .resDefer(async (c) => c.followup(await runInvite(c.sub.command, c.var, inviteDeps(c.env)))),
            ),
        )
        .autocomplete(
            "landing",
            staffSuggestions(async (c) => {
                const typed = String(c.focused?.value ?? "");
                const choices =
                    c.focused?.name === "path"
                        ? await landingChoices(typed, c.env.TRANSPARENCY)
                        : await inviteChoices("landing", typed, c.env.TRANSPARENCY);
                return c.resAutocomplete(choices);
            }),
            staffOnly(async (c) =>
                c.flags("EPHEMERAL").res(await runLanding(c.sub.command, c.var, c.env.TRANSPARENCY)),
            ),
        )
        .command(
            "announce",
            staffOnly((c) => c.resModal(modalFor(c.var))),
        )
        .modal(
            ANNOUNCE_MODAL,
            staffModal((c) =>
                c.flags("EPHEMERAL").resDefer(async (c) => {
                    const reply = await runAnnounce(draftFrom(c.var), parseTarget(c.ref.custom_value ?? ""), {
                        guildId: c.env.DISCORD_GUILD_ID,
                        post: (channel, body) =>
                            discordApi(c.env.DISCORD_BOT_TOKEN, c.env.DISCORD_GUILD_ID).postMessage(channel, body),
                    });
                    // The handed-back text can pass the 2000 characters plain content allows; a text display takes 4000.
                    return c.followup({
                        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
                        components: [text(reply)],
                    });
                }),
            ),
        )
        .cron(POLL_CRON, async (c) => {
            const links = parseLinks(await c.env.TRANSPARENCY.get(LINKS_KEY)) ?? DEFAULT_LINKS;
            await pollInvites(c.env, discordApi(c.env.DISCORD_BOT_TOKEN, c.env.DISCORD_GUILD_ID), links);
        });
}
