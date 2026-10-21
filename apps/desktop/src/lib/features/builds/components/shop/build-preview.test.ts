import { describe, expect, it, vi } from "vitest";
import type { Screen } from "@deadlock-plus/build-layout";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { shopView, type ChipItem } from "../../shop-view";
import {
    ART_HEIGHT,
    CORNER_SIZE,
    MIN_TEXT_PX,
    PLATES,
    coverRect,
    createImageCache,
    previewPlan,
    usedShare,
    type PreviewOp,
    type PreviewPalette,
} from "./build-preview";

const QHD: Screen = { width: 2560, height: 1440 };

function category(width: number | null, items: number, fields: Partial<ModCategoryView> = {}): ModCategoryView {
    return {
        mods: Array.from({ length: items }, (_, i) => ({
            abilityId: i + 1,
            annotation: null,
            requiredFlexSlots: null,
            sellPriority: null,
            imbueTargetAbilityId: null,
        })),
        name: "",
        description: "",
        width,
        height: 183.75,
        optional: false,
        ...fields,
    };
}

const PALETTE: PreviewPalette = {
    border: "#111",
    category: "#222",
    optional: "#234",
    header: "#333",
    name: "#eee",
    warning: "#f80",
    removed: "#f801",
    sans: "Sans",
    heading: "Heading",
};

/** Every character is half its font size wide. */
const measure = (text: string, font: string) => text.length * Number(/(\d+(\.\d+)?)px/.exec(font)![1]) * 0.5;

const item = (fields: Partial<ChipItem> = {}): ChipItem => ({
    name: "Extended Magazine",
    art: "mag.png",
    slot: "weapon",
    tier: 1,
    active: false,
    ...fields,
});

function plan(categories: ModCategoryView[], items: (ChipItem | undefined)[][], available: number) {
    const view = shopView(categories, QHD, available, "fit");
    return { view, layers: previewPlan({ view, categories, items, palette: PALETTE, measure }) };
}

const ofKind = <K extends PreviewOp["kind"]>(ops: PreviewOp[], kind: K) =>
    ops.filter((op): op is Extract<PreviewOp, { kind: K }> => op.kind === kind);

describe("usedShare", () => {
    it("is the share of the shop's width the categories reach, so the preview can crop the empty right side", () => {
        const view = shopView([category(600, 3)], QHD, 1, "fit");
        const right = view.categories[0]!.box.x + view.categories[0]!.box.width;
        expect(usedShare(view)).toBeCloseTo(right / view.contentWidth);
        expect(usedShare(view)).toBeLessThan(1);
    });

    it("is the whole width for a build without categories", () => {
        expect(usedShare(shopView([], QHD, 1, "fit"))).toBe(1);
    });
});

