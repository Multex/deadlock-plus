import type { Store } from "@deadlock-plus/costs";
import {
    DEFAULT_LINKS,
    DEFAULT_REF,
    LINKS_KEY,
    LOCKED_REFS,
    SITE_URL,
    addInvite,
    addLanding,
    editInvite,
    inviteUrl,
    parseLinks,
    removeInvite,
    removeLanding,
    serializeLinks,
    slug,
    type Channel,
    type InviteEdit,
    type Links,
    type LinksError,
    type LinksResult,
} from "@deadlock-plus/links";
import type { Choice, Input } from "./cost";
import { DiscordError, type DiscordApi, type LiveInvite } from "./discord";
import type { Joins } from "./joins";

export interface InviteDeps {
    store: Store;
    discord: DiscordApi;
    joins: (live: ReadonlyMap<string, number>) => Promise<Map<string, Joins> | null>;
}

type Loaded = { state: "broken" } | { state: "ok"; links: Links; stored: boolean };

const BROKEN =
    "The stored links table is broken, so nothing was changed. Fix the `links` key in the Cloudflare dashboard first.";

const ERRORS: Record<LinksError, string> = {
    invalid:
        "That is not valid: refs and paths are lowercase letters, digits and dashes (up to 32), codes are letters, digits and dashes.",
    "not-found": "No such entry. Pick one from the list.",
    locked: "That invite is locked: shipped app builds, the README or old posts link to it.",
    required: "The website invite is the fallback for every other ref, so it cannot go.",
    "duplicate-ref": "That ref is already listed.",
    "duplicate-code": "Another ref already uses that code.",
    "duplicate-path": "That landing path is already listed.",
    "taken-by-landing": "A landing path already has that name.",
    "taken-by-invite": "An invite ref already has that name.",
    reserved: "That is a page of the website, so the path would never be reached.",
    "no-invite": "A landing path must count under a web invite.",
    "in-use": "Landing paths still count under that invite. Delete them first with `/landing delete`.",
};

/** A missing table means the built-in list is live; the first edit stores it. */
async function load(store: Store): Promise<Loaded> {
    const raw = await store.get(LINKS_KEY);
    if (raw === null) return { state: "ok", links: DEFAULT_LINKS, stored: false };
    const links = parseLinks(raw);
    return links ? { state: "ok", links, stored: true } : { state: "broken" };
}

async function save(store: Store, result: LinksResult & { ok: true }): Promise<void> {
    await store.put(LINKS_KEY, serializeLinks(result.links));
}

function failure(e: unknown, doing: string): string {
    return e instanceof DiscordError
        ? `Discord refused to ${doing} (${e.status}).`
        : `Discord could not be reached to ${doing}.`;
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Accepts a bare code or a pasted `discord.gg` link. */
function codeOf(value: string): string {
    return value.replace(/^https?:\/\/(www\.)?(discord\.gg|discord\.com\/invite)\//, "").replace(/\/+$/, "");
}

function list(links: Links, stored: boolean, live: LiveInvite[] | null): string {
    const uses = new Map(live?.map((invite) => [invite.code, invite.uses]));
    const lines = links.invites.map((invite) => {
        const tags = [invite.channel, ...(LOCKED_REFS.includes(invite.ref) ? ["locked"] : [])].join(", ");
        let line = `- **${invite.ref}** (${tags}): `;
        if (!invite.code) line += "no code of its own";
        else if (!live) line += `\`${invite.code}\``;
        else if (uses.has(invite.code)) line += `\`${invite.code}\`, ${uses.get(invite.code)} uses`;
        else line += `\`${invite.code}\`, not in the server`;
        const paths = links.landings.filter((l) => l.ref === invite.ref).map((l) => l.path);
        return paths.length ? `${line} · landing paths ${paths.join(", ")}` : line;
    });
    if (!live) lines.unshift("Discord's use counts are unavailable right now.");
    const listed = new Set(links.invites.map((invite) => invite.code));
    const stray = (live ?? []).filter((invite) => !listed.has(invite.code));
    if (stray.length) lines.push(`Not in the table: ${stray.map((i) => `\`${i.code}\` (${i.uses} uses)`).join(", ")}`);
    if (!stored) lines.push("This is the built-in list; the first change stores it.");
    return lines.join("\n");
}

async function stats(links: Links, deps: InviteDeps): Promise<string> {
    let live: LiveInvite[];
    try {
        live = await deps.discord.listInvites();
    } catch (e) {
        return failure(e, "list the invites");
    }
    const joins = await deps.joins(new Map(live.map((invite) => [invite.code, invite.uses])));
    if (!joins) return "PostHog could not be asked for the join counts.";
    const rows = live
        .map((invite) => ({ invite, joins: joins.get(invite.code) ?? { day: 0, week: 0, month: 0 } }))
        .sort((a, b) => b.joins.month - a.joins.month);
    return rows
        .map(({ invite, joins: j }) => {
            const ref = links.invites.find((i) => i.code === invite.code)?.ref;
            const name = ref ? `**${ref}**` : `\`${invite.code}\` (not in the table)`;
            return `- ${name}: ${j.day} in the last day, ${j.week} in 7 days, ${j.month} in 30 days`;
        })
        .join("\n");
}

