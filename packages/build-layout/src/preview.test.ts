import { describe, expect, it } from "vitest";
import { geometry, layoutBuild, type BuildCategory, type BuildLayout, type Screen } from "./layout";
import {
    MAX_COLUMNS_EVERYWHERE,
    SAFE_MAX_WIDTH_EVERYWHERE,
    layoutPreview,
    minHeightForRowsEverywhere,
    minWidthForColumnsEverywhere,
    previewColumnsAtEveryScale,
    previewGeometry,
    sharesRowEverywhere,
} from "./preview";
import { columnsAtEveryScale, sharesRowAtEveryScale } from "./safe";

const FHD: Screen = { width: 1920, height: 1080 };
const QHD: Screen = { width: 2560, height: 1440 };
const UHD: Screen = { width: 3840, height: 2160 };
const SCREENS = [FHD, QHD, UHD];

interface Px {
    overhead: number;
    pitch: number;
    gap: number;
    /** Border, header and mods padding, top and bottom. */
    fixed: number;
    row: number;
    cap: number;
}

/**
 * The findings' per-scale table, typed in by hand as an oracle independent of the code. `worst` rounds every
 * unmeasured CSS length up; at 1440p every one is measured, so both agree.
 */
const TABLE: { screen: Screen; content: number; model: Px; worst: Px }[] = [
    {
        screen: FHD,
        content: 660,
        model: { overhead: 8, pitch: 52, gap: 6, fixed: 27, row: 76, cap: 654 },
        worst: { overhead: 10, pitch: 52, gap: 8, fixed: 30, row: 76, cap: 652 },
    },
    {
        screen: QHD,
        content: 881,
        model: { overhead: 10, pitch: 70, gap: 8, fixed: 36, row: 102, cap: 873 },
        worst: { overhead: 10, pitch: 70, gap: 8, fixed: 36, row: 102, cap: 873 },
    },
    {
        screen: UHD,
        content: 1320,
        model: { overhead: 16, pitch: 104, gap: 12, fixed: 55, row: 152, cap: 1308 },
        worst: { overhead: 18, pitch: 104, gap: 14, fixed: 57, row: 152, cap: 1306 },
    },
];

/** Stored units -> exact px under 63% of the screen scale. */
const exactPx = (units: number, { height }: Screen) => (units * 63 * height) / 108000;

const ROUNDINGS = { nearest: Math.round, up: Math.ceil, down: Math.floor } as const;
type Rounding = keyof typeof ROUNDINGS;
const CASES = TABLE.flatMap((scale) =>
    (["model", "worst"] as const).flatMap((css) =>
        (Object.keys(ROUNDINGS) as Rounding[]).map((rounding) => ({ scale, css, rounding })),
    ),
);

/** Chip pitches that fit across the box; the game still draws one column when this is 0, clipping the chip. */
function oracleChipsAcross(width: number, { scale, css, rounding }: (typeof CASES)[number]): number {
    const t = scale[css];
    const drawn = Math.min(ROUNDINGS[rounding](exactPx(width, scale.screen)), t.cap);
    return Math.floor((drawn - t.overhead) / t.pitch);
}

const oracleColumns = (width: number, c: (typeof CASES)[number]) => Math.max(1, oracleChipsAcross(width, c));

function oracleRows(height: number, { scale, css, rounding }: (typeof CASES)[number]): number {
    const t = scale[css];
    return Math.floor((ROUNDINGS[rounding](exactPx(height, scale.screen)) - t.fixed) / t.row);
}

/** The worst case for packing: every box rounds up and every unmeasured length too. */
function oracleSharesRow(widths: readonly number[]): boolean {
    return TABLE.every(({ screen, content, worst }) => {
        const used = widths.reduce((sum, w) => sum + Math.min(Math.ceil(exactPx(w, screen)), worst.cap) + worst.gap, 0);
        return used <= content;
    });
}

function shopFullRows(height: number, screen: Screen): number {
    const g = geometry(screen.height);
    const [drawn] = layoutBuild([{ width: 200, height, items: 1 }], screen).categories;
    return Math.floor((drawn.box.height - 2 * g.frame - g.header) / g.pitch.y);
}

function rowSizes(layout: BuildLayout): number[] {
    const sizes = new Map<number, number>();
    for (const { box } of layout.categories) sizes.set(box.y, (sizes.get(box.y) ?? 0) + 1);
    return [...sizes.entries()].sort(([a], [b]) => a - b).map(([, size]) => size);
}

