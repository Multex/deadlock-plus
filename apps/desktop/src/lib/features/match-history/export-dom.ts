import { toBlob } from "html-to-image";
import { mount, unmount } from "svelte";
import { saveBinaryFile } from "$lib/core/files";
import ExportFooter from "./components/detail/export-footer.svelte";
import { errorText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";
import {
    EXPORT_WIDTH,
    MAX_EXPORT_SIDE,
    exportPixelRatio,
    stripExportIgnored,
    type ExportKind,
} from "@deadlock-plus/match/export";

export class ExportRenderError extends Error {
    constructor(cause: unknown) {
        super("the scoreboard image could not be rendered", { cause });
    }
}

export function exportFailureText(
    kind: ExportKind,
    error: unknown,
    renderFailedKey = "match_history.detail.export.render_failed",
): string {
    if (error instanceof ExportRenderError) return t(renderFailedKey);
    const text = errorText(error);
    return kind === "copy"
        ? t("match_history.detail.export.copy_failed", { error: text })
        : t("match_history.detail.export.save_failed", { error: text });
}

/** `asset:` art is not reachable by `fetch` under the app's CSP, but `<img>` loads it with CORS headers. */
async function loadAsDataUrl(src: string): Promise<string | null> {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    try {
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context || canvas.width === 0 || canvas.height === 0) return null;
        context.drawImage(img, 0, 0);
        return canvas.toDataURL("image/png");
    } catch {
        return null;
    }
}

async function inlineImages(root: HTMLElement): Promise<void> {
    const images = [...root.querySelectorAll("img")].filter((img) => img.src && !img.src.startsWith("data:"));
    const inlined = await Promise.all(images.map((img) => loadAsDataUrl(img.currentSrc || img.src)));
    images.forEach((img, i) => {
        const dataUrl = inlined[i];
        if (dataUrl) img.src = dataUrl;
    });
}

function pageBackground(): string {
    const body = getComputedStyle(document.body).backgroundColor;
    const transparent = !body || body === "transparent" || /rgba\(.*,\s*0\)$/.test(body);
    return transparent ? getComputedStyle(document.documentElement).getPropertyValue("--background").trim() : body;
}

/**
 * The image keeps every measured width but lays its content out again, and above 100% display or app scaling that
 * content comes out a fraction wider. A scroll box in the copy would then draw a scrollbar into the image.
 */
function stopScrolling(root: HTMLElement): void {
    for (const el of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
        const { overflowX, overflowY } = getComputedStyle(el);
        if ([overflowX, overflowY].some((v) => v === "auto" || v === "scroll")) el.style.overflow = "hidden";
    }
}

export interface RenderOptions {
    /** `false` leaves the node's own footer as the only one. Defaults to `true`. */
    footer?: boolean;
    /** Fixes the canvas height in CSS pixels instead of measuring the content. */
    height?: number;
}

export interface RenderFrame {
    width: number;
    height: number;
    footer: boolean;
    pixelRatio: number;
}

export function resolveRenderFrame(width: number, measuredHeight: number, options: RenderOptions = {}): RenderFrame {
    const fixed = options.height !== undefined && options.height > 0 ? Math.round(options.height) : null;
    const height = fixed === null ? measuredHeight : Math.min(fixed, MAX_EXPORT_SIDE);
    return { width, height, footer: options.footer !== false, pixelRatio: exportPixelRatio(width, height) };
}

/**
 * Renders an off-screen copy of `node` with the branded footer attached to the board's bottom edge, so the live
 * page is never touched.
 */
export async function renderNodeToPng(
    node: HTMLElement,
    footerLabel: string,
    width = EXPORT_WIDTH,
    options: RenderOptions = {},
): Promise<Blob> {
    const withFooter = options.footer !== false;
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.inert = true;
    host.style.cssText = `position:fixed;top:0;left:-10000px;width:${width}px;pointer-events:none;`;
    const clone = node.cloneNode(true) as HTMLElement;
    clone.style.width = `${width}px`;
    clone.style.maxWidth = "none";
    stripExportIgnored(clone);
    const board = withFooter ? clone.querySelector<HTMLElement>("[data-export-board]") : null;
    if (board) {
        board.style.borderBottomWidth = "0";
        board.style.borderBottomLeftRadius = "0";
        board.style.borderBottomRightRadius = "0";
    }
    const footerTarget = document.createElement("div");
    if (withFooter) clone.append(footerTarget);
    host.append(clone);
    document.body.append(host);
    const footer = withFooter ? mount(ExportFooter, { target: footerTarget, props: { label: footerLabel } }) : null;
    try {
        await document.fonts?.ready;
        await inlineImages(clone);
        stopScrolling(clone);
        const frame = resolveRenderFrame(width, clone.scrollHeight, options);
        const blob = await toBlob(clone, {
            width: frame.width,
            height: frame.height,
            pixelRatio: frame.pixelRatio,
            backgroundColor: pageBackground(),
            style: { width: `${width}px`, maxWidth: "none" },
        });
        if (!blob) throw new Error("html-to-image returned no blob");
        return blob;
    } catch (e) {
        console.warn("scoreboard render failed:", e);
        throw new ExportRenderError(e);
    } finally {
        if (footer) void unmount(footer);
        host.remove();
    }
}

export async function saveImage(fileName: string, image: Blob): Promise<boolean> {
    const bytes = new Uint8Array(await image.arrayBuffer());
    return saveBinaryFile({ defaultName: fileName, extension: "png" }, bytes);
}

export function documentHasFocus(): boolean {
    return document.hasFocus();
}

export function waitForWindowFocus(): Promise<void> {
    if (document.hasFocus()) return Promise.resolve();
    return new Promise((resolve) => {
        window.addEventListener("focus", () => resolve(), { once: true });
    });
}

export async function copyImage(image: Blob): Promise<void> {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
}
