import { DEFAULT_LINKS, LINKS_KEY, parseLinks } from "@deadlock-plus/links";
import { COMPONENTS_V2, text } from "@deadlock-plus/discord-messages";
import { MessageFlags } from "discord-api-types/v10";
import { DiscordHono } from "discord-hono";
import { ANNOUNCE_MODAL, draftFrom, modalFor, parseTarget, runAnnounce } from "./announce";
import { costChoices, runCost, type Input } from "./cost";
import { discordApi } from "./discord";
import { discordEnv, type BotEnv, type Env, type Verify } from "./env";
import {
    CANCEL_BUTTON,
    CONFIRM_BUTTON,
    cancelPost,
    confirmPost,
    endAnnouncement,
    feedChoices,
    listFeed,
    previewPost,
    removeAnnouncement,
    type FeedDeps,
} from "./feed-command";
import { staffButton, staffModal, staffOnly, staffSuggestions } from "./guard";
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

function feedDeps(env: Env): FeedDeps {
    return { store: env.TRANSPARENCY, signingKey: env.ANNOUNCE_SIGNING_KEY, now: new Date() };
}

/** The preview is a components message, so its replacement must be one too. */
function closePreview(reply: string) {
    return { flags: COMPONENTS_V2, components: [text(reply)] };
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
        .autocomplete(
            "announce",
            staffSuggestions(async (c) =>
                c.resAutocomplete(await feedChoices(String(c.focused?.value ?? ""), c.env.TRANSPARENCY)),
            ),
            staffOnly(async (c) => {
                const deps = feedDeps(c.env);
                const input: Input = c.var;
                switch (c.sub.command) {
                    case "discord":
                        return c.resModal(modalFor(c.var));
                    case "post": {
                        const preview = await previewPost(c.var, c.interaction.id, deps);
                        return typeof preview === "string" ? c.flags("EPHEMERAL").res(preview) : c.res(preview);
                    }
                    case "list":
                        return c.flags("EPHEMERAL").res(await listFeed(deps));
                    case "end":
                        return c.flags("EPHEMERAL").res(await endAnnouncement(input.id, deps));
                    default:
                        return c.flags("EPHEMERAL").res(await removeAnnouncement(input.id, deps));
                }
            }),
        )
        .component(
            CONFIRM_BUTTON,
            staffButton(async (c) =>
                c.update().res(closePreview(await confirmPost(c.ref.custom_value ?? "", feedDeps(c.env)))),
            ),
        )
        .component(
            CANCEL_BUTTON,
            staffButton((c) => c.update().res(closePreview(cancelPost()))),
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
