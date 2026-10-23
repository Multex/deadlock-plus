import { describe, expect, it } from "vitest";
import {
    SAFE_MAX_WIDTH_EVERYWHERE,
    layoutBuild,
    minHeightForRowsEverywhere,
    minWidthForColumnsEverywhere,
    sharesRowEverywhere,
    type Box,
    type Screen,
} from "@deadlock-plus/build-layout";
import {
    BREAK_THROUGH_PX,
    categoryInsertion,
    chipInsertion,
    dragStop,
    edgeWidth,
    rowEdge,
    sizeTag,
    snapHeight,
    snapWidth,
    stopAtEdge,
    widestOnRow,
} from "./resize";

const FHD: Screen = { width: 1920, height: 1080 };
const QHD: Screen = { width: 2560, height: 1440 };
const UHD: Screen = { width: 3840, height: 2160 };

function centre(box: Box) {
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const ew = (n: number) => minWidthForColumnsEverywhere(n);
const eh = (r: number) => minHeightForRowsEverywhere(r);

describe("snapWidth", () => {
    it("snaps to the nearest width that keeps its columns in the shop and the Build Browser preview", () => {
        expect(snapWidth(300, false)).toBe(264);
        expect(snapWidth(320, false)).toBe(347);
        expect(snapWidth(250, false)).toBe(264);
        expect(snapWidth(176, false)).toBe(181);
    });

    it("never snaps below one column", () => {
        expect(snapWidth(98, false)).toBe(99);
        expect(snapWidth(10, false)).toBe(99);
        expect(snapWidth(-50, false)).toBe(99);
    });

    it("caps at the widest everywhere-safe column width", () => {
        expect(snapWidth(ew(12), false)).toBe(ew(12));
        expect(snapWidth(1033, false)).toBe(ew(12));
        expect(snapWidth(1059, false)).toBe(ew(12));
        expect(snapWidth(5000, false)).toBe(ew(12));
    });

    it("breaks an exact midpoint toward the wider width", () => {
        expect(snapWidth(140, false)).toBe(181);
        expect(snapWidth(139.99, false)).toBe(99);
    });

    it("free mode rounds to quarter units", () => {
        expect(snapWidth(300.1, true)).toBe(300);
        expect(snapWidth(300.13, true)).toBe(300.25);
        expect(snapWidth(175.6, true)).toBe(175.5);
    });

    it("free mode breaks an exact eighth upward", () => {
        expect(snapWidth(300.125, true)).toBe(300.25);
    });

    it("free mode clamps to one column and the safe maximum", () => {
        expect(snapWidth(50, true)).toBe(94);
        expect(snapWidth(93.9, true)).toBe(94);
        expect(snapWidth(1058.9, true)).toBe(1059);
        expect(snapWidth(2000, true)).toBe(1059);
    });
});

describe("snapHeight", () => {
    it("snaps to the smallest heights that hold whole rows in the shop and the Build Browser preview", () => {
        expect(snapHeight(169, false)).toBe(169);
        expect(snapHeight(162.75, false)).toBe(169);
        expect(snapHeight(250, false)).toBe(289);
        expect(snapHeight(eh(8) - 10, false)).toBe(eh(8));
    });

    it("never snaps below one row", () => {
        expect(snapHeight(10, false)).toBe(169);
        expect(snapHeight(-100, false)).toBe(169);
    });

    it("breaks an exact midpoint toward the taller height", () => {
        expect(snapHeight(229, false)).toBe(289);
        expect(snapHeight(228.9, false)).toBe(169);
    });

    it("free mode rounds to quarter units with a one-row floor", () => {
        expect(snapHeight(300.1, true)).toBe(300);
        expect(snapHeight(162.9, true)).toBe(163);
        expect(snapHeight(162.8, true)).toBe(162.75);
        expect(snapHeight(100, true)).toBe(162.75);
    });
});

describe("sizeTag", () => {
    it("reads columns and the rows the height holds at 1440p", () => {
        expect(sizeTag(347, 162.75, 4, QHD)).toEqual({ columns: 4, rows: 1, overflow: false, unsafe: false });
        expect(sizeTag(347, 282.75, 5, QHD)).toEqual({ columns: 4, rows: 2, overflow: false, unsafe: false });
        expect(sizeTag(347, 402.75, 12, QHD)).toEqual({ columns: 4, rows: 3, overflow: false, unsafe: false });
    });

    it("counts only whole rows the height holds", () => {
        expect(sizeTag(347, 250, 4, QHD).rows).toBe(1);
        expect(sizeTag(347, 282.25, 4, QHD).rows).toBe(1);
        expect(sizeTag(347, 282.5, 4, QHD).rows).toBe(2);
    });

    it("holds no row when the stored height is shorter than one", () => {
        expect(sizeTag(347, 100, 1, QHD)).toEqual({ columns: 4, rows: 0, overflow: true, unsafe: false });
    });

    it("flags items that need more rows than the height holds", () => {
        expect(sizeTag(347, 162.75, 5, QHD).overflow).toBe(true);
        expect(sizeTag(347, 282.75, 9, QHD).overflow).toBe(true);
        expect(sizeTag(347, 282.75, 8, QHD).overflow).toBe(false);
        expect(sizeTag(347, 162.75, 0, QHD).overflow).toBe(false);
    });

    it("flags a shop-safe width that the Build Browser preview shows with fewer columns", () => {
        expect(sizeTag(340, 162.75, 4, QHD)).toEqual({ columns: 4, rows: 1, overflow: false, unsafe: true });
        expect(sizeTag(258, 162.75, 3, FHD).unsafe).toBe(true);
        expect(sizeTag(347, 162.75, 4, QHD).unsafe).toBe(false);
        expect(sizeTag(94, 162.75, 1, QHD).unsafe).toBe(true);
        expect(sizeTag(99, 162.75, 1, QHD).unsafe).toBe(false);
    });

    it("flags a width whose columns differ at another scale", () => {
        expect(sizeTag(175.5, 162.75, 2, QHD)).toEqual({ columns: 2, rows: 1, overflow: false, unsafe: true });
    });

    it("reads 1080p", () => {
        expect(sizeTag(347, 282.75, 8, FHD)).toEqual({ columns: 4, rows: 2, overflow: false, unsafe: false });
        expect(sizeTag(264, 162.75, 4, FHD)).toEqual({ columns: 3, rows: 1, overflow: true, unsafe: false });
        expect(sizeTag(175.5, 162.75, 2, FHD)).toEqual({ columns: 2, rows: 1, overflow: false, unsafe: true });
    });

    it("reads 2160p", () => {
        expect(sizeTag(347, 402.75, 12, UHD)).toEqual({ columns: 4, rows: 3, overflow: false, unsafe: false });
        expect(sizeTag(175.5, 162.75, 2, UHD)).toEqual({ columns: 1, rows: 1, overflow: true, unsafe: false });
    });

    it("counts a capped width at the cap's columns", () => {
        expect(sizeTag(1200, 162.75, 12, QHD)).toEqual({ columns: 12, rows: 1, overflow: false, unsafe: false });
    });

    it("agrees with the shop layout's columns", () => {
        for (const screen of [FHD, QHD, UHD]) {
            for (const width of [94, 175.5, 187.75, 257.25, 277, 340, 451, 600, 1059, 1200]) {
                const laid = layoutBuild([{ width, height: 162.75, items: 1 }], screen).categories[0]!;
                expect(sizeTag(width, 162.75, 1, screen).columns, `${width} at ${screen.height}`).toBe(laid.columns);
            }
        }
    });
});

describe("chipInsertion", () => {
    // 4 columns at 1440p: row 0 at y 60..212, row 1 at y 220..372, chips 101 wide on a 109 px pitch.
    const chips = layoutBuild([{ width: 340, height: 282.75, items: 6 }], QHD).categories[0]!.chips;
    const row0 = centre(chips[0]!).y;
    const row1 = centre(chips[4]!).y;

    it("inserts at 0 into an empty category", () => {
        expect(chipInsertion([], 4, { x: 500, y: 500 })).toBe(0);
    });

    it("inserts before a chip when the point is left of its centre", () => {
        expect(chipInsertion(chips, 4, { x: centre(chips[0]!).x - 1, y: row0 })).toBe(0);
        expect(chipInsertion(chips, 4, { x: centre(chips[2]!).x - 1, y: row0 })).toBe(2);
        expect(chipInsertion(chips, 4, { x: centre(chips[5]!).x - 1, y: row1 })).toBe(5);
    });

    it("inserts after a chip when the point is right of its centre", () => {
        expect(chipInsertion(chips, 4, { x: centre(chips[0]!).x + 1, y: row0 })).toBe(1);
    });

    it("counts a point on a chip's centre as after it", () => {
        expect(chipInsertion(chips, 4, { x: centre(chips[1]!).x, y: row0 })).toBe(2);
    });

    it("inserts after the last chip of a row when the point is past it", () => {
        expect(chipInsertion(chips, 4, { x: 2000, y: row0 })).toBe(4);
        expect(chipInsertion(chips, 4, { x: 2000, y: row1 })).toBe(6);
    });

    it("inserts at a row's start when the point is left of everything", () => {
        expect(chipInsertion(chips, 4, { x: -50, y: row1 })).toBe(4);
    });

    it("puts a point above every row into the first row", () => {
        expect(chipInsertion(chips, 4, { x: centre(chips[1]!).x - 1, y: -20 })).toBe(1);
    });

    it("splits the gap between rows at its middle, the middle going to the lower row", () => {
        const gapMiddle = (chips[0]!.y + chips[0]!.height + chips[4]!.y) / 2;
        expect(chipInsertion(chips, 4, { x: 0, y: gapMiddle - 0.5 })).toBe(0);
        expect(chipInsertion(chips, 4, { x: 0, y: gapMiddle })).toBe(4);
    });

    it("inserts at the end when the point is below every row", () => {
        const bottom = chips[4]!.y + chips[4]!.height;
        expect(chipInsertion(chips, 4, { x: 0, y: bottom + 1 })).toBe(6);
        expect(chipInsertion(chips, 4, { x: 0, y: bottom })).toBe(6);
        expect(chipInsertion(chips, 4, { x: 0, y: bottom - 1 })).toBe(4);
    });

    it("handles a full last row and a single column", () => {
        const full = layoutBuild([{ width: 340, height: 282.75, items: 8 }], QHD).categories[0]!.chips;
        expect(chipInsertion(full, 4, { x: 2000, y: centre(full[7]!).y })).toBe(8);
        const single = layoutBuild([{ width: 94, height: 282.75, items: 2 }], QHD).categories[0]!.chips;
        expect(chipInsertion(single, 1, { x: 2000, y: centre(single[0]!).y })).toBe(1);
        expect(chipInsertion(single, 1, { x: 0, y: centre(single[1]!).y })).toBe(1);
    });
});

describe("categoryInsertion", () => {
    // 1440p: three 340-wide boxes share row 0 (the middle one taller), the 600-wide one wraps to row 1.
    const boxes = layoutBuild(
        [
            { width: 340, height: 162.75, items: 0 },
            { width: 340, height: 282.75, items: 0 },
            { width: 340, height: 162.75, items: 0 },
            { width: 600, height: 162.75, items: 0 },
        ],
        QHD,
    ).categories.map(({ box }) => box);
    const row0 = centre(boxes[0]!).y;
    const row1 = centre(boxes[3]!).y;

    it("inserts at 0 into an empty build", () => {
        expect(categoryInsertion([], { x: 10, y: 10 })).toBe(0);
    });

    it("inserts before a box left of its centre and after it right of its centre", () => {
        expect(categoryInsertion(boxes, { x: centre(boxes[0]!).x - 1, y: row0 })).toBe(0);
        expect(categoryInsertion(boxes, { x: centre(boxes[1]!).x + 1, y: row0 })).toBe(2);
        expect(categoryInsertion(boxes, { x: centre(boxes[3]!).x - 1, y: row1 })).toBe(3);
    });

    it("counts a point on a box's centre as after it", () => {
        expect(categoryInsertion(boxes, { x: centre(boxes[2]!).x, y: row0 })).toBe(3);
    });

    it("picks the row by the flow row, not the box under the point", () => {
        const underShortBox = boxes[0]!.y + boxes[0]!.height + 40;
        expect(underShortBox).toBeLessThan(boxes[1]!.y + boxes[1]!.height);
        expect(categoryInsertion(boxes, { x: centre(boxes[0]!).x - 1, y: underShortBox })).toBe(0);
    });

    it("inserts after the last box of a row when the point is past it", () => {
        expect(categoryInsertion(boxes, { x: 2000, y: row0 })).toBe(3);
        expect(categoryInsertion(boxes, { x: 2000, y: row1 })).toBe(4);
    });

    it("splits the gap between flow rows at its middle, the middle going to the lower row", () => {
        const gapMiddle = (boxes[1]!.y + boxes[1]!.height + boxes[3]!.y) / 2;
        expect(categoryInsertion(boxes, { x: 0, y: gapMiddle - 0.5 })).toBe(0);
        expect(categoryInsertion(boxes, { x: 0, y: gapMiddle })).toBe(3);
    });

    it("inserts at the end when the point is below every row", () => {
        expect(categoryInsertion(boxes, { x: 0, y: boxes[3]!.y + boxes[3]!.height + 1 })).toBe(4);
    });

    it("treats each wrapped box as its own row", () => {
        const stacked = layoutBuild(
            [1059, 1059, 1059].map((width) => ({ width, height: 162.75, items: 0 })),
            QHD,
        ).categories.map(({ box }) => box);
        expect(categoryInsertion(stacked, { x: 2000, y: centre(stacked[0]!).y })).toBe(1);
        expect(categoryInsertion(stacked, { x: 0, y: centre(stacked[1]!).y })).toBe(1);
        expect(categoryInsertion(stacked, { x: 2000, y: centre(stacked[2]!).y })).toBe(3);
    });
});

describe("widestOnRow", () => {
    it("is the widest quarter width that still shares the row in the shop and the preview", () => {
        const limit = widestOnRow([ew(3)])!;
        expect(limit * 4).toBe(Math.round(limit * 4));
        expect(sharesRowEverywhere([ew(3), limit])).toBe(true);
        expect(sharesRowEverywhere([ew(3), limit + 0.25])).toBe(false);
    });

    it("counts fractional widths the way the game rounds them", () => {
        const others = [257.75, 175.5];
        const limit = widestOnRow(others)!;
        expect(limit * 4).toBe(Math.round(limit * 4));
        expect(sharesRowEverywhere([...others, limit])).toBe(true);
        expect(sharesRowEverywhere([...others, limit + 0.25])).toBe(false);
    });

    it("is the safe maximum with nothing else on the row", () => {
        expect(widestOnRow([])).toBe(SAFE_MAX_WIDTH_EVERYWHERE);
    });

    it("is null when the others already fill the row", () => {
        expect(widestOnRow([SAFE_MAX_WIDTH_EVERYWHERE])).toBeNull();
    });
});

describe("rowEdge", () => {
    it("is inside until the pointer passes the edge", () => {
        expect(rowEdge(-40)).toBe("inside");
        expect(rowEdge(0)).toBe("inside");
    });

    it("holds the pull up to the break-through distance", () => {
        expect(BREAK_THROUGH_PX).toBe(64);
        expect(rowEdge(1)).toBe("pulling");
        expect(rowEdge(BREAK_THROUGH_PX)).toBe("pulling");
    });

    it("breaks through past it, and pulling back re-engages the stop", () => {
        expect(rowEdge(BREAK_THROUGH_PX + 0.5)).toBe("through");
        expect(rowEdge(BREAK_THROUGH_PX - 0.5)).toBe("pulling");
    });
});

describe("stopAtEdge", () => {
    it("stops a free width exactly at the edge", () => {
        expect(stopAtEdge(800, 790.5, true)).toBe(790.5);
        expect(stopAtEdge(700, 790.5, true)).toBe(700);
    });

    it("stops a snapped width at the widest safe width under the edge", () => {
        expect(ew(9)).toBeLessThanOrEqual(790.5);
        expect(ew(10)).toBeGreaterThan(790.5);
        expect(stopAtEdge(ew(10), 790.5, false)).toBe(ew(9));
        expect(stopAtEdge(ew(9), 790.5, false)).toBe(ew(9));
        expect(stopAtEdge(ew(5), 790.5, false)).toBe(ew(5));
    });
});

describe("edgeWidth", () => {
    it("snaps as usual without a stop", () => {
        expect(edgeWidth(900, false, null, 1)).toEqual({ width: snapWidth(900, false), edge: "inside" });
    });

    it("has no stop for a category alone on its row", () => {
        expect(edgeWidth(1200, false, SAFE_MAX_WIDTH_EVERYWHERE, 1)).toEqual({ width: ew(12), edge: "inside" });
        expect(edgeWidth(1050, true, SAFE_MAX_WIDTH_EVERYWHERE, 1)).toEqual({ width: 1050, edge: "inside" });
    });

    it("follows the pointer inside the edge", () => {
        expect(edgeWidth(600.3, true, 790.5, 1)).toEqual({ width: 600.25, edge: "inside" });
    });

    it("holds at the edge while the pull is short of the break-through distance", () => {
        expect(edgeWidth(790.5 + 30, true, 790.5, 2)).toEqual({ width: 790.5, edge: "pulling" });
        expect(edgeWidth(790.5 + 30, false, 790.5, 2)).toEqual({ width: ew(9), edge: "pulling" });
    });

    it("measures the pull in screen px", () => {
        expect(edgeWidth(790.5 + 40, true, 790.5, 1).edge).toBe("pulling");
        expect(edgeWidth(790.5 + 40, true, 790.5, 2).edge).toBe("through");
    });

    it("lets the width past the edge once through, so the category wraps", () => {
        expect(edgeWidth(790.5 + 70, true, 790.5, 1)).toEqual({ width: 860.5, edge: "through" });
        expect(edgeWidth(790.5 + 70, false, 790.5, 1)).toEqual({ width: snapWidth(860.5, false), edge: "through" });
    });

    it("never lands back under the edge once through", () => {
        // 777 snaps down to 9 columns, which would still fit under a 770 edge.
        expect(snapWidth(777, false)).toBe(ew(9));
        expect(ew(9)).toBeLessThanOrEqual(770);
        expect(edgeWidth(777, false, 770, 10)).toEqual({ width: ew(10), edge: "through" });
    });
});

describe("dragStop", () => {
    it("is the row limit when the row shares at every scale", () => {
        expect(dragStop(790.5, ew(4))).toBe(790.5);
    });

    it("is none when the row already wraps at some scale", () => {
        expect(dragStop(null, ew(4))).toBeNull();
        expect(dragStop(300, ew(4))).toBeNull();
    });

    it("never stops a stored width that sits between quarter units", () => {
        expect(dragStop(277, 277.1)).toBe(277.1);
    });
});
