import { layoutPreview, type BuildCategory, type Box, type Screen } from "@deadlock-plus/build-layout";
import { REFERENCE_HEIGHT, columnsFor, geometry, widthPx } from "@deadlock-plus/build-layout/layout";
import { previewGeometry } from "@deadlock-plus/build-layout/preview";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { FIT_ONE_ROW_HEIGHT, FIT_ROW_HEIGHT, fitSize, type ShopView } from "../../../shop-view";
import { zoomScale, type Zoom } from "./zoom";

/** The Build Browser draws the shop's panel at `ui-scale: 63%`. */
const UI_SCALE_PERCENT = 63;
const CATEGORY_BORDER = 2;

/**
 * Stored sizes with a missing width or height filled as the shop view fills them, so both views draw the same
 * build: our Fit size, or a stored width's Fit rows at its shop columns on this screen.
 */
function storedSizes(
    categories: readonly ModCategoryView[],
    screen: Screen,
    headerLines: readonly (number | undefined)[],
): BuildCategory[] {
    const g = geometry(screen.height);
    return categories.map((category, i) => {
        const items = category.mods.length;
        if (category.width === null) {
            const fit = fitSize(items);
            return { width: fit.width, height: category.height ?? fit.height, items, headerLines: headerLines[i] };
        }
        const columns = columnsFor(Math.min(widthPx(category.width, screen.height), g.cap), g);
        const rows = Math.max(1, Math.ceil(items / columns));
        return {
            width: category.width,
            height: category.height ?? FIT_ONE_ROW_HEIGHT + FIT_ROW_HEIGHT * (rows - 1),
            items,
            headerLines: headerLines[i],
        };
    });
}

function scaled(box: Box, scale: number): Box {
    return { x: box.x * scale, y: box.y * scale, width: box.width * scale, height: box.height * scale };
}

/** The Build Browser's Overview at `zoom`, in the shop view's shape; `fit` is the scale that fills `available`. */
export function previewView(
    categories: readonly ModCategoryView[],
    screen: Screen,
    available: number,
    zoom: Zoom,
    /** Lines each category's name wraps to, as rendered; 1 when missing. */
    headerLines: readonly (number | undefined)[] = [],
): { view: ShopView; fit: number } {
    const layout = layoutPreview(storedSizes(categories, screen, headerLines), screen);
    const g = previewGeometry(screen.height);
    const fit = available / layout.contentWidth;
    const scale = zoomScale(zoom, fit);
    const bottom = Math.max(0, ...layout.categories.map(({ box }) => box.y + box.height + g.margin));
    const k = (UI_SCALE_PERCENT * screen.height) / (100 * REFERENCE_HEIGHT);
    return {
        fit,
        view: {
            scale,
            contentWidth: layout.contentWidth * scale,
            contentHeight: bottom * scale,
            unit: k * scale,
            border: Math.round((CATEGORY_BORDER * UI_SCALE_PERCENT * screen.height) / (100 * REFERENCE_HEIGHT)) * scale,
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
        },
    };
}
