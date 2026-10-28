import type { Input } from "./cost";

/** The website serves this key of the `TRANSPARENCY` namespace as `/announcements.json`. */
export const ANNOUNCEMENTS_KEY = "announcements";
/** Names the public key the app checks the signature with; a new signing key needs a new id. */
export const ANNOUNCE_KEY_ID = "2026-10";
export const MAX_ANNOUNCEMENTS = 20;
export const MAX_ENVELOPE_BYTES = 64 * 1024;

const TITLE_MAX = 80;
const BODY_MAX = 600;
const LABEL_MAX = 40;
const ID_MAX = 64;

export const SEVERITIES = ["info", "warning", "critical"] as const;
export const PLATFORMS = ["windows", "linux"] as const;
export type Severity = (typeof SEVERITIES)[number];
export type Platform = (typeof PLATFORMS)[number];

export interface FeedLink {
    url: string;
    label: string;
}

export interface Announcement {
    id: string;
    title: string;
    body: string;
    severity: Severity;
    versions?: string;
    platforms?: Platform[];
    startsAt?: string;
    endsAt?: string;
    link?: FeedLink;
}

export type Draft = Omit<Announcement, "id">;

export interface Payload {
    version: 1;
    issuedAt: string;
    announcements: Announcement[];
}

export interface Envelope {
    keyId: string;
    payload: string;
    signature: string;
}

export function base64url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(text: string): Uint8Array {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function signPayload(payload: Payload, privateJwk: string, keyId = ANNOUNCE_KEY_ID): Promise<Envelope> {
    // Windows PowerShell 5.1 adds a BOM and a line break to text piped into `wrangler secret put`; trim() drops both.
    const { kty, crv, d, x } = JSON.parse(privateJwk.trim()) as JsonWebKey;
    const key = await crypto.subtle.importKey("jwk", { kty, crv, d, x }, { name: "Ed25519" }, false, ["sign"]);
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const signature = await crypto.subtle.sign({ name: "Ed25519" }, key, bytes);
    return { keyId, payload: base64url(bytes), signature: base64url(new Uint8Array(signature)) };
}

/** Reads the stored feed back without checking its signature: the bot wrote it and only the bot can edit it. */
export function readPayload(raw: string): Payload | null {
    try {
        const envelope = JSON.parse(raw) as Partial<Envelope> | null;
        if (typeof envelope?.payload !== "string") return null;
        const payload = JSON.parse(new TextDecoder().decode(fromBase64url(envelope.payload))) as Partial<Payload>;
        if (payload?.version !== 1 || typeof payload.issuedAt !== "string" || !Array.isArray(payload.announcements)) {
            return null;
        }
        return payload as Payload;
    } catch {
        return null;
    }
}

export function rfc3339(date: Date): string {
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Apps ignore a feed that is not newer than the last one they verified, so every write must move forward. */
export function nextIssuedAt(previous: string | undefined, now: Date): string {
    const last = previous ? Date.parse(previous) : NaN;
    const at = Number.isNaN(last) || now.getTime() >= last + 1000 ? now : new Date(last + 1000);
    return rfc3339(at);
}

function slugify(text: string): string {
    return text
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function announcementId(title: string, now: Date, taken: readonly string[]): string {
    const day = now.toISOString().slice(0, 10);
    // Room for the day and a "-NN" suffix.
    const slug =
        slugify(title)
            .slice(0, ID_MAX - day.length - 4)
            .replace(/-+$/, "") || "announcement";
    const base = `${slug}-${day}`;
    let id = base;
    for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
    return id;
}

/** Gives back the link as parsed, or null when it points anywhere but our own pages. */
export function allowedLink(text: string): string | null {
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return null;
    }
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const path = url.pathname;
    const ok =
        url.hostname === "deadlockplus.app" ||
        url.hostname === "www.deadlockplus.app" ||
        (url.hostname === "discord.gg" && path.length > 1) ||
        (url.hostname === "discord.com" && /^\/invite\/[^/]+/.test(path)) ||
        (url.hostname === "github.com" && /^\/deadlock-plus\/[^/]+/.test(path));
    return ok ? url.href : null;
}

const NUMBER = "(?:0|[1-9]\\d*)";
const WILD = "(?:\\*|x|X)";
const PRE = "(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?";
const PARTIAL = `${NUMBER}(?:\\.${NUMBER}(?:\\.${NUMBER}${PRE})?)?`;
const WILDCARD = `${NUMBER}\\.(?:${WILD}(?:\\.${WILD})?|${NUMBER}\\.${WILD})`;
const COMPARATOR = new RegExp(`^(?:(?:=|>=?|<=?|~|\\^)\\s*${PARTIAL}|${PARTIAL}|${WILDCARD})$`);

/** The subset of Rust `semver::VersionReq` syntax the app is sure to parse. */
export function isVersionReq(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed === "*") return true;
    const parts = trimmed.split(",").map((part) => part.trim());
    return parts.length <= 32 && parts.every((part) => COMPARATOR.test(part));
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})$/;

