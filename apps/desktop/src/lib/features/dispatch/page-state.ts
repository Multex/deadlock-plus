import { MIN_EDITION_MATCHES, type DispatchIndex, type EditionKind } from "@deadlock-plus/stats/dispatch/types";
import { soFarWindow } from "@deadlock-plus/stats/dispatch/window";

export type PageSelection =
    | { kind: "edition"; id: string }
    | { kind: "so_far"; id: string }
    /** No query, and the unseen list is not read yet. */
    | { kind: "pending" }
    | { kind: "empty" };

export interface SelectInput {
    /** `?edition=<id>`. */
    query: string | null;
    /** Every issued edition id. */
    issued: readonly string[];
    /** Unseen issued ids, newest first; `null` until read. */
    unseen: readonly string[] | null;
    latest: { weekly: string | null; monthly: string | null };
    /** The "this week so far" edition id, when there is one. */
    soFar: string | null;
}

/** Query id, then the newest unseen edition, the latest weekly, the latest monthly, this week so far. */
export function selectEdition(input: SelectInput): PageSelection {
    const { query, issued, unseen, latest, soFar } = input;
    const known = (id: string | null): id is string => id !== null && issued.includes(id);
    if (query !== null && query === soFar) return { kind: "so_far", id: soFar };
    if (known(query)) return { kind: "edition", id: query };
    if (unseen === null) return { kind: "pending" };
    const next = unseen.find(known) ?? (known(latest.weekly) ? latest.weekly : null) ?? latest.monthly;
    if (next !== null) return { kind: "edition", id: next };
    if (soFar !== null) return { kind: "so_far", id: soFar };
    return { kind: "empty" };
}

/**
 * The id to write into the URL when the paper was chosen by fallback. Pinned, it stays put while opening it
 * marks it seen and the unseen list moves on to the next one.
 */
export function pinFor(query: string | null, selection: PageSelection): string | null {
    if (selection.kind !== "edition" && selection.kind !== "so_far") return null;
    return selection.id === query ? null : selection.id;
}

/** Automatic issues the user has not opened, newest first; the index keeps issues newest first. */
export function unseenIds(index: DispatchIndex): string[] {
    return index.issued.filter((e) => !e.onRequest && !index.seen.includes(e.id)).map((e) => e.id);
}

export type PageMode = "no_account" | "loading" | "offline" | "paper" | "first_paper";

export function pageMode(input: {
    accountLoaded: boolean;
    accountId: number | null;
    status: "idle" | "loading" | "ready" | "error";
    selection: PageSelection;
}): PageMode {
    const { accountLoaded, accountId, status, selection } = input;
    if (accountId === null) return accountLoaded ? "no_account" : "loading";
    if (status === "error") return "offline";
    if (status !== "ready" || selection.kind === "pending") return "loading";
    return selection.kind === "empty" ? "first_paper" : "paper";
}

/** The first weekly paper comes out on the next Monday 00:00 local, if this week reaches the minimum. */
export function firstPaper(nowS: number, tz: string, soFarMatches: number): { dateS: number; needed: number } {
    return { dateS: soFarWindow(nowS, tz).endS, needed: Math.max(0, MIN_EDITION_MATCHES - soFarMatches) };
}

export type SwitchKind = EditionKind | "so_far";

export function switchOptions(latest: SelectInput["latest"], soFar: string | null): SwitchKind[] {
    const out: SwitchKind[] = [];
    if (latest.weekly !== null) out.push("weekly");
    if (latest.monthly !== null) out.push("monthly");
    if (soFar !== null) out.push("so_far");
    return out;
}

export function switchTarget(kind: SwitchKind, latest: SelectInput["latest"], soFar: string | null): string | null {
    return kind === "so_far" ? soFar : latest[kind];
}

export function switchValue(selection: PageSelection): SwitchKind | null {
    if (selection.kind === "so_far") return "so_far";
    if (selection.kind !== "edition") return null;
    return selection.id.startsWith("monthly-") ? "monthly" : "weekly";
}