/** Chip rows that end inside the category's border box; the rest are clipped. */
function shownRows({ box, chips }: BuildLayout["categories"][number]): number {
    return new Set(chips.filter((c) => c.y + c.height <= box.y + box.height).map((c) => c.y)).size;
}

const LANE: BuildCategory = { width: 258, height: 162.75, items: 3 };
const MID: BuildCategory = { width: 340, height: 162.75, items: 4 };
const LATE: BuildCategory = { width: 176, height: 282.75, items: 4 };
const BUILD_60 = [LANE, MID, LATE];

const COLUMN_COUNTS = Array.from({ length: 12 }, (_, i) => i + 1);
const ROW_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];

describe("layoutPreview, measured at 1440p (build 60, one screenshot)", () => {
    const layout = layoutPreview(BUILD_60, QHD);
    const [lane, mid, late] = layout.categories;

    it("lays categories out in an 881 px container (907 px overview less 13 px padding each side)", () => {
        expect(layout.contentWidth).toBe(881);
    });

    it("draws Lane 258 x 162.75 as 217 x 137, Mid 340 as 286 x 137 and Late 176 x 282.75 as 148 x 238", () => {
        expect(lane.box).toEqual({ x: 4, y: 4, width: 217, height: 137 });
        expect(mid.box).toEqual({ x: 229, y: 4, width: 286, height: 137 });
        expect(late.box).toEqual({ x: 523, y: 4, width: 148, height: 238 });
        expect(rowSizes(layout)).toEqual([3]);
    });

    it("leaves an 8 px gap between categories", () => {
        expect(mid.box.x - (lane.box.x + lane.box.width)).toBe(8);
        expect(late.box.x - (mid.box.x + mid.box.width)).toBe(8);
    });

    it("gives Lane 2, Mid 3 and Late 1 columns, where the shop gives 3, 4 and 2", () => {
        expect(layout.categories.map((c) => c.columns)).toEqual([2, 3, 1]);
        expect(layoutBuild(BUILD_60, QHD).categories.map((c) => c.columns)).toEqual([3, 4, 2]);
    });

    it("rounds the 2 border, 26 header, 3 mods padding and 3 chip margin once at 0.84", () => {
        const g = previewGeometry(QHD.height);
        expect(g.header).toBe(26);
        expect(g.frame).toBe(2 + 3);
        expect(g.chipMargin).toBe(3);
        expect(g.margin).toBe(4);
    });

    it("draws 64 x 96 chips on a 70 x 102 pitch, the first 8 px in and 2 + 26 + 3 + 3 px down", () => {
        for (const c of layout.categories) {
            expect(c.chips[0]).toEqual({ x: c.box.x + 8, y: c.box.y + 34, width: 64, height: 96 });
        }
        expect(lane.chips[1].x - lane.chips[0].x).toBe(70);
        expect(mid.chips[2].x - mid.chips[1].x).toBe(70);
        expect(late.chips[1].y - late.chips[0].y).toBe(102);
    });

    it("clips Late after two full rows and starts Lane's second row on its bottom border", () => {
        expect(shownRows(late)).toBe(2);
        expect(late.chips[2].y).toBe(late.box.y + late.box.height);
        expect(shownRows(lane)).toBe(1);
        expect(lane.chips[2].y).toBe(lane.box.y + lane.box.height - 1);
    });
});

describe("layoutPreview, predicted at 1080p and 2160p (unmeasured)", () => {
    it("lays categories out in 660 and 1320 px with 6 and 12 px gaps", () => {
        for (const [screen, content, gap] of [
            [FHD, 660, 6],
            [UHD, 1320, 12],
        ] as const) {
            const layout = layoutPreview([LANE, MID], screen);
            const [a, b] = layout.categories.map((c) => c.box);
            expect(layout.contentWidth).toBe(content);
            expect(b.x - (a.x + a.width)).toBe(gap);
        }
    });

    it("draws 48 x 72 chips on a 52 x 76 pitch at 1080p and 96 x 144 on 104 x 152 at 2160p", () => {
        for (const [screen, chip, pitch, first] of [
            [FHD, [48, 72], [52, 76], [1 + 3 + 2, 1 + 19 + 3 + 2]],
            [UHD, [96, 144], [104, 152], [3 + 5 + 4, 3 + 39 + 5 + 4]],
        ] as const) {
            const [c] = layoutPreview([{ width: 347, height: 531, items: 8 }], screen).categories;
            expect(c.chips[0]).toEqual({
                x: c.box.x + first[0],
                y: c.box.y + first[1],
                width: chip[0],
                height: chip[1],
            });
            expect(c.chips[1].x - c.chips[0].x).toBe(pitch[0]);
            expect(c.chips[c.columns].y - c.chips[0].y).toBe(pitch[1]);
        }
    });
});

