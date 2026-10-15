import {
    COMPONENTS_V2,
    container,
    linkButton,
    section,
    separator,
    text,
    type Container,
    type TextDisplay,
} from "@deadlock-plus/discord-messages";
import { TextInputStyle } from "discord-api-types/v10";
import { makeLabel, makeModal, makeTextInput } from "discord-hono";
import type { Input } from "./cost";
import { DiscordError } from "./discord";

export const ANNOUNCE_MODAL = "announce";

export interface Draft {
    title: string;
    body: string;
    /** Empty when the post has no button. */
    link: string;
}

export interface Target {
    channel: string;
    role: string | undefined;
}

export interface AnnounceDeps {
    guildId: string;
    post: (channelId: string, body: object) => Promise<string>;
}

interface ChannelMessage {
    flags: number;
    allowed_mentions: { parse: "everyone"[]; roles?: string[] };
    components: (TextDisplay | Container)[];
}

/** A modal cannot carry command options, so the channel and role ride along in its custom id. */
export function announceModal(channel: string, role: string | undefined) {
    return makeModal(ANNOUNCE_MODAL, "Announcement", [
        makeLabel("Title", makeTextInput("title", undefined, TextInputStyle.Short).max_length(100)),
        makeLabel("Text", makeTextInput("body", undefined, TextInputStyle.Paragraph).max_length(3000)),
        makeLabel(
            "Link for a button beside the title",
            makeTextInput("link", undefined, TextInputStyle.Short)
                .max_length(512)
                .required(false)
                .placeholder("https://deadlockplus.app/"),
        ),
    ]).custom_value(`${channel} ${role ?? ""}`);
}

export function modalFor(options: Input) {
    return announceModal(String(options.channel), typeof options.role === "string" ? options.role : undefined);
}

export function draftFrom(fields: Input): Draft {
    const field = (key: string) => (typeof fields[key] === "string" ? fields[key] : "");
    return { title: field("title"), body: field("body"), link: field("link").trim() };
}

export function parseTarget(value: string): Target {
    const [channel = "", role] = value.split(" ");
    return { channel, role: role || undefined };
}

/** The @everyone role shares the server's id and is mentioned by name, not by id. */
export function announcement(draft: Draft, role: string | undefined, guildId: string): ChannelMessage {
    const heading = text(`## ${draft.title}`);
    const card = container([
        draft.link ? section(heading, linkButton("Learn more", draft.link)) : heading,
        separator(),
        text(draft.body),
    ]);
    if (!role) return { flags: COMPONENTS_V2, allowed_mentions: { parse: [] }, components: [card] };
    if (role === guildId) {
        return {
            flags: COMPONENTS_V2,
            allowed_mentions: { parse: ["everyone"] },
            components: [text("@everyone"), card],
        };
    }
    return {
        flags: COMPONENTS_V2,
        allowed_mentions: { parse: [], roles: [role] },
        components: [text(`<@&${role}>`), card],
    };
}

function isWebLink(link: string): boolean {
    try {
        return ["https:", "http:"].includes(new URL(link).protocol);
    } catch {
        return false;
    }
}

function handBack(reason: string, draft: Draft): string {
    return `${reason} Your text:\n\`\`\`\n${draft.title}\n\n${draft.body}\n\`\`\``;
}

function failure(error: unknown, channel: string): string {
    if (!(error instanceof DiscordError)) {
        return `Discord did not answer, so the post may be missing. Check <#${channel}> before trying again.`;
    }
    if (error.status === 403) {
        return `The bot cannot post in <#${channel}>. Give it View Channel and Send Messages there, then try again.`;
    }
    if (error.status === 404) return "That channel no longer exists, so nothing was posted.";
    return `Discord answered ${error.status}, so nothing was posted.`;
}

export async function runAnnounce(draft: Draft, target: Target, deps: AnnounceDeps): Promise<string> {
    if (draft.link && !isWebLink(draft.link)) {
        return handBack("The link must start with https:// or http://, so nothing was posted.", draft);
    }
    try {
        const id = await deps.post(target.channel, announcement(draft, target.role, deps.guildId));
        return `Posted in <#${target.channel}>: https://discord.com/channels/${deps.guildId}/${target.channel}/${id}`;
    } catch (error) {
        return handBack(failure(error, target.channel), draft);
    }
}
