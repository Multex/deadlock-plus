import { SAFE_MAX_WIDTH, layoutBuild, minWidthForColumns, type Box, type Screen } from "@deadlock-plus/build-layout";
import { REFERENCE_HEIGHT, geometry } from "@deadlock-plus/build-layout/layout";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";

export type ShopMode = "fit" | "native";

export type ChipSlot = "weapon" | "vitality" | "spirit";

export interface ChipItem {
    name: string;
    art?: string;
    slot: ChipSlot;
    tier: 1 | 2 | 3 | 4;
    active: boolean;
    imbue?: boolean;
}

export interface ShopCategoryView {
    box: Box;
    columns: number;
    rows: number;
    capped: boolean;
    chips: Box[];
    index: number;
}

export interface ShopView {
    scale: number;
    contentWidth: number;
    contentHeight: number;
    /** CSS px per game unit. */
    unit: number;
    /** Scaled px of the category border and the header bar inside it. */
    border: number;
    header: number;
    categories: ShopCategoryView[];
}

export interface FitSize {
    width: number;
    height: number;
    columns: number;
    rows: number;
}

/** Fit heights the game stores, measured at 1440p: 162.75 for one chip row, 120 more per row. */
const FIT_ONE_ROW_HEIGHT = 162.75;
const FIT_ROW_HEIGHT = 120;
const CATEGORY_BORDER = 2;

let maxColumns = 1;
while (minWidthForColumns(maxColumns + 1) <= SAFE_MAX_WIDTH) maxColumns++;

/**
 * Our Fit to items, not the game's: one row at the smallest width that keeps its columns at every scale
 * while that fits under the safe cap; past that, the fewest rows, columns split as evenly as they go.
 * Used for categories the file stores without a size.
 */
export function fitSize(items: number): FitSize {
    const rows = Math.max(1, Math.ceil(items / maxColumns));
    const columns = Math.max(1, Math.ceil(items / rows));
    return {
        width: minWidthForColumns(columns),
        height: FIT_ONE_ROW_HEIGHT + FIT_ROW_HEIGHT * (rows - 1),
        columns,
        rows,
    };
}

function scaled(box: Box, scale: number): Box {
    return { x: box.x * scale, y: box.y * scale, width: box.width * scale, height: box.height * scale };
}

export function shopView(
    categories: readonly ModCategoryView[],
    screen: Screen,
    available: number,
    mode: ShopMode,
): ShopView {
    const layout = layoutBuild(
        categories.map((category) => {
            const items = category.mods.length;
            const fit = category.width === null || category.height === null ? fitSize(items) : undefined;
            return { width: category.width ?? fit!.width, height: category.height ?? fit!.height, items };
        }),
        screen,
    );
    const scale = mode === "native" ? 1 : available / layout.contentWidth;
    const g = geometry(screen.height);
    const bottom = Math.max(0, ...layout.categories.map(({ box }) => box.y + box.height + g.margin));
    return {
        scale,
        contentWidth: layout.contentWidth * scale,
        contentHeight: bottom * scale,
        unit: (screen.height / REFERENCE_HEIGHT) * scale,
        border: Math.round((CATEGORY_BORDER * screen.height) / REFERENCE_HEIGHT) * scale,
        header: g.header * scale,
        categories: layout.categories.map((category, index) => ({
            box: scaled(category.box, scale),
            columns: category.columns,
            rows: category.rows,
            capped: category.capped,
            chips: category.chips.map((chip) => scaled(chip, scale)),
            index,
        })),
    };
}
