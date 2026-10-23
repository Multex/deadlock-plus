import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { fitSize } from "./shop-view";

type Measured = Pick<ModCategoryView, "name" | "width" | "mods">;

/** Category border 2 on each side, the name's margins 12 and 4, and 16 kept free for the header's controls. */
const NAME_INSET = 2 * 2 + 12 + 4;
/** The name's font size in game units; the game draws the header label at 16. */
const NAME_FONT = 16;

/** Game units the name can use on one line. */
export function nameRoom(width: number | null, items = 0): number {
    return (width ?? fitSize(items).width) - NAME_INSET;
}

/** Lines `text` wraps to in `room`, breaking at spaces and inside a word longer than the room, as the header does. */
export function nameLines(text: string, room: number, measure: (text: string) => number): number {
    let lines = 1;
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const joined = line ? `${line} ${word}` : word;
        if (measure(joined) <= room) {
            line = joined;
            continue;
        }
        if (line) lines++;
        let rest = word;
        while (rest.length > 1 && measure(rest) > room) {
            let cut = rest.length - 1;
            while (cut > 1 && measure(rest.slice(0, cut)) > room) cut--;
            rest = rest.slice(cut);
            lines++;
        }
        line = rest;
    }
    return lines;
}

// Text is measured once at the game's own size instead of read back from each render: previews draw the same name
// at many scales, and font hinting made them disagree and re-layout each other forever.
let fontsLoaded = $state(0);
if (typeof document !== "undefined" && document.fonts) {
    void document.fonts.ready.then(() => fontsLoaded++);
    document.fonts.addEventListener("loadingdone", () => fontsLoaded++);
}

let context: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();
let cachedFor = -1;

function measurer(): ((text: string) => number) | null {
    if (typeof document === "undefined") return null;
    if (context === undefined) context = document.createElement("canvas").getContext("2d");
    if (!context) return null;
    context.font = `700 ${NAME_FONT}px ${getComputedStyle(document.body).fontFamily}`;
    const ctx = context;
    return (text) => ctx.measureText(text).width;
}

function linesOf({ name, width, mods }: Measured): number {
    const room = nameRoom(width, mods.length);
    const key = `${room}\u0000${name}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const measure = measurer();
    if (!measure) return 1;
    const lines = nameLines(name, room, measure);
    cache.set(key, lines);
    return lines;
}

/** One line count per category name, at its stored width. */
export function headerLinesFor(categories: readonly Measured[]): number[] {
    if (cachedFor !== fontsLoaded) {
        cache.clear();
        cachedFor = fontsLoaded;
    }
    return categories.map(linesOf);
}
