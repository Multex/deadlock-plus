import { toBlob } from "html-to-image";
import { mount, unmount } from "svelte";
import { saveBinaryFile } from "$lib/core/files";
import ExportFooter from "./components/detail/export-footer.svelte";
import { EXPORT_WIDTH, exportPixelRatio, stripExportIgnored } from "@deadlock-plus/match/export";

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
 * Renders an off-screen copy of `node` with the branded footer attached to the board's bottom edge, so the live
 * page is never touched.
 */
export async function renderNodeToPng(node: HTMLElement, footerLabel: string): Promise<Blob> {
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.inert = true;
    host.style.cssText = `position:fixed;top:0;left:-10000px;width:${EXPORT_WIDTH}px;pointer-events:none;`;
    const clone = node.cloneNode(true) as HTMLElement;
    clone.style.width = `${EXPORT_WIDTH}px`;
    clone.style.maxWidth = "none";
    stripExportIgnored(clone);
    const board = clone.querySelector<HTMLElement>("[data-export-board]");
    if (board) {
        board.style.borderBottomWidth = "0";
        board.style.borderBottomLeftRadius = "0";
        board.style.borderBottomRightRadius = "0";
    }
    const footerTarget = document.createElement("div");
    clone.append(footerTarget);
    host.append(clone);
    document.body.append(host);
    const footer = mount(ExportFooter, { target: footerTarget, props: { label: footerLabel } });
    try {
        await document.fonts?.ready;
        await inlineImages(clone);
        const height = clone.scrollHeight;
        const blob = await toBlob(clone, {
            width: EXPORT_WIDTH,
            height,
            pixelRatio: exportPixelRatio(EXPORT_WIDTH, height),
            backgroundColor: pageBackground(),
            style: { width: `${EXPORT_WIDTH}px`, maxWidth: "none" },
        });
        if (!blob) throw new Error("the image could not be created");
        return blob;
    } finally {
        void unmount(footer);
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
