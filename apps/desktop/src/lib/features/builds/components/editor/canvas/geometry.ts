import { sharesRowEverywhere, type Box, type Screen } from "@deadlock-plus/build-layout";
import { geometry } from "@deadlock-plus/build-layout/layout";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { categoryInsertion, chipInsertion } from "../../../editor/resize";
import { fitEverywhere } from "../../../editor/row-ops";
import { fitSize, shopView, type ShopCategoryView, type ShopView } from "../../../shop-view";
import { zoomScale, type Zoom } from "./zoom";

export type DropTarget =
    { kind: "items"; category: number; index: number } | { kind: "new-category" } | { kind: "category"; index: number };

export interface Bar {
    x: number;
    y: number;
    height: number;
}

type Point = { x: number; y: number };

const EMPTY_FIT = fitEverywhere(0);
const TILE: ModCategoryView = {
    mods: [],
    name: "",
    description: "",
    width: EMPTY_FIT.width,
    height: EMPTY_FIT.height,
    optional: false,
};

/**
 * The shop's view at `zoom`, plus where the new-category drop tile sits: in the flow as a new empty category would.
 * `view.contentHeight` makes room for the tile; `bareHeight` is the build's own height; `fit` is the scale that
 * fills `available`.
 */
export function canvasView(
    categories: readonly ModCategoryView[],
    screen: Screen,
    available: number,
    zoom: Zoom = "fit",
): { view: ShopView; tile: Box; bareHeight: number; fit: number } {
    const page = geometry(screen.height).contentWidth;
    const fit = available / page;
    const withTile = shopView([...categories, TILE], screen, zoomScale(zoom, fit) * page, "fit");
    const tile = withTile.categories.pop()!;
    const margin = geometry(screen.height).margin * withTile.scale;
    const bottom = Math.max(0, ...withTile.categories.map(({ box }) => box.y + box.height + margin));
    return { view: withTile, tile: tile.box, bareHeight: bottom, fit };
}

/** Chip boxes for `count` slots, continuing the category's grid past its last chip. */
export function slotBoxes(view: ShopView, category: ShopCategoryView, count: number, screen: Screen): Box[] {
    const g = geometry(screen.height);
    const s = view.scale;
    const left = category.box.x + (g.frame + g.chipMargin) * s;
    const top = category.box.y + (g.frame + g.header + g.chipMargin) * s;
    return Array.from(
        { length: count },
        (_, i) =>
            category.chips[i] ?? {
                x: left + (i % category.columns) * g.pitch.x * s,
                y: top + Math.floor(i / category.columns) * g.pitch.y * s,
                width: g.chip.width * s,
                height: g.chip.height * s,
            },
    );
}

/**
 * Size in game units as the file would store it. A missing width is our Fit width (what the shop view draws);
 * a missing height is read back from the drawn box, which is exact to the px the size tag rounds to.
 */
export function storedSize(category: ModCategoryView, view: ShopCategoryView, unit: number) {
    return {
        width: category.width ?? fitSize(category.mods.length).width,
        height: category.height ?? view.box.height / unit,
    };
}

function inside(box: Box, point: Point, slack = 0): boolean {
    return (
        point.x >= box.x - slack &&
        point.x <= box.x + box.width + slack &&
        point.y >= box.y - slack &&
        point.y <= box.y + box.height + slack
    );
}

/** `point` is in canvas px, the same space as the view's boxes. */
export function dropTarget(view: ShopView, tile: Box, kind: "items" | "category", point: Point): DropTarget | null {
    if (view.categories.length === 0) return { kind: "new-category" };
    if (kind === "category") {
        return {
            kind: "category",
            index: categoryInsertion(
                view.categories.map((c) => c.box),
                point,
            ),
        };
    }
    const category = view.categories.find((c) => inside(c.box, point));
    if (category)
        return {
            kind: "items",
            category: category.index,
            index: chipInsertion(category.chips, category.columns, point),
        };
    if (inside(tile, point)) return { kind: "new-category" };
    return null;
}

export function categoryBar(view: ShopView, index: number, screen: Screen): Bar {
    const margin = geometry(screen.height).margin * view.scale;
    const before = view.categories[index];
    if (before) return { x: before.box.x - margin, y: before.box.y, height: before.box.height };
    const last = view.categories.at(-1);
    if (!last) return { x: 0, y: 0, height: 0 };
    return { x: last.box.x + last.box.width + margin, y: last.box.y, height: last.box.height };
}

/** `slots` must reach at least `index + 1` boxes. */
export function itemCaret(slots: readonly Box[], index: number, view: ShopView, screen: Screen): Bar {
    const margin = geometry(screen.height).chipMargin * view.scale;
    const slot = slots[index]!;
    return { x: slot.x - margin, y: slot.y, height: slot.height };
}

/**
 * Horizontal px offsets that open a gap at an insertion caret: the chip before it moves left, the chips after it in
 * the same row move right. Appending (no chip at `dropIndex`) moves nothing; the empty slot shows the drop instead.
 */
export function chipShifts(chips: readonly Box[], dropIndex: number | null, gap: number): number[] {
    const at = dropIndex === null ? undefined : chips[dropIndex];
    return chips.map((chip, i) => {
        if (!at || chip.y !== at.y) return 0;
        if (i >= dropIndex!) return gap;
        return i === dropIndex! - 1 ? -gap : 0;
    });
}

/** Categories whose flow row at this screen would wrap at another scale. */
export function rowWarnings(view: ShopView, widths: readonly number[]): Set<number> {
    const rows = new Map<number, number[]>();
    for (const category of view.categories) {
        const row = rows.get(category.box.y) ?? [];
        row.push(category.index);
        rows.set(category.box.y, row);
    }
    const warned = new Set<number>();
    for (const row of rows.values()) {
        if (!sharesRowEverywhere(row.map((i) => widths[i]!))) for (const i of row) warned.add(i);
    }
    return warned;
}
