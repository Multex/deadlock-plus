import {
    MAX_COLUMNS_EVERYWHERE,
    SAFE_MAX_WIDTH_EVERYWHERE,
    columnsAtEveryScale,
    layoutBuild,
    layoutPreview,
    minWidthForColumnsEverywhere,
    sharesRowEverywhere,
    type CategoryLayout,
    type Screen,
} from "@deadlock-plus/build-layout";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { MEASURED_RESOLUTION, SHOP_SCREENS, fitSize } from "../shop-view";
import { losesPreviewColumns, sizeTag } from "./resize";
import { heightForRows } from "./row-ops";

export type LayoutIssueKind = "unsized" | "cap" | "columns" | "preview_columns" | "row" | "preview_row" | "height";

const KIND_ORDER: readonly LayoutIssueKind[] = [
    "unsized",
    "cap",
    "columns",
    "preview_columns",
    "row",
    "preview_row",
    "height",
];

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

type Layout = typeof layoutBuild;

function layoutOf(
    categories: readonly ModCategoryView[],
    widths: readonly number[],
    screen: Screen,
    layout: Layout = layoutBuild,
) {
    return layout(
        categories.map((category, i) => ({
            width: widths[i]!,
            height: category.height ?? 0,
            items: category.mods.length,
        })),
        screen,
    ).categories;
}

/** Flow rows, as lists of category indices. */
function rowsOf(placed: readonly CategoryLayout[]): number[][] {
    const rows: number[][] = [];
    let y: number | null = null;
    for (const [i, { box }] of placed.entries()) {
        if (box.y !== y) rows.push([]);
        rows[rows.length - 1]!.push(i);
        y = box.y;
    }
    return rows;
}

const rowsAt = (categories: readonly ModCategoryView[], widths: readonly number[], screen: Screen) =>
    rowsOf(layoutOf(categories, widths, screen));

/** Each category's row-mates, as one key per category. */
function rowKeys(placed: readonly CategoryLayout[]): string[] {
    const key: string[] = [];
    for (const row of rowsOf(placed)) for (const i of row) key[i] = row.join(",");
    return key;
}

/** Categories whose row-mates in the shop are not the same at every scale. */
function rowMismatches(categories: readonly ModCategoryView[], widths: readonly number[]): Set<number> {
    const keys = SCREENS.map((screen) => rowKeys(layoutOf(categories, widths, screen)));
    const mismatched = new Set<number>();
    for (let i = 0; i < categories.length; i++) {
        if (keys.some((key) => key[i] !== keys[0]![i])) mismatched.add(i);
    }
    return mismatched;
}

/** Categories whose row-mates in the Build Browser preview differ from the shop's at the same scale. */
function previewRowMismatches(categories: readonly ModCategoryView[], widths: readonly number[]): Set<number> {
    const mismatched = new Set<number>();
    for (const screen of SCREENS) {
        const shop = rowKeys(layoutOf(categories, widths, screen));
        const preview = rowKeys(layoutOf(categories, widths, screen, layoutPreview));
        for (let i = 0; i < categories.length; i++) if (shop[i] !== preview[i]) mismatched.add(i);
    }
    return mismatched;
}

export function layoutIssues(build: BuildView, opts: LayoutCheckOptions = {}): CategoryIssues[] {
    const reference = opts.reference ?? SHOP_SCREENS[MEASURED_RESOLUTION];
    const categories = build.modCategories;
    const widths = categories.map(widthOf);
    const drawn = SCREENS.map((screen) => layoutOf(categories, widths, screen));
    const rows = rowMismatches(categories, widths);
    const previewRows = previewRowMismatches(categories, widths);
    return categories.flatMap((category, index) => {
        const kinds = new Set<LayoutIssueKind>();
        if (category.width === null || category.height === null) kinds.add("unsized");
        if (category.width !== null) {
            const shopColumns = columnsAtEveryScale(category.width);
            if (category.width > SAFE_MAX_WIDTH_EVERYWHERE) kinds.add("cap");
            else {
                if (drawn.some((at) => at[index]!.columns !== shopColumns)) kinds.add("columns");
                if (losesPreviewColumns(category.width, shopColumns)) kinds.add("preview_columns");
            }
        }
        if (rows.has(index)) kinds.add("row");
        if (previewRows.has(index)) kinds.add("preview_row");
        if (
            category.height !== null &&
            sizeTag(widths[index]!, category.height, category.mods.length, reference).overflow
        )
            kinds.add("height");
        return kinds.size === 0 ? [] : [{ index, kinds: KIND_ORDER.filter((kind) => kinds.has(kind)) }];
    });
}

