<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import { byteProgress, type IndicatorKind, type UpdateSource } from "../flow";

    let { kind, source }: { kind: IndicatorKind; source: UpdateSource } = $props();

    const fraction = $derived(byteProgress(source).fraction);
    const text = $derived(
        kind === "downloading" && fraction !== null
            ? t("updates.progress.percent", { percent: Math.round(fraction * 100) })
            : (source.version ?? ""),
    );
    const KICKERS = {
        available: "updates.indicator.kicker.available",
        downloading: "updates.indicator.kicker.downloading",
        ready: "updates.indicator.kicker.ready",
        failed: "updates.indicator.kicker.failed",
    } as const;
</script>

<span class="face" data-kind={kind} style:--gauge={fraction ?? 0} aria-hidden="true">
    <span class="kicker">{t(KICKERS[kind])}</span>
    <span class="digits">{text}</span>
    {#if kind === "downloading"}<span class="gauge"></span>{/if}
</span>

<style>
    /* Bare type between the updates page's corner marks, with a small caps status word above the version. */
    .face {
        --tone: var(--brass);
        position: relative;
        display: inline-flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: 2px;
        height: 1.875rem;
        margin: 0 0.5rem;
        padding: 0 0.5rem;
        color: var(--tone);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    .face[data-kind="failed"] {
        --tone: var(--warning);
    }

    .face::before,
    .face::after {
        content: "";
        position: absolute;
        width: 6px;
        height: 6px;
        border-color: color-mix(in oklch, var(--tone) 80%, transparent);
        border-style: solid;
    }
    .face::before {
        top: 0;
        left: 0;
        border-width: 1.5px 0 0 1.5px;
    }
    .face::after {
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

    .digits {
        font-family: "Valve Pulp", var(--font-heading);
        font-size: 0.85rem;
        line-height: 1;
        letter-spacing: 0.04em;
    }

    /* The updates page's notched gauge in miniature: ten marks over a fill set by --gauge. */
    .gauge {
        position: absolute;
        left: 0.5rem;
        right: 0.5rem;
        bottom: -1px;
        height: 2px;
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

    /* Off under reduced motion: the app's motion rule cuts every animation short. */
    .face[data-kind="ready"] .digits {
        animation: glow 2.4s ease-in-out infinite;
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
</style>
