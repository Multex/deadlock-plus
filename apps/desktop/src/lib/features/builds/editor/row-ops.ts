import {
    MAX_COLUMNS_EVERYWHERE,
    SAFE_MAX_WIDTH_EVERYWHERE,
    columnsAtEveryScale,
    minHeightForRowsEverywhere,
    minWidthForColumnsEverywhere,
    sharesRowEverywhere,
    type Screen,
} from "@deadlock-plus/build-layout";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import { FIT_ONE_ROW_HEIGHT, FIT_ROW_HEIGHT, fitSize, shopView, type FitSize } from "../shop-view";
import { sizeTag, stopAtEdge, widestOnRow } from "./resize";

export const MAX_COLUMNS = MAX_COLUMNS_EVERYWHERE;

export interface CategorySize {
    width: number;
    height: number;
}

/** The height the editor writes for `rows` chip rows: whole rows in the shop and the Build Browser preview. */
export function heightForRows(rows: number): number {
    return minHeightForRowsEverywhere(Math.max(1, rows));
}

/** The height the shop view draws for a stored width without a height: the game's Fit heights. */
const drawnHeightForRows = (rows: number) => FIT_ONE_ROW_HEIGHT + FIT_ROW_HEIGHT * (Math.max(1, rows) - 1);

const clampColumns = (n: number) => Math.min(MAX_COLUMNS, Math.max(1, n));

/**
 * Fit to items as the editor writes it: one row at the smallest everywhere-safe width while that fits under the
 * cap; past that, the fewest rows, columns split as evenly as they go.
 */
export function fitEverywhere(items: number): FitSize {
    const rows = Math.max(1, Math.ceil(items / MAX_COLUMNS));
    const columns = Math.max(1, Math.ceil(items / rows));
    return { width: minWidthForColumnsEverywhere(columns), height: heightForRows(rows), columns, rows };
}

/** The size the shop draws a category at, in game units, filling a missing width or height the way `shopView` does. */
function effectiveSizes(build: BuildView, screen: Screen): CategorySize[] {
    const drawn = shopView(build.modCategories, screen, 1, "native").categories;
    return build.modCategories.map((category, i) => {
        if (category.width === null) {
            const fit = fitSize(category.mods.length);
            return { width: fit.width, height: category.height ?? fit.height };
        }
        return { width: category.width, height: category.height ?? drawnHeightForRows(drawn[i]!.rows) };
    });
}

function withSizes(build: BuildView, sizes: ReadonlyMap<number, Partial<CategorySize>>): BuildView {
    if (sizes.size === 0) return build;
    return {
        ...build,
        modCategories: build.modCategories.map((category, i) => {
            const size = sizes.get(i);
            return size ? { ...category, ...size } : category;
        }),
    };
}

/** The indices of the categories the flow draws on the same row as `index`, in order. */
export function rowOf(build: BuildView, index: number, screen: Screen): number[] {
    const drawn = shopView(build.modCategories, screen, 1, "native").categories;
    const y = drawn[index]?.box.y;
    if (y === undefined) return [];
    return drawn.filter((category) => category.box.y === y).map((category) => category.index);
}

const fits = (columns: readonly number[]) => sharesRowEverywhere(columns.map(minWidthForColumnsEverywhere));

/**
 * Widest stored width `index` can take while every category of its flow row at `screen`, itself included, keeps
 * that row in the shop and the Build Browser preview at 1080p, 1440p and 2160p. Alone on its row it is
 * `SAFE_MAX_WIDTH_EVERYWHERE`; null when not even one column fits.
 */
export function rowLimit(build: BuildView, index: number, screen: Screen): number | null {
    const sizes = effectiveSizes(build, screen);
    const others = rowOf(build, index, screen)
        .filter((i) => i !== index)
        .map((i) => sizes[i]!.width);
    return widestOnRow(others);
}

export function fillRow(build: BuildView, index: number, screen: Screen): BuildView {
    const limit = rowLimit(build, index, screen);
    if (limit === null) return build;
    return withSizes(build, new Map([[index, { width: stopAtEdge(SAFE_MAX_WIDTH_EVERYWHERE, limit, false) }]]));
}

