import type { TablePiles } from "./components/table";

export type RoomCopy = { kind: "edition" | "so_far"; id: string };
export type TableMode = "no_account" | "loading" | "offline" | "table" | "first_paper";

/** The copy `?edition=<id>` lifts into the reading room; anything else leaves the table in view. */
export function roomCopy(input: {
    query: string | null;
    issued: readonly string[];
    soFar: string | null;
}): RoomCopy | null {
    const { query, issued, soFar } = input;
    if (query === null) return null;
    if (query === soFar) return { kind: "so_far", id: query };
    return issued.includes(query) ? { kind: "edition", id: query } : null;
}

export function tableMode(input: {
    accountLoaded: boolean;
    accountId: number | null;
    status: "idle" | "loading" | "ready" | "error";
    /** Everything the table would hold: issued copies, proofs, thin windows and this week so far. */
    copies: number;
}): TableMode {
    const { accountLoaded, accountId, status, copies } = input;
    if (accountId === null) return accountLoaded ? "no_account" : "loading";
    if (status === "error") return "offline";
    if (status !== "ready") return "loading";
    return copies > 0 ? "table" : "first_paper";
}

/**
 * Where focus returns on the table once the room closes, best first: the copy's own cover or spine, else the bundle
 * it is tied into, which the table may draw instead of the copy.
 */
export function tableFocus(piles: TablePiles, id: string): string[] {
    const own = `[data-copy="${id}"]`;
    const weekly = piles.weekly.find((b) => b.copies.some((c) => c.id === id));
    if (weekly) return [own, `[data-bundle="${weekly.key}"]`];
    const spine = piles.spines.find((x) => x.copy.id === id);
    if (spine) return spine.bundle === null ? [own] : [own, `[data-bundle="${spine.bundle}"]`];
    const loose = [piles.soFar, piles.topMonthly, ...piles.specials].some((c) => c?.id === id);
    return loose ? [own] : [];
}

/** Focus fell out of the page when the control that held it was swapped for another, not when the user moved it. */
export function focusLost(active: { isConnected: boolean } | null, body: unknown): boolean {
    return active === null || active === body || !active.isConnected;
}

/** Escape closes the room, unless the object (a magazine closing itself) or an open dialog took it first. */
export function escapeLeavesRoom(
    e: { key: string; defaultPrevented: boolean },
    state: { room: boolean; dialog: boolean },
): boolean {
    return e.key === "Escape" && !e.defaultPrevented && state.room && !state.dialog;
}
