<script module lang="ts">
    import { coverRect, previewImages, type PreviewOp, type PreviewPalette } from "./build-preview";

    const mounted = new Set<() => void>();
    const queued = new Set<() => void>();
    let frame = 0;
    let palette: PreviewPalette | null = null;
    let themeObserver: MutationObserver | null = null;

    // Every preview that needs drawing draws in the same frame, so images arriving for 50 cards cost one frame.
    function schedule(draw: () => void) {
        queued.add(draw);
        if (!frame) frame = requestAnimationFrame(flush);
    }

    function flush() {
        frame = 0;
        palette = null;
        const draws = [...queued];
        queued.clear();
        for (const draw of draws) draw();
    }

    // A canvas cannot read theme variables, so they are resolved once per frame through one hidden element.
    function currentPalette(): PreviewPalette {
        if (palette) return palette;
        const probe = document.createElement("span");
        probe.style.display = "none";
        document.body.append(probe);
        const resolve = (color: string) => {
            probe.style.color = color;
            return getComputedStyle(probe).color;
        };
        const font = (family: string) => {
            probe.style.fontFamily = family;
            return getComputedStyle(probe).fontFamily;
        };
        palette = {
            border: resolve("var(--border)"),
            category: resolve("color-mix(in oklch, var(--card) 70%, transparent)"),
            optional: resolve("color-mix(in oklch, #365b92 28%, var(--card))"),
            header: resolve("color-mix(in oklch, #10130d 70%, transparent)"),
            name: resolve("var(--foreground)"),
            warning: resolve("var(--warning)"),
            removed: resolve("color-mix(in oklch, var(--warning) 8%, transparent)"),
            sans: font("var(--font-sans)"),
            heading: font("var(--font-heading)"),
        };
        probe.remove();
        return palette;
    }

    function watchTheme() {
        if (themeObserver || typeof MutationObserver === "undefined") return;
        themeObserver = new MutationObserver(() => mounted.forEach(schedule));
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    }

    let measureContext: CanvasRenderingContext2D | null | undefined;
    function measure(text: string, font: string): number {
        if (measureContext === undefined) measureContext = document.createElement("canvas").getContext("2d");
        if (!measureContext) return 0;
        measureContext.font = font;
        return measureContext.measureText(text).width;
    }

    function clipTo(ctx: CanvasRenderingContext2D, box: { x: number; y: number; width: number; height: number }) {
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.width, box.height);
        ctx.clip();
    }

    /** Returns false while the op's image is still loading. */
    function paint(ctx: CanvasRenderingContext2D, op: PreviewOp): boolean {
        switch (op.kind) {
            case "box":
                ctx.fillStyle = op.fill;
                if (op.radius) {
                    ctx.beginPath();
                    ctx.roundRect(op.x, op.y, op.width, op.height, op.radius);
                    ctx.fill();
                } else ctx.fillRect(op.x, op.y, op.width, op.height);
                return true;
            case "frame": {
                const half = op.lineWidth / 2;
                ctx.strokeStyle = op.color;
                ctx.lineWidth = op.lineWidth;
                ctx.setLineDash(op.dashed ? [3, 2] : []);
                ctx.strokeRect(op.x + half, op.y + half, op.width - op.lineWidth, op.height - op.lineWidth);
                return true;
            }
            case "art": {
                ctx.save();
                ctx.beginPath();
                if (op.round) ctx.arc(op.x + op.width / 2, op.y + op.height / 2, op.width / 2, 0, Math.PI * 2);
                else ctx.rect(op.x, op.y, op.width, op.height);
                ctx.clip();
                ctx.fillStyle = op.fill;
                ctx.fillRect(op.x, op.y, op.width, op.height);
                const image = previewImages.get(op.src);
                if (image) {
                    const { sx, sy, sw, sh } = coverRect(image.naturalWidth, image.naturalHeight, op);
                    ctx.drawImage(image, sx, sy, sw, sh, op.x, op.y, op.width, op.height);
                }
                ctx.restore();
                return !!image || previewImages.settled(op.src);
            }
            case "corner":
                ctx.fillStyle = op.fill;
                ctx.beginPath();
                ctx.moveTo(op.x - op.size, op.y);
                ctx.lineTo(op.x, op.y);
                ctx.lineTo(op.x, op.y + op.size);
                ctx.closePath();
                ctx.fill();
                if (op.label) {
                    ctx.font = op.label.font;
                    ctx.fillStyle = op.label.color;
                    ctx.textAlign = "right";
                    ctx.textBaseline = "top";
                    ctx.fillText(op.label.text, op.label.x, op.label.y);
                }
                return true;
            case "text":
                ctx.save();
                if (op.clip) clipTo(ctx, op.clip);
                ctx.font = op.font;
                ctx.fillStyle = op.color;
                ctx.textAlign = op.align;
                ctx.textBaseline = "middle";
                op.lines.forEach((line, i) => {
                    const y = op.y + op.lineHeight * (i + 0.5);
                    // An undefined maxWidth counts as NaN and draws nothing.
                    if (op.maxWidth === undefined) ctx.fillText(line, op.x, y);
                    else ctx.fillText(line, op.x, y, op.maxWidth);
                });
                ctx.restore();
                return true;
        }
    }