/** A day means midnight UTC. */
function parseTime(text: string): string | null {
    const match = DAY.exec(text) ?? DATE_TIME.exec(text);
    if (!match) return null;
    const [, year, month, day] = match;
    const iso = DAY.test(text) ? `${text}T00:00:00Z` : text.replace(/^(.{10})[t ]/, "$1T").replace(/z$/, "Z");
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    // Date rolls 2026-02-30 over to March; compare the day as written with the day it became, before any offset.
    const written = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (written.getUTCMonth() !== Number(month) - 1 || written.getUTCDate() !== Number(day)) return null;
    return rfc3339(date);
}

function chars(text: string): number {
    return [...text].length;
}

function option(input: Input, key: string): string | undefined {
    const value = input[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Gives back the announcement without its id, or a reason it cannot be posted. */
export function validateDraft(input: Input, now: Date): Draft | string {
    const title = option(input, "title") ?? "";
    // A slash command option is one line, so `\n` stands for a line break.
    const body = (option(input, "body") ?? "").replace(/\\n/g, "\n").trim();
    if (!title || chars(title) > TITLE_MAX) return `The title must be 1 to ${TITLE_MAX} characters.`;
    if (!body || chars(body) > BODY_MAX) return `The text must be 1 to ${BODY_MAX} characters.`;
    const severity = option(input, "severity");
    if (!SEVERITIES.includes(severity as Severity)) return "The severity must be info, warning or critical.";
    const draft: Draft = { title, body, severity: severity as Severity };

    const versions = option(input, "versions");
    if (versions !== undefined) {
        if (!isVersionReq(versions)) return "The version range is not valid, e.g. `>=0.13.0, <0.13.2` or `=0.13.1`.";
        draft.versions = versions;
    }

    const platform = option(input, "platforms");
    if (platform !== undefined) {
        if (!PLATFORMS.includes(platform as Platform)) return "The platform must be windows or linux.";
        draft.platforms = [platform as Platform];
    }

    const starts = option(input, "starts");
    if (starts !== undefined) {
        const at = parseTime(starts);
        if (!at) return "The start must be a day as YYYY-MM-DD or a time like 2026-10-28T18:00Z.";
        draft.startsAt = at;
    }
    const ends = option(input, "ends");
    if (ends !== undefined) {
        const at = parseTime(ends);
        if (!at) return "The end must be a day as YYYY-MM-DD or a time like 2026-10-28T18:00Z.";
        if (Date.parse(at) <= now.getTime()) return "The end must be in the future.";
        if (draft.startsAt && at <= draft.startsAt) return "The end must come after the start.";
        draft.endsAt = at;
    }

    const link = option(input, "link");
    const label = option(input, "label");
    if (link !== undefined || label !== undefined) {
        if (link === undefined) return "A label needs a link.";
        const url = allowedLink(link);
        if (!url) {
            return "The link must be https on deadlockplus.app, discord.gg, discord.com/invite or github.com/deadlock-plus.";
        }
        if (label === undefined || chars(label) > LABEL_MAX)
            return `The link needs a label of 1 to ${LABEL_MAX} characters.`;
        draft.link = { url, label };
    }
    return draft;
}
