export const EXPORT_WIDTH = 1200;
export const EXPORT_PIXEL_RATIO = 2;
export const MAX_EXPORT_SIDE = 8192;

const HERO_SLUG_MAX = 30;

export interface ExportNameParts {
    heroName: string | null;
    outcome: "win" | "loss" | null;
    matchId: number;
    date: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");

function slug(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function exportFileName({ heroName, outcome, matchId, date }: ExportNameParts): string {
    const hero = (heroName ? slug(heroName).slice(0, HERO_SLUG_MAX).replace(/-+$/, "") : "") || "match";
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return ["deadlock-plus", hero, outcome, matchId, day].filter((p) => p !== null).join("-") + ".png";
}

/** 2x for sharp text, reduced only when the canvas would pass the webview's size limit. */
export function exportPixelRatio(width: number, height: number): number {
    const longest = Math.max(width, height);
    if (longest <= 0) return 1;
    return Math.max(1, Math.min(EXPORT_PIXEL_RATIO, MAX_EXPORT_SIDE / longest));
}

export type ExportKind = "save" | "copy";

export type ExportResult =
    { status: "saved" } | { status: "copied" } | { status: "cancelled" } | { status: "failed"; error: unknown };

export interface ExportDeps {
    render: () => Promise<Blob>;
    save: (fileName: string, image: Blob) => Promise<boolean>;
    copy: (image: Blob) => Promise<void>;
    hasFocus: () => boolean;
    waitForFocus: () => Promise<void>;
}

/** The clipboard API rejects with `NotAllowedError` ("Document is not focused.") while the window is in the background. */
export function isFocusError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const { name, message } = error as { name?: unknown; message?: unknown };
    return name === "NotAllowedError" || (typeof message === "string" && /not focused/i.test(message));
}

export async function runExport(kind: ExportKind, fileName: string, deps: ExportDeps): Promise<ExportResult> {
    try {
        const image = await deps.render();
        if (kind === "copy") {
            if (!deps.hasFocus()) await deps.waitForFocus();
            try {
                await deps.copy(image);
            } catch (error) {
                if (!isFocusError(error)) throw error;
                await deps.waitForFocus();
                await deps.copy(image);
            }
            return { status: "copied" };
        }
        return (await deps.save(fileName, image)) ? { status: "saved" } : { status: "cancelled" };
    } catch (error) {
        return { status: "failed", error };
    }
}

export const EXPORT_IGNORE_ATTR = "data-export-ignore";

/** Removes everything marked `data-export-ignore` so it takes no space in the measured, captured copy. */
export function stripExportIgnored(root: { querySelectorAll(selector: string): Iterable<{ remove(): void }> }): number {
    let count = 0;
    for (const node of [...root.querySelectorAll(`[${EXPORT_IGNORE_ATTR}]`)]) {
        node.remove();
        count++;
    }
    return count;
}