async function create(links: Links, input: Input, deps: InviteDeps): Promise<string> {
    const ref = slug(text(input.ref));
    if (!ref) return ERRORS.invalid;
    const channel: Channel = input.kind === "direct" ? "direct" : "web";
    const check = addInvite(links, { ref, channel, code: null });
    if (!check.ok) return ERRORS[check.error];

    let code: string;
    try {
        code = await deps.discord.createInvite(String(input.channel));
    } catch (e) {
        return `${failure(e, "create the invite")} The bot needs the Create Invite permission in that channel.`;
    }
    const result = addInvite(links, { ref, channel, code });
    if (!result.ok) {
        await deps.discord.revokeInvite(code).catch(() => {});
        return ERRORS[result.error];
    }
    await save(deps.store, result);
    const counted = channel === "web" ? ` Link ${SITE_URL}/discord/${ref} so clicks are counted too.` : "";
    return `Created **${ref}** (${channel}): ${inviteUrl(code)}${counted}`;
}

async function edit(links: Links, input: Input, deps: InviteDeps): Promise<string> {
    const ref = slug(text(input.ref)) ?? "";
    const change: InviteEdit = {};
    if (input.new_ref !== undefined) {
        const renamed = slug(text(input.new_ref));
        if (!renamed) return ERRORS.invalid;
        change.ref = renamed;
    }
    const given = text(input.code);
    if (given) {
        const code = codeOf(given);
        let live: LiveInvite[];
        try {
            live = await deps.discord.listInvites();
        } catch (e) {
            return `${failure(e, "list the invites")} The code was not checked, so nothing was changed.`;
        }
        if (!live.some((invite) => invite.code === code)) return "No invite with that code is in the server.";
        change.code = code;
    }
    if (!Object.keys(change).length) return "Nothing to change.";
    const result = editInvite(links, ref, change);
    if (!result.ok) return ERRORS[result.error];
    await save(deps.store, result);
    return `Updated **${change.ref ?? ref}**.`;
}

async function remove(links: Links, input: Input, deps: InviteDeps): Promise<string> {
    const ref = slug(text(input.ref)) ?? "";
    const code = links.invites.find((invite) => invite.ref === ref)?.code ?? null;
    const result = removeInvite(links, ref);
    if (!result.ok) return ERRORS[result.error];
    await save(deps.store, result);
    if (input.revoke !== true || !code) return `Removed **${ref}** from the table. Its invite still works.`;
    try {
        await deps.discord.revokeInvite(code);
    } catch (e) {
        return `Removed **${ref}** from the table, but ${failure(e, `revoke \`${code}\``)}`;
    }
    return `Removed **${ref}** and revoked \`${code}\`.`;
}

export async function runInvite(sub: string, input: Input, deps: InviteDeps): Promise<string> {
    const loaded = await load(deps.store);
    if (loaded.state === "broken") return BROKEN;
    const { links, stored } = loaded;
    switch (sub) {
        case "list":
            return list(links, stored, await deps.discord.listInvites().catch(() => null));
        case "stats":
            return stats(links, deps);
        case "create":
            return create(links, input, deps);
        case "edit":
            return edit(links, input, deps);
        default:
            return remove(links, input, deps);
    }
}

export async function runLanding(sub: string, input: Input, store: Store): Promise<string> {
    const loaded = await load(store);
    if (loaded.state === "broken") return BROKEN;
    const path = slug(text(input.path));
    if (!path) return ERRORS.invalid;
    if (sub === "add") {
        const ref = slug(text(input.ref)) ?? "";
        const result = addLanding(loaded.links, { path, ref });
        if (!result.ok) return ERRORS[result.error];
        await save(store, result);
        return `Added **/${path}**, counted under ${ref}: ${SITE_URL}/${path}`;
    }
    const result = removeLanding(loaded.links, path);
    if (!result.ok) return ERRORS[result.error];
    await save(store, result);
    return `Deleted **/${path}**. Anyone who types it now lands on the home page.`;
}

/** `edit` and `delete` offer only rows they may change; `landing` offers the web invites a path can count under. */
export async function inviteChoices(
    mode: "edit" | "delete" | "landing",
    typed: string,
    store: Store,
): Promise<Choice[]> {
    const loaded = await load(store);
    if (loaded.state !== "ok") return [];
    const needle = typed.toLowerCase();
    return loaded.links.invites
        .filter((invite) =>
            mode === "landing"
                ? invite.channel === "web"
                : !LOCKED_REFS.includes(invite.ref) && (mode === "edit" || invite.ref !== DEFAULT_REF),
        )
        .filter((invite) => invite.ref.includes(needle))
        .slice(0, 25)
        .map((invite) => ({
            name: `${invite.ref} · ${invite.channel} · ${invite.code ?? "no code"}`,
            value: invite.ref,
        }));
}

export async function landingChoices(typed: string, store: Store): Promise<Choice[]> {
    const loaded = await load(store);
    if (loaded.state !== "ok") return [];
    const needle = typed.toLowerCase();
    return loaded.links.landings
        .filter((landing) => landing.path.includes(needle))
        .slice(0, 25)
        .map((landing) => ({ name: `/${landing.path} → ${landing.ref}`, value: landing.path }));
}