/**
 * Column counts whose everywhere-safe widths share one flow row in the shop and the Build Browser preview at
 * every scale: drops one column at a time from the member with the most, the later one on a tie (the one the
 * game wraps), never below one.
 */
export function fitRowColumns(columns: readonly number[]): number[] {
    const next = [...columns];
    while (!sharesRowEverywhere(next.map(minWidthForColumnsEverywhere))) {
        let widest = -1;
        for (const [i, n] of next.entries()) if (n > 1 && (widest === -1 || n >= next[widest]!)) widest = i;
        if (widest === -1) break;
        next[widest]!--;
    }
    return next;
}

/**
 * A build that lays out alike at 1080p, 1440p, 4K and in the Build Browser preview: each width with an issue,
 * or none stored, becomes the everywhere-safe width of the columns it shows at the reference screen; a row that
 * wraps differently gets everywhere-safe widths for all its members, dropping columns by `fitRowColumns` when
 * they no longer share. Heights then grow to the everywhere-safe height of their items' rows, a missing height
 * is exactly that. Order never changes.
 */
export function repairLayout(build: BuildView, opts: LayoutCheckOptions = {}): BuildView {
    const issues = layoutIssues(build, opts);
    if (issues.length === 0) return build;
    const reference = opts.reference ?? SHOP_SCREENS[MEASURED_RESOLUTION];
    const categories = build.modCategories;
    const widths = categories.map(widthOf);
    const columns = layoutOf(categories, widths, reference).map((c) => Math.min(c.columns, MAX_COLUMNS_EVERYWHERE));
    const resized: readonly LayoutIssueKind[] = ["cap", "columns", "preview_columns"];
    for (const { index, kinds } of issues) {
        if (categories[index]!.width === null || kinds.some((kind) => resized.includes(kind)))
            widths[index] = minWidthForColumnsEverywhere(columns[index]!);
    }

    function fitRows(rows: readonly number[][], mismatched: ReadonlySet<number>): boolean {
        let changed = false;
        for (const row of rows) {
            if (!row.some((i) => mismatched.has(i))) continue;
            const fitted = fitRowColumns(row.map((i) => columns[i]!));
            for (const [k, i] of row.entries()) {
                const width =
                    fitted[k] === columns[i]
                        ? Math.min(widths[i]!, minWidthForColumnsEverywhere(fitted[k]!))
                        : minWidthForColumnsEverywhere(fitted[k]!);
                columns[i] = fitted[k]!;
                if (width !== widths[i]) {
                    widths[i] = width;
                    changed = true;
                }
            }
        }
        return changed;
    }

    // Narrowing a row can pull the next row's first category up into it, so check the rows again until they
    // hold. When the reference's rows already share everywhere, the mismatch is a longer row at another scale or
    // in the preview: fitting that one joins the reference's rows into it. Widths only ever narrow, so this ends.
    for (let pass = 0; pass <= categories.length * MAX_COLUMNS_EVERYWHERE; pass++) {
        const mismatched = new Set([...rowMismatches(categories, widths), ...previewRowMismatches(categories, widths)]);
        if (mismatched.size === 0) break;
        const layouts = [
            () => rowsAt(categories, widths, reference),
            ...SCREENS.map((screen) => () => rowsAt(categories, widths, screen)),
            ...SCREENS.map((screen) => () => rowsOf(layoutOf(categories, widths, screen, layoutPreview))),
        ];
        if (!layouts.some((rows) => fitRows(rows(), mismatched))) break;
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