/** Rounds the row's average column count, then drops columns until the row still shares at every scale. */
export function equalWidths(build: BuildView, index: number, screen: Screen): BuildView {
    const sizes = effectiveSizes(build, screen);
    const row = rowOf(build, index, screen);
    if (row.length === 0) return build;
    const average = row.reduce((sum, i) => sum + columnsAtEveryScale(sizes[i]!.width), 0) / row.length;
    let n = clampColumns(Math.round(average));
    while (n > 1 && !fits(row.map(() => n))) n--;
    return withSizes(build, new Map(row.map((i) => [i, { width: minWidthForColumnsEverywhere(n) }])));
}

/**
 * Scales every column count on the row by the largest factor that still shares at every scale, then hands the
 * spare columns one at a time to whichever category is furthest behind its share.
 */
export function fillRowProportionally(build: BuildView, index: number, screen: Screen): BuildView {
    const sizes = effectiveSizes(build, screen);
    const row = rowOf(build, index, screen);
    if (row.length === 0) return build;
    const base = row.map((i) => columnsAtEveryScale(sizes[i]!.width));
    const factors = [...new Set(base.flatMap((c) => Array.from({ length: MAX_COLUMNS }, (_, m) => (m + 1) / c)))].sort(
        (a, b) => a - b,
    );
    let scaled: number[] | null = null;
    for (const factor of factors) {
        const next = base.map((c) => clampColumns(Math.floor(c * factor + 1e-9)));
        if (!fits(next)) break;
        scaled = next;
    }
    if (!scaled) return build;
    let columns: number[] = scaled;
    for (;;) {
        const current: number[] = columns;
        const grown = current
            .map((n, i) => ({ i, share: n / base[i]! }))
            .filter(({ i }) => current[i]! < MAX_COLUMNS)
            .sort((a, b) => a.share - b.share)
            .map(({ i }) => current.map((n, j) => (j === i ? n + 1 : n)))
            .find((candidate) => fits(candidate));
        if (!grown) break;
        columns = grown;
    }
    return withSizes(build, new Map(row.map((i, k) => [i, { width: minWidthForColumnsEverywhere(columns[k]!) }])));
}

export function equalizeHeights(build: BuildView, index: number, screen: Screen): BuildView {
    const sizes = effectiveSizes(build, screen);
    const row = rowOf(build, index, screen);
    const height = Math.max(...row.map((i) => sizes[i]!.height));
    return withSizes(build, new Map(row.map((i) => [i, { height }])));
}

/** Every category on the row gets the whole chip rows the tallest one holds. */
export function equalRows(build: BuildView, index: number, screen: Screen): BuildView {
    const sizes = effectiveSizes(build, screen);
    const row = rowOf(build, index, screen);
    const rows = Math.max(
        1,
        ...row.map((i) => sizeTag(sizes[i]!.width, sizes[i]!.height, build.modCategories[i]!.mods.length, screen).rows),
    );
    return withSizes(build, new Map(row.map((i) => [i, { height: heightForRows(rows) }])));
}

export interface SizeOf extends CategorySize {
    /** Columns the width keeps at every scale. */
    columns: number;
    /** Whole chip rows the height holds, at least one. */
    rows: number;
}

export function sizeOf(build: BuildView, index: number, screen: Screen): SizeOf {
    const size = effectiveSizes(build, screen)[index]!;
    const items = build.modCategories[index]!.mods.length;
    return {
        columns: columnsAtEveryScale(size.width),
        rows: Math.max(1, sizeTag(size.width, size.height, items, screen).rows),
        ...size,
    };
}

export function setSize(build: BuildView, index: number, columns: number, rows: number): BuildView {
    return withSizes(
        build,
        new Map([[index, { width: minWidthForColumnsEverywhere(clampColumns(columns)), height: heightForRows(rows) }]]),
    );
}

export function pasteSize(build: BuildView, index: number, size: CategorySize): BuildView {
    return withSizes(build, new Map([[index, { width: size.width, height: size.height }]]));
}
