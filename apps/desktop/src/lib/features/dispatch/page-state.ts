import { MIN_EDITION_MATCHES, type DispatchIndex, type EditionWindow } from "@deadlock-plus/stats/dispatch/types";
import { soFarWindow } from "@deadlock-plus/stats/dispatch/window";
import type { ShelfEntry } from "./service";

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

export { unseenIds } from "@deadlock-plus/stats/dispatch/archive";

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

/** The mini paper's look: one per edition kind, plus the unfinished week. */
export type PaperKind = "so_far" | "weekly" | "monthly" | "collectors" | "year_end";
export type StandGroupId = "so_far" | "specials" | "monthly" | "weekly";

export type StandItem =
    | { kind: "so_far"; id: string; paper: "so_far"; window: EditionWindow; matches: number }
    | { kind: "entry"; id: string; paper: Exclude<PaperKind, "so_far">; entry: ShelfEntry };

export interface StandGroup {
    id: StandGroupId;
    items: StandItem[];
}

export interface StandShelf {
    weekly: readonly ShelfEntry[];
    monthly: readonly ShelfEntry[];
    collectors?: readonly ShelfEntry[];
    year_end?: readonly ShelfEntry[];
}

export function standGroups(shelf: StandShelf, soFar: { window: EditionWindow; matches: number } | null): StandGroup[] {
    const papers = (paper: Exclude<PaperKind, "so_far">, list: readonly ShelfEntry[] = []): StandItem[] =>
        list.map((entry) => ({ kind: "entry", id: entry.window.id, paper, entry }));
    const newest = (a: StandItem, b: StandItem) => endOf(b) - endOf(a);
    // A year-end special outranks a collector's copy that closes with it.
    const specials = [...papers("year_end", shelf.year_end), ...papers("collectors", shelf.collectors)].sort(newest);
    const groups: StandGroup[] = [
        { id: "so_far", items: soFar ? [{ kind: "so_far", id: soFar.window.id, paper: "so_far", ...soFar }] : [] },
        { id: "specials", items: specials },
        { id: "monthly", items: papers("monthly", shelf.monthly).sort(newest) },
        { id: "weekly", items: papers("weekly", shelf.weekly).sort(newest) },
    ];
    return groups.filter((g) => g.items.length > 0);
}

const endOf = (item: StandItem) => (item.kind === "so_far" ? item.window : item.entry.window).endS;
