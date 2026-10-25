import type { DispatchIndex, IssuedEntry } from "./types";

export function indexKey(accountId: number): string {
    return `dispatch:${accountId}:index`;
}

export function editionKey(accountId: number, editionId: string): string {
    return `dispatch:${accountId}:${editionId}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseEntry(raw: unknown): IssuedEntry | null {
    if (!isRecord(raw)) return null;
    const { id, kind, number, issuedAt, startS, endS, matches, onRequest } = raw;
    if (typeof id !== "string" || (kind !== "weekly" && kind !== "monthly")) return null;
    if (!isNum(number) || !isNum(issuedAt) || !isNum(startS) || !isNum(endS) || !isNum(matches)) return null;
    if (typeof onRequest !== "boolean") return null;
    return { id, kind, number, issuedAt, startS, endS, matches, onRequest };
}

const newestFirst = (a: IssuedEntry, b: IssuedEntry) => b.startS - a.startS;

/** Anything unreadable gives an empty index. */
export function parseIndex(raw: unknown): DispatchIndex {
    const index: DispatchIndex = { schema: 1, issued: [], skipped: [], seenThrough: null };
    if (!isRecord(raw) || raw.schema !== 1) return index;
    if (Array.isArray(raw.issued)) {
        index.issued = raw.issued.map(parseEntry).filter((e): e is IssuedEntry => e !== null);
        index.issued.sort(newestFirst);
    }
    if (Array.isArray(raw.skipped)) index.skipped = raw.skipped.filter((s): s is string => typeof s === "string");
    if (typeof raw.seenThrough === "string") index.seenThrough = raw.seenThrough;
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

/** Opening an older edition from the shelf must not bring back the badge for newer ones, so this only moves forward. */
export function markSeen(index: DispatchIndex, editionId: string): DispatchIndex {
    const opened = index.issued.find((e) => e.id === editionId);
    if (!opened) return index;
    const current = index.issued.find((e) => e.id === index.seenThrough);
    if (current && current.startS >= opened.startS) return index;
    return { ...index, seenThrough: editionId };
}

/** Issued editions newer than `seenThrough`. */
export function unseenCount(index: DispatchIndex): number {
    const seen = index.issued.find((e) => e.id === index.seenThrough);
    return index.issued.filter((e) => !e.onRequest && (!seen || e.startS > seen.startS)).length;
}