</script>

<script lang="ts">
    import type { Screen } from "@deadlock-plus/build-layout";
    import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
    import { t } from "$lib/core/i18n.svelte";
    import { headerLinesFor } from "../../header-lines.svelte";
    import { shopView, type ChipItem } from "../../shop-view";
    import { previewPlan, usedShare } from "./build-preview";

    let {
        build,
        resolve,
        screen,
        maxHeight = Infinity,
    }: {
        build: BuildView;
        resolve: (abilityId: number) => ChipItem | undefined;
        screen: Screen;
        /** CSS px past which the shop is cut off; nothing below it is drawn. */
        maxHeight?: number;
    } = $props();

    let host = $state<HTMLDivElement>();
    let canvas = $state<HTMLCanvasElement>();
    let width = $state(0);

    const lines = $derived(headerLinesFor(build.modCategories));
    // The empty right side of the shop is cropped: the used part fills the preview's width.
    const share = $derived(usedShare(shopView(build.modCategories, screen, 1, "fit", lines)));
    const view = $derived(width > 0 ? shopView(build.modCategories, screen, width / share, "fit", lines) : null);
    const height = $derived(view ? Math.min(view.contentHeight, maxHeight) : 0);
    const items = $derived(build.modCategories.map((category) => category.mods.map((mod) => resolve(mod.abilityId))));
    const removedLabel = $derived(t("builds.shop.removed_item"));

    let alive = true;
    const redraw = () => {
        if (alive) schedule(draw);
    };

    function draw() {
        if (!alive || !canvas || !view) return;
        const ratio = window.devicePixelRatio || 1;
        const backingWidth = Math.round(width * ratio);
        const backingHeight = Math.round(height * ratio);
        if (canvas.width !== backingWidth) canvas.width = backingWidth;
        if (canvas.height !== backingHeight) canvas.height = backingHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        const layers = previewPlan({
            view,
            categories: build.modCategories,
            items,
            palette: currentPalette(),
            measure,
            removedLabel,
        });
        for (const layer of layers) {
            if (layer.clip.y >= height) continue;
            ctx.save();
            clipTo(ctx, layer.clip);
            for (const op of layer.ops) {
                if (!paint(ctx, op) && op.kind === "art") void previewImages.request(op.src).then(redraw);
            }
            ctx.restore();
        }
    }

    $effect(() => {
        if (!host) return;
        let pending = 0;
        // Only the width is read back: the canvas sets this element's height, and acting on that would loop.
        const observer = new ResizeObserver((entries) => {
            const next = entries[0]?.contentRect.width ?? 0;
            cancelAnimationFrame(pending);
            pending = requestAnimationFrame(() => {
                if (Math.abs(next - width) > 0.5) width = next;
            });
        });
        observer.observe(host);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(pending);
        };
    });

    $effect(() => {
        void view;
        void items;
        void removedLabel;
        redraw();
    });

    $effect(() => {
        watchTheme();
        mounted.add(draw);
        return () => {
            alive = false;
            mounted.delete(draw);
            queued.delete(draw);
        };
    });
</script>

<div class="w-full" bind:this={host}>
    <canvas class="block" bind:this={canvas} style:width="{width}px" style:height="{height}px" aria-hidden="true"
    ></canvas>
</div>
