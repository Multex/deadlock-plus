// `voice_ban.dt` is text KV3. SteamID64s exceed 2^53, so ids stay strings and edits are string
// splices: nothing the scan doesn't understand is rewritten.

import { t } from "$lib/core/i18n.svelte";

export interface MutedUser {
    steamid64: string;
    flags: number;
}

interface Span extends MutedUser {
    start: number;
    end: number;
}

export const DEFAULT_FLAGS = 3;

const STEAM64_RE = /^7656119\d{10}$/;

// KV3 dict fields are not comma separated, so the comma between the two keys is optional.
const ENTRY_RE =
    /\{\s*(?:flags\s*=\s*(\d+)\s*,?\s*steamid\s*=\s*(\d+)|steamid\s*=\s*(\d+)\s*,?\s*flags\s*=\s*(\d+))\s*\}/g;
const USERS_RE = /users\s*=\s*(\[|null)/;

function findEntries(text: string): Span[] {
    const spans: Span[] = [];
    for (const m of text.matchAll(ENTRY_RE)) {
        spans.push({
            steamid64: m[2] ?? m[3],
            flags: Number(m[1] ?? m[4]),
            start: m.index,
            end: m.index + m[0].length,
        });
    }
    return spans;
}

export function isSteam64(value: string): boolean {
    return STEAM64_RE.test(value);
}

export function parseVoiceBan(text: string): { users: MutedUser[] } {
    if (!USERS_RE.test(text)) throw new Error(t("voice_bans.not_a_voice_ban"));
    return { users: findEntries(text).map(({ steamid64, flags }) => ({ steamid64, flags })) };
}

function removeOne(text: string, steamid64: string): string {
    const entry = findEntries(text).find((e) => e.steamid64 === steamid64);
    if (!entry) return text;

    let { start, end } = entry;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    if (/^[ \t]*$/.test(text.slice(lineStart, start))) start = lineStart;

    const comma = /^\s*,/.exec(text.slice(end));
    if (comma) end += comma[0].length;
    const eol = /^[ \t]*\r?\n/.exec(text.slice(end));
    if (eol && start === lineStart) end += eol[0].length;

    let before = text.slice(0, start);
    if (!comma) before = before.replace(/,(\s*)$/, "$1");
    return before + text.slice(end);
}

export function removeMutedUsers(text: string, ids: string[]): string {
    return ids.reduce(removeOne, text);
}

function formatEntries(ids: string[], flags: number, nl: string, indent: string, commaAfterLast: boolean): string {
    const inner = `${indent}\t`;
    return ids
        .map(
            (id, i) =>
                `${indent}{${nl}${inner}flags = ${flags}${nl}${inner}steamid = ${id}${nl}${indent}}` +
                (commaAfterLast || i < ids.length - 1 ? "," : ""),
        )
        .join(nl);
}

export function addMutedUsers(
    text: string,
    ids: string[],
    flags: number = DEFAULT_FLAGS,
): { text: string; added: string[] } {
    const existing = new Set(parseVoiceBan(text).users.map((u) => u.steamid64));
    const added: string[] = [];
    for (const id of ids) {
        if (isSteam64(id) && !existing.has(id)) {
            existing.add(id);
            added.push(id);
        }
    }
    if (added.length === 0) return { text, added };

    const nl = text.includes("\r\n") ? "\r\n" : "\n";
    const entries = findEntries(text);
    const last = entries.at(-1);

    if (!last) {
        const list = `users =${nl}\t[${nl}${formatEntries(added, flags, nl, "\t\t", true)}${nl}\t]`;
        return { text: text.replace(/users\s*=\s*(?:null|\[\s*\])/, () => list), added };
    }

    const lineStart = text.lastIndexOf("\n", last.start - 1) + 1;
    const lead = text.slice(lineStart, last.start);
    const indent = /^[ \t]*$/.test(lead) ? lead : "\t\t";
    const comma = /^\s*,/.exec(text.slice(last.end));

    if (comma) {
        const at = last.end + comma[0].length;
        const block = nl + formatEntries(added, flags, nl, indent, true);
        return { text: text.slice(0, at) + block + text.slice(at), added };
    }
    const block = "," + nl + formatEntries(added, flags, nl, indent, false);
    return { text: text.slice(0, last.end) + block + text.slice(last.end), added };
}

export function buildExport(ids: string[]): string {
    return JSON.stringify({ version: 1, users: ids.map((steamid64) => ({ steamid64 })) }, null, 2);
}

function unique(ids: string[]): string[] {
    return [...new Set(ids.filter(isSteam64))];
}

/** Reads an export produced by `buildExport` or a raw `voice_ban.dt`. */
export function parseImport(text: string): string[] {
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return unique(parseVoiceBan(text).users.map((u) => u.steamid64));
    }
    const users = (json as { users?: unknown })?.users;
    if (!Array.isArray(users)) throw new Error(t("voice_bans.unrecognised_import"));
    return unique(users.map((u) => String((u as { steamid64?: unknown })?.steamid64 ?? "")));
}

export function mergeImport(text: string, ids: string[]) {
    return addMutedUsers(text, ids);
}
