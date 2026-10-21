import {
    SAFE_MAX_WIDTH,
    columnsAtEveryScale,
    layoutBuild,
    minWidthForColumns,
    sharesRowAtEveryScale,
    type Screen,
} from "@deadlock-plus/build-layout";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { MAX_SAFE_COLUMNS, MEASURED_RESOLUTION, SHOP_SCREENS, fitSize } from "../shop-view";
import { sizeTag } from "./resize";
import { heightForRows } from "./row-ops";

export type LayoutIssueKind = "unsized" | "cap" | "columns" | "row" | "height";

const KIND_ORDER: readonly LayoutIssueKind[] = ["unsized", "cap", "columns", "row", "height"];

export interface CategoryIssues {
    index: number;
    kinds: LayoutIssueKind[];
}

export interface LayoutCheckOptions {
    /** The screen whose columns and rows count as what the build shows; the measured 1440p by default. */
    reference?: Screen;
}

const SCREENS = Object.values(SHOP_SCREENS);

const widthOf = (category: ModCategoryView) => category.width ?? fitSize(category.mods.length).width;

function layoutOf(categories: readonly ModCategoryView[], widths: readonly number[], screen: Screen) {
    return layoutBuild(
        categories.map((category, i) => ({
            width: widths[i]!,
            height: category.height ?? 0,
            items: category.mods.length,
        })),
        screen,
    ).categories;
}

/** Flow rows at `screen`, as lists of category indices. */
function rowsAt(categories: readonly ModCategoryView[], widths: readonly number[], screen: Screen): number[][] {
    const rows: number[][] = [];
    let y: number | null = null;
    for (const [i, { box }] of layoutOf(categories, widths, screen).entries()) {
        if (box.y !== y) rows.push([]);
        rows[rows.length - 1]!.push(i);
        y = box.y;
    }
    return rows;
}

/** Categories whose row-mates are not the same at every scale. */
function rowMismatches(categories: readonly ModCategoryView[], widths: readonly number[]): Set<number> {
    const keys = SCREENS.map((screen) => {
        const key: string[] = [];
        for (const row of rowsAt(categories, widths, screen)) for (const i of row) key[i] = row.join(",");
        return key;
    });
    const mismatched = new Set<number>();
    for (let i = 0; i < categories.length; i++) {
        if (keys.some((key) => key[i] !== keys[0]![i])) mismatched.add(i);
    }
    return mismatched;
}

export function layoutIssues(build: BuildView, opts: LayoutCheckOptions = {}): CategoryIssues[] {
    const reference = opts.reference ?? SHOP_SCREENS[MEASURED_RESOLUTION];
    const categories = build.modCategories;
    const widths = categories.map(widthOf);
    const drawn = SCREENS.map((screen) => layoutOf(categories, widths, screen));
    const rows = rowMismatches(categories, widths);
    return categories.flatMap((category, index) => {
        const kinds = new Set<LayoutIssueKind>();
        if (category.width === null || category.height === null) kinds.add("unsized");
        if (category.width !== null) {
            if (category.width > SAFE_MAX_WIDTH) kinds.add("cap");
            else if (drawn.some((at) => at[index]!.columns !== columnsAtEveryScale(category.width!)))
                kinds.add("columns");
        }
        if (rows.has(index)) kinds.add("row");
        if (
            category.height !== null &&
            sizeTag(widths[index]!, category.height, category.mods.length, reference).overflow
        )
            kinds.add("height");
        return kinds.size === 0 ? [] : [{ index, kinds: KIND_ORDER.filter((kind) => kinds.has(kind)) }];
    });
}

/**
 * Column counts whose safe widths share one flow row at every scale: drops one column at a time from the
 * member with the most, the later one on a tie (the one the game wraps), never below one.
 */
export function fitRowColumns(columns: readonly number[]): number[] {
    const next = [...columns];
    while (!sharesRowAtEveryScale(next.map(minWidthForColumns))) {
        let widest = -1;
        for (const [i, n] of next.entries()) if (n > 1 && (widest === -1 || n >= next[widest]!)) widest = i;
        if (widest === -1) break;
        next[widest]!--;
    }
    return next;
}

/**
 * A build that lays out alike at 1080p, 1440p and 4K: each width with an issue becomes the safe width of the
 * columns it shows at the reference screen; a row that wraps differently at another scale gets safe widths for
 * all its members, dropping columns by `fitRowColumns` when they no longer share; a missing width gets our Fit
 * width. Heights then grow to hold their items' rows, a missing height is exactly that. Order never changes.
 */
export function repairLayout(build: BuildView, opts: LayoutCheckOptions = {}): BuildView {
    const issues = layoutIssues(build, opts);
    if (issues.length === 0) return build;
    const reference = opts.reference ?? SHOP_SCREENS[MEASURED_RESOLUTION];
    const categories = build.modCategories;
    const widths = categories.map(widthOf);
    const columns = layoutOf(categories, widths, reference).map((c) => Math.min(c.columns, MAX_SAFE_COLUMNS));
    for (const { index, kinds } of issues) {
        if (kinds.includes("cap") || kinds.includes("columns")) widths[index] = minWidthForColumns(columns[index]!);
    }

    // Narrowing a row can pull the next row's first category up into it, so check the rows again until they hold.
    for (let pass = 0; pass <= categories.length; pass++) {
        const mismatched = rowMismatches(categories, widths);
        if (mismatched.size === 0) break;
        let changed = false;
        for (const row of rowsAt(categories, widths, reference)) {
            if (!row.some((i) => mismatched.has(i))) continue;
            const fitted = fitRowColumns(row.map((i) => columns[i]!));
            for (const [k, i] of row.entries()) {
                const width =
                    fitted[k] === columns[i]
                        ? Math.min(widths[i]!, minWidthForColumns(fitted[k]!))
                        : minWidthForColumns(fitted[k]!);
                columns[i] = fitted[k]!;
                if (width !== widths[i]) {
                    widths[i] = width;
                    changed = true;
                }
            }
        }
        if (!changed) break;
    }

    const shown = layoutOf(categories, widths, reference);
    let touched = false;
    const modCategories = categories.map((category, i) => {
        const items = category.mods.length;
        const rows = Math.max(1, Math.ceil(items / shown[i]!.columns));
        const tooShort = category.height === null || sizeTag(widths[i]!, category.height, items, reference).overflow;
        const width = widths[i]!;
        const height = tooShort ? heightForRows(rows) : category.height!;
        if (width === category.width && height === category.height) return category;
        touched = true;
        return { ...category, width, height };
    });
    return touched ? { ...build, modCategories } : build;
}
