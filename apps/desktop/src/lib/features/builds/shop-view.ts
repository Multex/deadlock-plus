import { SAFE_MAX_WIDTH, layoutBuild, minWidthForColumns, type Box, type Screen } from "@deadlock-plus/build-layout";
import { REFERENCE_HEIGHT, columnsFor, geometry, widthPx } from "@deadlock-plus/build-layout/layout";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";

export type ShopMode = "fit" | "native";

export interface ShopCategoryView {
    box: Box;
    columns: number;
    rows: number;
    capped: boolean;
    /** Scaled px of this category's header bar, grown by its name's extra lines. */
    header: number;
    /** Chip rows the stored height cuts off. */
    clippedRows: number;
    chips: Box[];
    index: number;
}

export interface ShopView {
    scale: number;
    contentWidth: number;
    contentHeight: number;
    /** CSS px per game unit. */
    unit: number;
    /** Scaled px of the category border and a one-line header bar inside it. */
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
export const FIT_ONE_ROW_HEIGHT = 162.75;
export const FIT_ROW_HEIGHT = 120;
const CATEGORY_BORDER = 2;

/** The most columns a width under `SAFE_MAX_WIDTH` keeps at every scale. */
export const MAX_SAFE_COLUMNS = (() => {
    let columns = 1;
    while (minWidthForColumns(columns + 1) <= SAFE_MAX_WIDTH) columns++;
    return columns;
})();

/**
 * Our Fit to items, not the game's: one row at the smallest width that keeps its columns at every scale
 * while that fits under the safe cap; past that, the fewest rows, columns split as evenly as they go.
 * Used for categories the file stores without a size.
 */
export function fitSize(items: number): FitSize {
    const rows = Math.max(1, Math.ceil(items / MAX_SAFE_COLUMNS));
    const columns = Math.max(1, Math.ceil(items / rows));
    return {
        width: minWidthForColumns(columns),
        height: fitHeight(rows),
        columns,
        rows,
    };
}

function fitHeight(rows: number): number {
    return FIT_ONE_ROW_HEIGHT + FIT_ROW_HEIGHT * (rows - 1);
}

/**
 * Our rule, not the game's: a stored width without a height gets as many rows as that width's columns at this
 * screen need, each at the measured Fit height.
 */
function heightForWidth(width: number, items: number, screen: Screen): number {
    const g = geometry(screen.height);
    const columns = columnsFor(Math.min(widthPx(width, screen.height), g.cap), g);
    return fitHeight(Math.max(1, Math.ceil(items / columns)));
}

function scaled(box: Box, scale: number): Box {
    return { x: box.x * scale, y: box.y * scale, width: box.width * scale, height: box.height * scale };
}

function layoutFor(
    categories: readonly ModCategoryView[],
    screen: Screen,
    headerLines: readonly (number | undefined)[] = [],
) {
    return layoutBuild(
        categories.map((category, i) => {
            const items = category.mods.length;
            const lines = headerLines[i];
            if (category.width === null) {
                const fit = fitSize(items);
                return { width: fit.width, height: category.height ?? fit.height, items, headerLines: lines };
            }
            const height = category.height ?? heightForWidth(category.width, items, screen);
            return { width: category.width, height, items, headerLines: lines };
        }),
        screen,
    );
}

export function shopView(
    categories: readonly ModCategoryView[],
    screen: Screen,
    available: number,
    mode: ShopMode,
    /** Lines each category's name wraps to, as rendered; 1 when missing. */
    headerLines: readonly (number | undefined)[] = [],
): ShopView {
    const layout = layoutFor(categories, screen, headerLines);
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
            header: category.header * scale,
            clippedRows: category.clippedRows,
            chips: category.chips.map((chip) => scaled(chip, scale)),
            index,
        })),
    };
}

/** The width a fit shop fills: `available`, but never wider than the game draws the shop at `screen`. */
export function fitWidth(available: number, screen: Screen): number {
    return Math.min(available, geometry(screen.height).contentWidth);
}

export type ShopResolution = "1080" | "1440" | "2160";

export const SHOP_SCREENS: Readonly<Record<ShopResolution, Screen>> = {
    "1080": { width: 1920, height: 1080 },
    "1440": { width: 2560, height: 1440 },
    "2160": { width: 3840, height: 2160 },
};

/** The one resolution the shop layout is measured at. */
export const MEASURED_RESOLUTION: ShopResolution = "1440";

export function deviceScreen(screen: { width: number; height: number; devicePixelRatio: number }): Screen {
    return {
        width: Math.round(screen.width * screen.devicePixelRatio),
        height: Math.round(screen.height * screen.devicePixelRatio),
    };
}

export function closestResolution(height: number): ShopResolution {
    let best: ShopResolution = "1080";
    for (const resolution of Object.keys(SHOP_SCREENS) as ShopResolution[]) {
        if (Math.abs(SHOP_SCREENS[resolution].height - height) < Math.abs(SHOP_SCREENS[best].height - height))
            best = resolution;
    }
    return best;
}

export interface ScreenDifference {
    index: number;
    /** Columns on the user's screen. */
    columns: number;
    /** Columns at the measured 1440p. */
    referenceColumns: number;
}

export function screenDifferences(
    categories: readonly ModCategoryView[],
    screen: Screen,
    reference: Screen = SHOP_SCREENS[MEASURED_RESOLUTION],
): ScreenDifference[] {
    const mine = layoutFor(categories, screen).categories;
    const measured = layoutFor(categories, reference).categories;
    return mine.flatMap((category, index) => {
        const referenceColumns = measured[index]!.columns;
        return category.columns === referenceColumns ? [] : [{ index, columns: category.columns, referenceColumns }];
    });
}
