import { describe, expect, it } from "vitest";
import { pileKeys, rackCapacity, rackSlots, rackStep, rackStop, type RackSlot } from "./rack";

/** Newest first: weeks of Oct 2026 (2), Sep 2026 (4), Aug 2026 (5), then Dec 2025 (2). */
const WEEKS = [
    ...["w-10-12", "w-10-05"].map((id) => ({ id, path: ["2026", "2026-10"] })),
    ...["w-09-28", "w-09-21", "w-09-14", "w-09-07"].map((id) => ({ id, path: ["2026", "2026-09"] })),
    ...["w-08-31", "w-08-24", "w-08-17", "w-08-10", "w-08-03"].map((id) => ({ id, path: ["2026", "2026-08"] })),
    ...["w-12-15", "w-12-08"].map((id) => ({ id, path: ["2025", "2025-12"] })),
];

const shape = (slots: RackSlot[]) => slots.map((s) => (s.kind === "paper" ? s.id : `${s.key}(${s.ids.length})`));

describe("rackSlots", () => {
    it("stands every paper on its own when they all fit", () => {
        expect(shape(rackSlots(WEEKS, 13, null))).toEqual(WEEKS.map((w) => w.id));
    });

    it("opens the newest piles first, and any older one that still fits", () => {
        expect(shape(rackSlots(WEEKS, 6, null))).toEqual([
            "w-10-12",
            "w-10-05",
            "2026-09(4)",
            "2026-08(5)",
            "w-12-15",
            "w-12-08",
        ]);
        expect(shape(rackSlots(WEEKS, 5, null))).toEqual([
            "w-10-12",
            "w-10-05",
            "2026-09(4)",
            "2026-08(5)",
            "2025-12(2)",
        ]);
    });

    it("piles whole years when months alone do not fit", () => {
        // A year with one month in it piles under that month.
        expect(shape(rackSlots(WEEKS, 2, null))).toEqual(["2026(11)", "2025-12(2)"]);
    });

    it("fans an open pile out even past the room, piling the rest tighter", () => {
        expect(shape(rackSlots(WEEKS, 6, "2026-08"))).toEqual([
            "2026-10(2)",
            "2026-09(4)",
            "w-08-31",
            "w-08-24",
            "w-08-17",
            "w-08-10",
            "w-08-03",
            "2025-12(2)",
        ]);
    });

    it("opens the year on the way to an open month", () => {
        expect(shape(rackSlots(WEEKS, 2, "2026-09"))).toEqual([
            "2026-10(2)",
            "w-09-28",
            "w-09-21",
            "w-09-14",
            "w-09-07",
            "2026-08(5)",
            "2025-12(2)",
        ]);
    });

    it("never makes a pile of one", () => {
        const items = [
            { id: "m-09", path: ["2026"] },
            { id: "m-08", path: ["2026"] },
            { id: "m-12", path: ["2025"] },
        ];
        expect(shape(rackSlots(items, 2, null))).toEqual(["2026(2)", "m-12"]);
    });
});

describe("rackCapacity", () => {
    it("counts the papers that fit when each older one shows a sliver of at least the minimum", () => {
        expect(rackCapacity(350, 70, 28)).toBe(11);
        expect(rackCapacity(60, 70, 28)).toBe(1);
    });
});

describe("rackStep", () => {
    it("spreads the papers to fill the row, the last one ending on the row's end", () => {
        expect(rackStep(5, 350, 70, 8)).toBe(70);
        expect(rackStep(11, 350, 70, 8)).toBe(28);
    });

    it("stands them side by side with a gap when there is room to spare", () => {
        expect(rackStep(3, 600, 70, 8)).toBe(78);
    });

    it("is 0 for a single paper", () => {
        expect(rackStep(1, 350, 70, 8)).toBe(0);
    });
});

describe("rackStop", () => {
    const rows = [1, 3, 0, 5];

    it("moves along a row and stops at its ends", () => {
        expect(rackStop({ row: 1, col: 0 }, "ArrowRight", rows)).toEqual({ row: 1, col: 1 });
        expect(rackStop({ row: 1, col: 2 }, "ArrowRight", rows)).toBeNull();
        expect(rackStop({ row: 1, col: 0 }, "ArrowLeft", rows)).toBeNull();
        expect(rackStop({ row: 3, col: 2 }, "End", rows)).toEqual({ row: 3, col: 4 });
        expect(rackStop({ row: 3, col: 2 }, "Home", rows)).toEqual({ row: 3, col: 0 });
    });

    it("moves between rows, skipping empty ones and keeping the column where it can", () => {
        expect(rackStop({ row: 1, col: 2 }, "ArrowDown", rows)).toEqual({ row: 3, col: 2 });
        expect(rackStop({ row: 3, col: 4 }, "ArrowUp", rows)).toEqual({ row: 1, col: 2 });
        expect(rackStop({ row: 0, col: 0 }, "ArrowUp", rows)).toBeNull();
        expect(rackStop({ row: 3, col: 0 }, "ArrowDown", rows)).toBeNull();
    });

    it("ignores other keys", () => {
        expect(rackStop({ row: 0, col: 0 }, "Tab", rows)).toBeNull();
    });
});

describe("pileKeys", () => {
    it("files a week under its year and month in the edition's own zone", () => {
        // 2026-08-31 22:00 UTC is already 1 September in Berlin.
        const startS = Date.UTC(2026, 7, 31, 22, 0) / 1000;
        expect(pileKeys("weekly", startS, "UTC")).toEqual(["2026", "2026-08"]);
        expect(pileKeys("weekly", startS, "Europe/Berlin")).toEqual(["2026", "2026-09"]);
    });

    it("files months and specials under their year only", () => {
        const startS = Date.UTC(2025, 11, 1) / 1000;
        expect(pileKeys("monthly", startS, "UTC")).toEqual(["2025"]);
        expect(pileKeys("year_end", startS, "UTC")).toEqual(["2025"]);
    });
});