describe("layoutPreview, shop-safe widths (1440p measured for 176, 258, 340; the rest predicted)", () => {
    it.each(COLUMN_COUNTS.slice(1))("shows 82n + 12 with n - 1 columns for n = %s at every scale", (n) => {
        for (const screen of SCREENS) {
            const [c] = layoutPreview([{ width: 82 * n + 12, height: 400, items: n }], screen).categories;
            expect(c.columns).toBe(n - 1);
        }
    });

    it("caps at 873 px at 1440p from 1040 (predicted)", () => {
        expect(layoutPreview([{ width: 1039, height: 200, items: 1 }], QHD).categories[0]).toMatchObject({
            capped: false,
            box: { width: 873 },
        });
        expect(layoutPreview([{ width: 1040, height: 200, items: 1 }], QHD).categories[0]).toMatchObject({
            capped: true,
            box: { width: 873 },
        });
    });

    it("wraps a row the shop keeps (600 + 448)", () => {
        expect(
            rowSizes(
                layoutBuild(
                    [LANE, LANE].map((c, i) => ({ ...c, width: [600, 448][i] })),
                    QHD,
                ),
            ),
        ).toEqual([2]);
        expect(
            rowSizes(
                layoutPreview(
                    [LANE, LANE].map((c, i) => ({ ...c, width: [600, 448][i] })),
                    QHD,
                ),
            ),
        ).toEqual([1, 1]);
    });
});

describe("minWidthForColumnsEverywhere", () => {
    it("is 99, 181, 264 and 347 for 1 to 4 columns", () => {
        expect([1, 2, 3, 4].map(minWidthForColumnsEverywhere)).toEqual([99, 181, 264, 347]);
    });

    it.each(COLUMN_COUNTS)("matches ceil(max(82.54n + 15.88, 83.34n + 11.91)) for %s columns", (n) => {
        expect(minWidthForColumnsEverywhere(n)).toBe(Math.ceil(Math.max(82.54 * n + 15.88, 83.34 * n + 11.91)));
    });

    it.each(COLUMN_COUNTS)("shows exactly %s columns in shop and preview at every scale and rounding", (n) => {
        const width = minWidthForColumnsEverywhere(n);
        for (const c of CASES)
            expect(oracleColumns(width, c), `${c.scale.screen.height} ${c.css} ${c.rounding}`).toBe(n);
        for (const screen of SCREENS) {
            const item = [{ width, height: 400, items: n }];
            expect(layoutPreview(item, screen).categories[0].columns).toBe(n);
            expect(layoutBuild(item, screen).categories[0].columns).toBe(n);
        }
        expect(columnsAtEveryScale(width)).toBe(n);
        expect(previewColumnsAtEveryScale(width)).toBe(n);
    });

    it.each(COLUMN_COUNTS)("is the smallest whole width that fits %s full chips across in the worst case", (n) => {
        const narrower = minWidthForColumnsEverywhere(n) - 1;
        const worst = CASES.filter((c) => c.css === "worst" && c.rounding === "down");
        expect(worst.some((c) => oracleChipsAcross(narrower, c) < n)).toBe(true);
        if (n > 1) {
            expect(Math.min(previewColumnsAtEveryScale(narrower), columnsAtEveryScale(narrower))).toBeLessThan(n);
        }
    });
});

describe("previewColumnsAtEveryScale", () => {
    it("counts the worst case: 180 loses the second column at 1080p, 98 still draws one (clipped)", () => {
        expect(previewColumnsAtEveryScale(98)).toBe(1);
        expect(previewColumnsAtEveryScale(180)).toBe(1);
        expect(previewColumnsAtEveryScale(181)).toBe(2);
    });

    it("gives the screenshot's 2, 3 and 1 columns for 258, 340 and 176", () => {
        expect([258, 340, 176].map(previewColumnsAtEveryScale)).toEqual([2, 3, 1]);
    });
});

