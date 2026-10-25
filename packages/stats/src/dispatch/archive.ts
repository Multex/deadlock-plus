import type { DispatchIndex, EditionKind, IssuedEntry } from "./types";

export function indexKey(accountId: number): string {
    return `dispatch:${accountId}:index`;
}

export function editionKey(accountId: number, editionId: string): string {
    return `dispatch:${accountId}:${editionId}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const KINDS: readonly unknown[] = ["weekly", "monthly", "collectors", "year_end"] satisfies EditionKind[];
const isKind = (v: unknown): v is EditionKind => KINDS.includes(v);

function parseEntry(raw: unknown): IssuedEntry | null {
    if (!isRecord(raw)) return null;
    const { id, kind, number, issuedAt, startS, endS, matches, onRequest } = raw;
    if (typeof id !== "string" || !isKind(kind)) return null;
    if (!isNum(number) || !isNum(issuedAt) || !isNum(startS) || !isNum(endS) || !isNum(matches)) return null;
    if (typeof onRequest !== "boolean") return null;
    return { id, kind, number, issuedAt, startS, endS, matches, onRequest };
}

const newestFirst = (a: IssuedEntry, b: IssuedEntry) => b.startS - a.startS;

/** Anything unreadable gives an empty index. */
export function parseIndex(raw: unknown): DispatchIndex {
    const index: DispatchIndex = { schema: 1, issued: [], skipped: [], seen: [] };
    if (!isRecord(raw) || raw.schema !== 1) return index;
    if (Array.isArray(raw.issued)) {
        index.issued = raw.issued.map(parseEntry).filter((e): e is IssuedEntry => e !== null);
        index.issued.sort(newestFirst);
    }
    if (Array.isArray(raw.skipped)) index.skipped = raw.skipped.filter((s): s is string => typeof s === "string");
    if (Array.isArray(raw.seen)) index.seen = raw.seen.filter((s): s is string => typeof s === "string");
    return index;
}

export function nextNumber(index: DispatchIndex): number {
    return index.issued.reduce((max, e) => Math.max(max, e.number), 0) + 1;
}

export function recordIssued(index: DispatchIndex, entry: IssuedEntry): DispatchIndex {
    return {
        ...index,
        issued: [...index.issued.filter((e) => e.id !== entry.id), entry].sort(newestFirst),
        skipped: index.skipped.filter((id) => id !== entry.id),
    };
}

export function recordSkipped(index: DispatchIndex, editionId: string): DispatchIndex {
    if (index.skipped.includes(editionId)) return index;
    return { ...index, skipped: [...index.skipped, editionId] };
}

export function markSeen(index: DispatchIndex, editionId: string): DispatchIndex {
    if (index.seen.includes(editionId) || !index.issued.some((e) => e.id === editionId)) return index;
    return { ...index, seen: [...index.seen, editionId] };
}

/** Automatic issues the user has not opened, newest first; editions printed on request were opened when printed. */
export function unseenIds(index: DispatchIndex): string[] {
    return index.issued.filter((e) => !e.onRequest && !index.seen.includes(e.id)).map((e) => e.id);
}

export function unseenCount(index: DispatchIndex): number {
    return unseenIds(index).length;
}
