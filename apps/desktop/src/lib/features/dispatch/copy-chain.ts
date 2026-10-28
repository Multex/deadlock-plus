import type { Edition, EditionKind } from "@deadlock-plus/stats/dispatch/types";
import type { EditionCopyContext } from "./edition-view";
import type { ShelfEntry } from "./service";

/**
 * Every issued edition of `edition`'s kind that started before it, oldest first, for the copy picker; `known`
 * adds loaded editions the shelf leaves out (the newest issue of each kind) and supplies `previous`.
 */
export function copyContext(
    edition: Edition,
    shelf: Record<EditionKind, ShelfEntry[]>,
    known: Record<string, Edition>,
): EditionCopyContext {
    const { kind, startS } = edition.window;
    const starts = new Map<string, number>();
    for (const e of shelf[kind]) if (e.status === "issued") starts.set(e.window.id, e.window.startS);
    for (const e of Object.values(known)) {
        if (e.window.kind === kind && e.number !== null) starts.set(e.id, e.window.startS);
    }
    const chain = [...starts]
        .filter(([, s]) => s < startS)
        .sort((a, b) => a[1] - b[1])
        .map(([id]) => id);
    const last = chain.at(-1);
    return { chain, previous: (last && known[last]) || null };
}

/**
 * The previous edition's id while it still has to be read, so the page can wait for it: without it the versus line
 * and the story order would change once it arrived. `tried` holds ids already read, found or not.
 */
export function previousToLoad(
    edition: Edition,
    shelf: Record<EditionKind, ShelfEntry[]>,
    known: Record<string, Edition>,
    tried: ReadonlySet<string>,
): string | null {
    const id = copyContext(edition, shelf, known).chain?.at(-1);
    return id && !known[id] && !tried.has(id) ? id : null;
}
