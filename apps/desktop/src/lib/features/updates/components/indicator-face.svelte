<script lang="ts">
    import { CircleCheck, Download, RotateCw, TriangleAlert } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { byteProgress, type IndicatorKind, type UpdateSource } from "../flow";
    import type { ChipVariant } from "../preview";

    type Props = { kind: IndicatorKind | "idle"; source: UpdateSource; variant: ChipVariant };

    let { kind, source, variant }: Props = $props();

    const fraction = $derived(byteProgress(source).fraction);
    const percent = $derived(fraction === null ? null : Math.round(fraction * 100));
    const text = $derived(
        kind === "downloading"
            ? percent === null
                ? (source.version ?? "")
                : t("updates.progress.percent", { percent })
            : (source.version ?? ""),
    );
    const KICKERS = {
        available: "updates.indicator.kicker.available",
        downloading: "updates.indicator.kicker.downloading",
        ready: "updates.indicator.kicker.ready",
        failed: "updates.indicator.kicker.failed",
        idle: "updates.indicator.kicker.idle",
    } as const;
    /** How full the gauge under the face is: the download's share while downloading, whole otherwise. */
    const gauge = $derived(kind === "downloading" ? (fraction ?? 0) : 1);
</script>

<span class="face" data-variant={variant} data-kind={kind} style:--gauge={gauge} aria-hidden="true">
    {#if variant === "plaque"}
        <span class="plaque">
            {#if kind === "ready"}
                <RotateCw class="size-3" />
            {:else if kind === "available"}
                <Download class="size-3" />
            {:else if kind === "idle"}
                <CircleCheck class="size-3" />
            {/if}
            <span class="digits">{text}</span>
            {#if kind === "downloading"}<span class="gauge"></span>{/if}
            {#if kind === "failed"}<span class="notch"></span>{/if}
        </span>
    {:else if variant === "marks"}
        <span class="marks">
            <span class="kicker">{t(KICKERS[kind])}</span>
            <span class="digits">{text}</span>
            {#if kind === "downloading"}<span class="gauge"></span>{/if}
        </span>
    {:else}
        <span class="tab">
            {#if kind === "ready"}
                <RotateCw class="size-4" />
            {:else if kind === "idle"}
                <CircleCheck class="size-4" />
            {:else if kind === "failed"}
                <TriangleAlert class="size-4" />
            {:else}
                <Download class="size-4" />
            {/if}
            <span class="digits">{text}</span>
            <span class="gauge"></span>
            {#if kind === "failed"}<span class="notch"></span>{/if}
        </span>
    {/if}
</span>

<style>
    .face {
        --tone: var(--brass);
        --amber: var(--warning);
        display: inline-flex;
        align-items: center;
        height: 100%;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    [data-variant="plaque"],
    [data-variant="marks"] {
        padding: 0 0.5rem;
    }

    .digits {
        font-family: "Valve Pulp", var(--font-heading);
        line-height: 1;
        letter-spacing: 0.04em;
    }

    /* A notched scale, like the update page's gauge: ten marks over a fill set by --gauge. */
    .gauge {
        position: absolute;
        background:
            repeating-linear-gradient(
                90deg,
                transparent 0 calc(10% - 1px),
                color-mix(in oklch, var(--chrome) 80%, transparent) calc(10% - 1px) 10%
            ),
            linear-gradient(
                90deg,
                var(--tone) 0 calc(var(--gauge) * 100%),
                color-mix(in oklch, var(--tone) 22%, transparent) calc(var(--gauge) * 100%)
            );
    }

    @keyframes glow {
        0%,
        100% {
            filter: drop-shadow(0 0 0 transparent);
        }
        50% {
            filter: drop-shadow(0 0 5px color-mix(in oklch, var(--tone) 75%, transparent));
        }
    }

    /* Plaque: a small brass plate with clipped art deco corners. */
    .plaque {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        height: 1.375rem;
        padding: 0 0.55rem;
        clip-path: polygon(
            5px 0,
            calc(100% - 5px) 0,
            100% 5px,
            100% calc(100% - 5px),
            calc(100% - 5px) 100%,
            5px 100%,
            0 calc(100% - 5px),
            0 5px
        );
        background: linear-gradient(
            180deg,
            color-mix(in oklch, var(--tone) 70%, white) 0%,
            var(--tone) 50%,
            color-mix(in oklch, var(--tone) 75%, black) 100%
        );
        color: color-mix(in oklch, var(--tone) 18%, black);
        font-size: 0.78rem;
    }
    .plaque .digits {
        padding-top: 1px;
    }
    [data-variant="plaque"][data-kind="ready"] {
        animation: glow 2.4s ease-in-out infinite;
    }
    [data-kind="downloading"] .plaque,
    [data-kind="failed"] .plaque,
    [data-kind="idle"] .plaque {
        background: color-mix(in oklch, var(--tone) 14%, var(--chrome));
        box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--tone) 45%, transparent);
        color: var(--tone);
    }
    [data-kind="downloading"] .plaque {
        padding-bottom: 3px;
    }
    .plaque .gauge {
        left: 5px;
        right: 5px;
        bottom: 0;
        height: 3px;
    }
    [data-kind="failed"] .plaque {
        color: var(--amber);
        box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--amber) 45%, transparent);
        padding-right: 0.8rem;
    }
    /* The amber notch: the plate's top right corner filled in. */
    .notch {
        position: absolute;
        width: 8px;
        height: 8px;
        background: var(--amber);
    }
    .plaque .notch {
        top: 0;
        right: 0;
        clip-path: polygon(0 0, 100% 0, 100% 100%);
    }
    [data-kind="idle"] .plaque {
        --tone: var(--muted-foreground);
    }

    /* Marks: bare type between the update page's corner marks, with a small caps line above the version. */
    .marks {
        position: relative;
        display: inline-flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: 2px;
        height: 1.875rem;
        padding: 0 0.5rem;
        color: var(--tone);
    }
    .marks::before,
    .marks::after {
        content: "";
        position: absolute;
        width: 6px;
        height: 6px;
        border-color: color-mix(in oklch, var(--tone) 80%, transparent);
        border-style: solid;
    }
    .marks::before {
        top: 0;
        left: 0;
        border-width: 1.5px 0 0 1.5px;
    }
    .marks::after {
        right: 0;
        bottom: 0;
        border-width: 0 1.5px 1.5px 0;
    }
    .kicker {
        font-family: var(--font-heading);
        font-size: 0.55rem;
        font-weight: 600;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        line-height: 1;
        color: color-mix(in oklch, var(--tone) 70%, var(--muted-foreground));
    }
    .marks .digits {
        font-size: 0.85rem;
    }
    .marks .gauge {
        left: 0.5rem;
        right: 0.5rem;
        bottom: -1px;
        height: 2px;
    }
    [data-variant="marks"][data-kind="ready"] .digits {
        animation: glow 2.4s ease-in-out infinite;
    }
    [data-variant="marks"][data-kind="failed"] {
        --tone: var(--amber);
    }
    [data-variant="marks"][data-kind="idle"] {
        --tone: var(--muted-foreground);
    }

    /* Tab: sits like a title bar button, lit from below, with the gauge as its bottom edge. */
    .tab {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        height: 100%;
        padding: 0 0.75rem;
        color: var(--tone);
        background: linear-gradient(0deg, color-mix(in oklch, var(--tone) 16%, transparent), transparent 75%);
    }
    .tab .digits {
        font-size: 0.82rem;
        color: var(--foreground);
    }
    .tab .gauge {
        left: 0;
        right: 0;
        bottom: 0;
        height: 2px;
    }
    [data-variant="tab"][data-kind="ready"] .tab {
        animation: glow 2.4s ease-in-out infinite;
    }
    [data-variant="tab"][data-kind="failed"] {
        --tone: var(--amber);
    }
    [data-variant="tab"][data-kind="failed"] .gauge {
        opacity: 0.45;
    }
    .tab .notch {
        left: 0;
        bottom: 0;
        width: 7px;
        height: 7px;
        clip-path: polygon(0 0, 100% 100%, 0 100%);
    }
    [data-variant="tab"][data-kind="idle"] {
        --tone: var(--muted-foreground);
    }
</style>
