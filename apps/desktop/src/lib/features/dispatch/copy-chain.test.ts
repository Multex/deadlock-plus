import { describe, expect, it } from "vitest";
import type { Edition, EditionKind, EditionWindow } from "@deadlock-plus/stats/dispatch/types";
import { copyContext } from "./copy-chain";
import type { ShelfEntry } from "./service";

const win = (kind: EditionKind, id: string, startS: number): EditionWindow => ({
    kind,
    id,
    startS,
    endS: startS + 7 * 86400,
    tz: "UTC",
});
const entry = (w: EditionWindow, status: ShelfEntry["status"] = "issued"): ShelfEntry => ({
    window: w,
    status,
    matches: 10,
    number: 1,
    onRequest: false,
});
const edition = (w: EditionWindow) => ({ id: w.id, window: w, number: 1 }) as Edition;

const w1 = win("weekly", "weekly-1", 100);
const w2 = win("weekly", "weekly-2", 200);
const w3 = win("weekly", "weekly-3", 300);
const w4 = win("weekly", "weekly-4", 400);
const m1 = win("monthly", "monthly-1", 150);

const shelf = (entries: ShelfEntry[]) => {
    const out: Record<EditionKind, ShelfEntry[]> = { weekly: [], monthly: [], collectors: [], year_end: [] };
    for (const e of entries) out[e.window.kind].push(e);
    return out;
};

describe("copyContext", () => {
    it("chains the earlier issued editions of the same kind, oldest first", () => {
        const s = shelf([entry(w3), entry(w1), entry(m1), entry(w2, "printable"), entry(w4)]);
        expect(copyContext(edition(w4), s, {}).chain).toEqual(["weekly-1", "weekly-3"]);
    });

    it("counts the newest issue even when the shelf leaves it out", () => {
        const s = shelf([entry(w1)]);
        expect(copyContext(edition(w3), s, { "weekly-2": edition(w2) }).chain).toEqual(["weekly-1", "weekly-2"]);
    });

    it("hands over the previous edition when it is loaded", () => {
        const s = shelf([entry(w1), entry(w2)]);
        expect(copyContext(edition(w3), s, { "weekly-2": edition(w2) }).previous?.id).toBe("weekly-2");
        expect(copyContext(edition(w3), s, {}).previous).toBeNull();
    });

    it("has nothing before the first edition", () => {
        expect(copyContext(edition(w1), shelf([entry(w1)]), {})).toEqual({ chain: [], previous: null });
    });
});
