import { COMPONENTS_V2 } from "@deadlock-plus/discord-messages";
import { describe, expect, it } from "vitest";
import { announceModal, announcement, parseTarget, runAnnounce, type AnnounceDeps, type Draft } from "../src/announce";
import { DiscordError } from "../src/discord";

const GUILD = "1400000000000000000";
const CHANNEL = "1400000000000000001";
const ROLE = "1400000000000000002";

const DRAFT: Draft = { title: "Server maintenance", body: "The bot is down for an hour.", link: "" };

function deps(post: AnnounceDeps["post"] = async () => "1400000000000000009"): AnnounceDeps {
    return { guildId: GUILD, post };
}

function texts(value: unknown): string[] {
    return JSON.stringify(value)
        .match(/"content":"(?:[^"\\]|\\.)*"/g)!
        .map((match) => JSON.parse(match.slice('"content":'.length)) as string);
}

describe("announceModal", () => {
    it("carries the channel and role through its id", () => {
        const modal = announceModal(CHANNEL, ROLE).toJSON();
        expect(modal.custom_id).toBe(`announce;${CHANNEL} ${ROLE}`);
        expect(parseTarget(`${CHANNEL} ${ROLE}`)).toEqual({ channel: CHANNEL, role: ROLE });
    });

    it("carries no role when none was picked", () => {
        const modal = announceModal(CHANNEL, undefined).toJSON();
        expect(parseTarget(modal.custom_id.slice("announce;".length))).toEqual({ channel: CHANNEL, role: undefined });
    });

    it("asks for a title, a body and an optional link", () => {
        const inputs = announceModal(CHANNEL, undefined)
            .toJSON()
            .components.map((label) => (label as { component: { custom_id: string; required?: boolean } }).component);
        expect(inputs.map((input) => input.custom_id)).toEqual(["title", "body", "link"]);
        expect(inputs.map((input) => input.required !== false)).toEqual([true, true, false]);
    });

    it("keeps the post within Discord's 4000 characters of text", () => {
        const inputs = announceModal(CHANNEL, ROLE)
            .toJSON()
            .components.map((label) => (label as { component: { max_length: number } }).component.max_length);
        const mention = `<@&${ROLE}>`.length;
        expect(inputs[0]! + inputs[1]! + "## \n".length + mention).toBeLessThanOrEqual(4000);
    });
});

describe("announcement", () => {
    it("is a Components V2 card that mentions nobody without a role", () => {
        const message = announcement(DRAFT, undefined, GUILD);
        expect(message.flags).toBe(COMPONENTS_V2);
        expect(message.allowed_mentions).toEqual({ parse: [] });
        expect(texts(message)).toEqual(["## Server maintenance", "The bot is down for an hour."]);
    });

    it("mentions only the picked role, above the card", () => {
        const message = announcement({ ...DRAFT, body: "Ping @everyone and <@&777>" }, ROLE, GUILD);
        expect(message.allowed_mentions).toEqual({ parse: [], roles: [ROLE] });
        expect(message.components[0]).toEqual({ type: 10, content: `<@&${ROLE}>` });
    });

    it("writes @everyone for the server's everyone role", () => {
        const message = announcement(DRAFT, GUILD, GUILD);
        expect(message.allowed_mentions).toEqual({ parse: ["everyone"] });
        expect(message.components[0]).toEqual({ type: 10, content: "@everyone" });
    });

    it("puts the link on a button beside the title", () => {
        const message = announcement({ ...DRAFT, link: "https://deadlockplus.app/" }, undefined, GUILD);
        expect(JSON.stringify(message)).toContain('"url":"https://deadlockplus.app/"');
        expect(texts(message)[0]).toBe("## Server maintenance");
    });
});

describe("runAnnounce", () => {
    it("posts to the picked channel and links to the post", async () => {
        const posted: { channel: string; body: unknown }[] = [];
        const reply = await runAnnounce(
            DRAFT,
            { channel: CHANNEL, role: ROLE },
            deps(async (channel, body) => {
                posted.push({ channel, body });
                return "1400000000000000009";
            }),
        );
        expect(posted).toHaveLength(1);
        expect(posted[0]!.channel).toBe(CHANNEL);
        expect(reply).toContain(`https://discord.com/channels/${GUILD}/${CHANNEL}/1400000000000000009`);
    });

    it("refuses a link that is not a web address and hands the text back", async () => {
        let posts = 0;
        const reply = await runAnnounce(
            { ...DRAFT, link: "javascript:alert(1)" },
            { channel: CHANNEL, role: undefined },
            deps(async () => {
                posts++;
                return "1";
            }),
        );
        expect(posts).toBe(0);
        expect(reply).toContain("https://");
        expect(reply).toContain(DRAFT.body);
    });

    it("says the bot lacks access when Discord refuses, and hands the text back", async () => {
        const reply = await runAnnounce(
            DRAFT,
            { channel: CHANNEL, role: undefined },
            deps(async () => {
                throw new DiscordError(403);
            }),
        );
        expect(reply).toContain(`<#${CHANNEL}>`);
        expect(reply).toContain("Send Messages");
        expect(reply).toContain(DRAFT.body);
    });
});
