import { FALLBACK_CODE, INVITES, slug, type Channel, type Invite } from "./invites";
import { LANDINGS, type Landing } from "./landing";

export interface Links {
    invites: readonly Invite[];
    landings: readonly Landing[];
}

/** Used whenever the stored table is missing, broken or cannot be read. */
export const DEFAULT_LINKS: Links = { invites: INVITES, landings: LANDINGS };

export const LINKS_KEY = "links";

/** Shipped app builds, the README and old posts link these codes directly; they must never change. */
export const LOCKED_REFS: readonly string[] = ["app", "general", "github"];

/** Every web ref without an invite of its own falls back to this one. */
export const DEFAULT_REF = "website";

/** The website's top-level pages and folders: a landing path with one of these names would never be reached. */
export const RESERVED_PATHS: readonly string[] = [
    "discord",
    "download",
    "faq",
    "features",
    "get",
    "og",
    "privacy",
    "screenshots",
    "sitemap.xml",
    "transparency",
];

const CHANNELS: readonly string[] = ["web", "app", "direct"] satisfies Channel[];
const CODE = /^[A-Za-z0-9-]{2,32}$/;

function isInvite(row: unknown): row is Invite {
    if (typeof row !== "object" || row === null) return false;
    const { ref, channel, code } = row as Record<string, unknown>;
    return (
        typeof ref === "string" &&
        slug(ref) === ref &&
        typeof channel === "string" &&
        CHANNELS.includes(channel) &&
        (code === null || (typeof code === "string" && CODE.test(code)))
    );
}

function isLandingRow(row: unknown): row is Landing {
    if (typeof row !== "object" || row === null) return false;
    const { path, ref } = row as Record<string, unknown>;
    return typeof path === "string" && slug(path) === path && typeof ref === "string";
}

function unique(values: string[]): boolean {
    return new Set(values).size === values.length;
}

/** One bad row rejects the whole table, so the site never runs on half a list. */
export function parseLinks(raw: string | null): Links | null {
    if (raw === null) return null;
    let body: unknown;
    try {
        body = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof body !== "object" || body === null) return null;
    const { invites, landings } = body as Record<string, unknown>;
    if (!Array.isArray(invites) || !invites.every(isInvite)) return null;
    if (!Array.isArray(landings) || !landings.every(isLandingRow)) return null;

    const refs = invites.map((invite) => invite.ref);
    if (!unique(refs) || !unique(invites.flatMap((invite) => (invite.code ? [invite.code] : [])))) return null;
    for (const ref of LOCKED_REFS) {
        const locked = INVITES.find((invite) => invite.ref === ref);
        const stored = invites.find((invite) => invite.ref === ref);
        if (!stored || stored.channel !== locked?.channel || stored.code !== locked.code) return null;
    }
    if (!invites.some((invite) => invite.ref === DEFAULT_REF && invite.channel === "web")) return null;

    const webRefs = new Set(invites.filter((invite) => invite.channel === "web").map((invite) => invite.ref));
    if (!unique(landings.map((landing) => landing.path))) return null;
    for (const { path, ref } of landings) {
        if (RESERVED_PATHS.includes(path) || refs.includes(path) || !webRefs.has(ref)) return null;
    }

    return {
        invites: invites.map(({ ref, channel, code }) => ({ ref, channel, code })),
        landings: landings.map(({ path, ref }) => ({ path, ref })),
    };
}

export function isLanding(raw: string | null | undefined, links: Links = DEFAULT_LINKS): boolean {
    const path = slug(raw);
    return links.landings.some((landing) => landing.path === path);
}

export interface ResolvedRef {
    ref: string;
    code: string;
    known: boolean;
}

/**
 * The invite for `/discord/<raw>`: a landing path's invite, a web ref's own invite, or the website's. Only a missing
 * ref gets the general invite, since every link the site renders carries one.
 */
export function resolveWebRef(raw: string | null | undefined, links: Links = DEFAULT_LINKS): ResolvedRef {
    const given = slug(raw);
    if (!given) return { ref: "none", code: FALLBACK_CODE, known: false };
    const ref = links.landings.find((landing) => landing.path === given)?.ref ?? given;
    const web = (wanted: string) => links.invites.find((i) => i.channel === "web" && i.ref === wanted);
    const invite = web(ref);
    const code = invite?.code ?? web(DEFAULT_REF)?.code ?? FALLBACK_CODE;
    return { ref: invite ? ref : given, code, known: invite !== undefined };
}
