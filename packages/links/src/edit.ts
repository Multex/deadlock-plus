import type { Invite } from "./invites";
import type { Landing } from "./landing";
import { DEFAULT_REF, LOCKED_REFS, RESERVED_PATHS, parseLinks, type Links } from "./table";

export type LinksError =
    | "invalid"
    | "not-found"
    | "locked"
    | "required"
    | "duplicate-ref"
    | "duplicate-code"
    | "duplicate-path"
    | "taken-by-landing"
    | "taken-by-invite"
    | "reserved"
    | "no-invite"
    | "in-use";

export type LinksResult = { ok: true; links: Links } | { ok: false; error: LinksError };

export interface InviteEdit {
    ref?: string;
    code?: string | null;
}

export function serializeLinks(links: Links): string {
    return JSON.stringify(links, null, 4);
}

function fail(error: LinksError): LinksResult {
    return { ok: false, error };
}

/** Runs the table through `parseLinks`, so nothing is stored that the site would then refuse and replace. */
function settle(links: Links): LinksResult {
    const parsed = parseLinks(serializeLinks(links));
    return parsed ? { ok: true, links: parsed } : fail("invalid");
}

function clash(links: Links, invite: Invite, except?: string): LinksError | null {
    const others = links.invites.filter((i) => i.ref !== except);
    if (others.some((i) => i.ref === invite.ref)) return "duplicate-ref";
    if (invite.code !== null && others.some((i) => i.code === invite.code)) return "duplicate-code";
    if (links.landings.some((l) => l.path === invite.ref)) return "taken-by-landing";
    return null;
}

export function addInvite(links: Links, invite: Invite): LinksResult {
    if (invite.channel === "app") return fail("invalid");
    const row = { ref: invite.ref, channel: invite.channel, code: invite.code };
    const error = clash(links, row);
    return error ? fail(error) : settle({ ...links, invites: [...links.invites, row] });
}

export function editInvite(links: Links, ref: string, edit: InviteEdit): LinksResult {
    const current = links.invites.find((i) => i.ref === ref);
    if (!current) return fail("not-found");
    if (LOCKED_REFS.includes(ref)) return fail("locked");
    const next = { ...current, ref: edit.ref ?? current.ref, code: edit.code === undefined ? current.code : edit.code };
    const error = clash(links, next, ref);
    if (error) return fail(error);
    return settle({
        invites: links.invites.map((i) => (i.ref === ref ? next : i)),
        landings: links.landings.map((l) => (l.ref === ref ? { ...l, ref: next.ref } : l)),
    });
}

export function removeInvite(links: Links, ref: string): LinksResult {
    if (!links.invites.some((i) => i.ref === ref)) return fail("not-found");
    if (LOCKED_REFS.includes(ref)) return fail("locked");
    if (ref === DEFAULT_REF) return fail("required");
    if (links.landings.some((l) => l.ref === ref)) return fail("in-use");
    return settle({ ...links, invites: links.invites.filter((i) => i.ref !== ref) });
}

export function addLanding(links: Links, landing: Landing): LinksResult {
    if (RESERVED_PATHS.includes(landing.path)) return fail("reserved");
    if (links.invites.some((i) => i.ref === landing.path)) return fail("taken-by-invite");
    if (links.landings.some((l) => l.path === landing.path)) return fail("duplicate-path");
    if (!links.invites.some((i) => i.ref === landing.ref && i.channel === "web")) return fail("no-invite");
    return settle({ ...links, landings: [...links.landings, { path: landing.path, ref: landing.ref }] });
}

export function removeLanding(links: Links, path: string): LinksResult {
    if (!links.landings.some((l) => l.path === path)) return fail("not-found");
    return settle({ ...links, landings: links.landings.filter((l) => l.path !== path) });
}