describe("minHeightForRowsEverywhere", () => {
    it("is 169, 289, 410 and 531 for 1 to 4 rows", () => {
        expect([1, 2, 3, 4].map(minHeightForRowsEverywhere)).toEqual([169, 289, 410, 531]);
    });

    it.each(ROW_COUNTS)("matches ceil(max(47.62 + 120.63r, 42.86 + 121.43r)) for %s rows", (r) => {
        expect(minHeightForRowsEverywhere(r)).toBe(Math.ceil(Math.max(47.62 + 120.63 * r, 42.86 + 121.43 * r)));
    });

    it.each(ROW_COUNTS)("shows exactly %s full rows in shop and preview at every scale and rounding", (r) => {
        const height = minHeightForRowsEverywhere(r);
        for (const c of CASES) expect(oracleRows(height, c), `${c.scale.screen.height} ${c.css} ${c.rounding}`).toBe(r);
        for (const screen of SCREENS) expect(shopFullRows(height, screen)).toBe(r);
    });

    it.each(ROW_COUNTS)("is the smallest whole height that keeps %s full rows in the worst case", (r) => {
        const shorter = minHeightForRowsEverywhere(r) - 1;
        const worst = CASES.filter((c) => c.css === "worst" && c.rounding === "down");
        expect(worst.some((c) => oracleRows(shorter, c) < r)).toBe(true);
    });
});

describe("sharesRowEverywhere", () => {
    it("keeps build 60's 258 + 340 + 176 on one row, as the screenshot shows", () => {
        expect(sharesRowEverywhere([258, 340, 176])).toBe(true);
    });

    it("rejects 600 + 448, which the shop keeps on one row", () => {
        expect(sharesRowAtEveryScale([600, 448])).toBe(true);
        expect(sharesRowEverywhere([600, 448])).toBe(false);
    });

    it("accepts a single category, even past the cap", () => {
        expect(sharesRowEverywhere([1200])).toBe(true);
    });

    it("agrees with the worst-case table and the shop on sampled pairs and triples", () => {
        const widths = Array.from({ length: 60 }, (_, i) => 99 + i * 15.25);
        for (const a of widths) {
            for (const b of widths) {
                for (const set of [
                    [a, b],
                    [a, b, 181],
                    [a, 99, b],
                ]) {
                    expect(sharesRowEverywhere(set), set.join(" + ")).toBe(
                        oracleSharesRow(set) && sharesRowAtEveryScale(set),
                    );
                }
            }
        }
    });

    it("accepts every row the findings' rule sum(w) + 15k <= 1047 allows", () => {
        for (let a = 99; a <= 1033; a += 7.25) {
            for (let b = 99; a + b + 30 <= 1047; b += 3.5) {
                expect(sharesRowEverywhere([a, b]), `${a} + ${b}`).toBe(true);
                const c = 1047 - 45 - a - b;
                if (c >= 99) expect(sharesRowEverywhere([a, b, c]), `${a} + ${b} + ${c}`).toBe(true);
            }
        }
    });

    it("finds the widest second category beside 264 to the quarter", () => {
        let widest = 99;
        while (sharesRowEverywhere([264, widest + 0.25])) widest += 0.25;
        expect(oracleSharesRow([264, widest])).toBe(true);
        expect(oracleSharesRow([264, widest + 0.25])).toBe(false);
    });
});

describe("SAFE_MAX_WIDTH_EVERYWHERE", () => {
    it("is the widest quarter width neither view caps at any scale or rounding", () => {
        for (const { scale, css, rounding } of CASES.filter((c) => c.rounding !== "down")) {
            const px = ROUNDINGS[rounding](exactPx(SAFE_MAX_WIDTH_EVERYWHERE, scale.screen));
            expect(px, `${scale.screen.height} ${css} ${rounding}`).toBeLessThanOrEqual(scale[css].cap);
        }
        for (const screen of SCREENS) {
            const item = [{ width: SAFE_MAX_WIDTH_EVERYWHERE, height: 200, items: 1 }];
            expect(layoutPreview(item, screen).categories[0].capped).toBe(false);
            expect(layoutBuild(item, screen).categories[0].capped).toBe(false);
        }
        const wider = SAFE_MAX_WIDTH_EVERYWHERE + 0.25;
        expect(TABLE.some(({ screen, worst }) => Math.ceil(exactPx(wider, screen)) > worst.cap)).toBe(true);
    });

    it("is at least the findings' safe 1033", () => {
        expect(SAFE_MAX_WIDTH_EVERYWHERE).toBeGreaterThanOrEqual(1033);
    });
});

describe("MAX_COLUMNS_EVERYWHERE", () => {
    it("is the most columns a width up to SAFE_MAX_WIDTH_EVERYWHERE keeps", () => {
        expect(MAX_COLUMNS_EVERYWHERE).toBe(12);
        expect(minWidthForColumnsEverywhere(12)).toBeLessThanOrEqual(SAFE_MAX_WIDTH_EVERYWHERE);
        expect(minWidthForColumnsEverywhere(13)).toBeGreaterThan(SAFE_MAX_WIDTH_EVERYWHERE);
    });
});