describe("previewPlan", () => {
    it("draws one layer per category, clipped to its box, with its fill and an inside border", () => {
        const { view, layers } = plan(
            [category(600, 1), category(449, 1, { optional: true })],
            [[item()], [item()]],
            400,
        );
        expect(layers.map((l) => l.clip)).toEqual(view.categories.map((c) => c.box));
        const [plain, optional] = layers.map((l) => ofKind(l.ops, "box")[0]!);
        expect(plain.fill).toBe(PALETTE.category);
        expect(optional.fill).toBe(PALETTE.optional);
        const frame = ofKind(layers[0]!.ops, "frame")[0]!;
        expect(frame).toMatchObject({ ...view.categories[0]!.box, lineWidth: view.border, color: PALETTE.border });
    });

    it("draws the header bar inside the border at the category's header height", () => {
        const { view, layers } = plan([category(600, 1)], [[item()]], 400);
        const { box, header } = view.categories[0]!;
        expect(ofKind(layers[0]!.ops, "box")[1]).toMatchObject({
            x: box.x + view.border,
            y: box.y + view.border,
            width: box.width - 2 * view.border,
            height: header,
            fill: PALETTE.header,
        });
    });

    it("draws a chip as its slot and tier's plate, the art over its top and the tier corner", () => {
        const { view, layers } = plan([category(600, 1)], [[item({ slot: "spirit", tier: 3 })]], 400);
        const chip = view.categories[0]!.chips[0]!;
        const boxes = ofKind(layers[0]!.ops, "box");
        expect(boxes).toContainEqual(expect.objectContaining({ ...chip, fill: PLATES.spirit[3] }));
        expect(ofKind(layers[0]!.ops, "art")[0]).toMatchObject({
            src: "mag.png",
            x: chip.x,
            y: chip.y,
            width: chip.width,
            height: ART_HEIGHT * view.unit,
            round: false,
        });
        expect(ofKind(layers[0]!.ops, "corner")[0]).toMatchObject({
            x: chip.x + chip.width,
            y: chip.y,
            size: CORNER_SIZE * view.unit,
        });
    });

    it("draws an active item's art as a circle as wide as the chip, at most 74 units", () => {
        const { view, layers } = plan([category(600, 1)], [[item({ active: true })]], 2560);
        const chip = view.categories[0]!.chips[0]!;
        const art = ofKind(layers[0]!.ops, "art")[0]!;
        const size = Math.min(chip.width, 74 * view.unit);
        expect(art).toMatchObject({ round: true, width: size, height: size, y: chip.y });
        expect(art.x).toBeCloseTo(chip.x + (chip.width - size) / 2);
    });

    it("skips every text too small to read and draws it once the preview is large enough", () => {
        const small = plan([category(600, 1, { name: "Lane" })], [[item()]], 300);
        expect(ofKind(small.layers[0]!.ops, "text")).toEqual([]);

        const large = plan([category(600, 1, { name: "Lane" })], [[item()]], 2560);
        const texts = ofKind(large.layers[0]!.ops, "text");
        expect(texts.map((t) => t.lines.join(" "))).toEqual(["Lane", "Extended Magazine"]);
        for (const text of texts) expect(text.size).toBeGreaterThanOrEqual(MIN_TEXT_PX);
    });

    it("draws a long name at the smallest readable size rather than leaving it out beside short ones", () => {
        const view = shopView([category(600, 2)], QHD, 2560, "fit");
        // Short names are drawn at their full size from this unit on; the long one would shrink below it.
        const unit = MIN_TEXT_PX / 15 + 0.01;
        const scaled = shopView([category(600, 2)], QHD, (2560 * unit) / view.unit, "fit");
        const long = "Bulletresistance Shredder";
        const layers = previewPlan({
            view: scaled,
            categories: [category(600, 2)],
            items: [[item({ name: "Mag" }), item({ name: long })]],
            palette: PALETTE,
            measure,
        });
        const texts = ofKind(layers[0]!.ops, "text");
        expect(texts.map((t) => t.lines.join("").replaceAll(" ", ""))).toEqual(["Mag", long.replaceAll(" ", "")]);
        expect(texts[1]!.size).toBe(MIN_TEXT_PX);
    });

    it("never breaks an item name inside a word: a word wider than the chip is squeezed to its width", () => {
        const large = shopView([category(600, 1)], QHD, 2560, "fit");
        const layers = previewPlan({
            view: large,
            categories: [category(600, 1)],
            items: [[item({ name: "Unstoppable Counterspellingly" })]],
            palette: PALETTE,
            measure: (text, font) => measure(text, font) * 4,
        });
        const text = ofKind(layers[0]!.ops, "text")[0]!;
        const chip = large.categories[0]!.chips[0]!;
        expect(text.lines).toEqual(["Unstoppable", "Counterspellingly"]);
        expect(text.maxWidth).toBeLessThan(chip.width);
        expect(text.maxWidth).toBeGreaterThan(0);
    });

    it("wraps the category name to its room and clips it to the header", () => {
        const name = "pick one of these after the lane";
        const { view, layers } = plan([category(264, 1, { name })], [[item()]], 2560);
        const text = ofKind(layers[0]!.ops, "text")[0]!;
        expect(text.lines.length).toBeGreaterThan(1);
        expect(text.lines.join(" ")).toBe(name);
        const { box, header } = view.categories[0]!;
        expect(text.clip).toEqual({
            x: box.x + view.border,
            y: box.y + view.border,
            width: box.width - 2 * view.border,
            height: header,
        });
    });

    it("draws an item the game no longer has as a dashed warning outline without art", () => {
        const { layers } = plan([category(600, 1)], [[undefined]], 400);
        const ops = layers[0]!.ops;
        expect(ofKind(ops, "art")).toEqual([]);
        expect(ofKind(ops, "frame")).toContainEqual(expect.objectContaining({ color: PALETTE.warning, dashed: true }));
    });

    it("leaves out the art of an item without one", () => {
        const { layers } = plan([category(600, 1)], [[item({ art: undefined })]], 400);
        expect(ofKind(layers[0]!.ops, "art")).toEqual([]);
    });
});

describe("coverRect", () => {
    it("crops a wide image's sides to fill the box", () => {
        expect(coverRect(200, 100, { width: 50, height: 50 })).toEqual({ sx: 50, sy: 0, sw: 100, sh: 100 });
    });

    it("crops a tall image's top and bottom", () => {
        expect(coverRect(100, 300, { width: 100, height: 50 })).toEqual({ sx: 0, sy: 125, sw: 100, sh: 50 });
    });
});

describe("createImageCache", () => {
    it("loads each source once, however many previews ask", async () => {
        const image = {} as HTMLImageElement;
        const load = vi.fn(async () => image);
        const cache = createImageCache(load);
        const first = cache.request("a.png");
        const second = cache.request("a.png");
        expect(first).toBe(second);
        expect(load).toHaveBeenCalledTimes(1);
        expect(cache.get("a.png")).toBeUndefined();
        await first;
        expect(cache.get("a.png")).toBe(image);
        expect(cache.settled("a.png")).toBe(true);
    });

    it("remembers a source that failed and never draws it", async () => {
        const load = vi.fn(async () => {
            throw new Error("404");
        });
        const cache = createImageCache(load);
        expect(cache.settled("gone.png")).toBe(false);
        await cache.request("gone.png");
        expect(cache.settled("gone.png")).toBe(true);
        cache.request("gone.png");
        expect(load).toHaveBeenCalledTimes(1);
        expect(cache.get("gone.png")).toBeUndefined();
    });
});
