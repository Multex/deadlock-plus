<script lang="ts">
    import { untrack } from "svelte";
    import { formatNumber, t, tn } from "$lib/core/i18n.svelte";
    import {
        byteProgress,
        downloadRate,
        mebibytes,
        secondsLeft,
        timeLeft,
        type RateSample,
        type UpdateSource,
    } from "../flow";

    type Props = {
        source: UpdateSource;
        /** Stands in for the measured speed, for a preview that never downloads. */
        pinnedRate?: number | null;
        size?: "lg" | "sm";
    };

    let { source, pinnedRate, size = "lg" }: Props = $props();

    const RATE_TICK_MS = 1000;

    const progress = $derived(byteProgress(source));
    const percent = $derived(progress.fraction === null ? null : Math.round(progress.fraction * 100));

    let samples = $state<RateSample[]>([]);
    let now = $state(Date.now());

    $effect(() => {
        const bytes = progress.received;
        if (bytes === null || pinnedRate !== undefined) return;
        const at = Date.now();
        untrack(() => (samples = [...samples.filter((s) => at - s.at <= 10_000), { at, bytes }]));
    });

    $effect(() => {
        if (progress.received === null || pinnedRate !== undefined) return;
        const timer = setInterval(() => (now = Date.now()), RATE_TICK_MS);
        return () => clearInterval(timer);
    });

    const finished = $derived(progress.fraction === 1);
    const rate = $derived(finished ? null : pinnedRate !== undefined ? pinnedRate : downloadRate(samples, now));
    const left = $derived(progress.received === null ? null : secondsLeft(progress.received, progress.total, rate));

    const mb = (bytes: number) =>
        formatNumber(mebibytes(bytes), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    const sizeText = $derived.by(() => {
        if (progress.received === null) return null;
        return progress.total === null
            ? t("updates.progress.received", { received: mb(progress.received) })
            : t("updates.progress.of", { received: mb(progress.received), total: mb(progress.total) });
    });
    const rateText = $derived(rate === null || rate <= 0 ? null : t("updates.progress.speed", { speed: mb(rate) }));
    const leftText = $derived.by(() => {
        if (left === null) return null;
        const { unit, count } = timeLeft(left);
        return tn(unit === "seconds" ? "updates.progress.left_seconds" : "updates.progress.left_minutes", count);
    });
</script>

<div class="update-progress" data-size={size}>
    <div
        class="track"
        role="progressbar"
        aria-label={t("updates.progress.label")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={[percent === null ? null : `${percent}%`, sizeText].filter(Boolean).join(", ") || undefined}
    >
        {#if percent === null}
            <div class="fill indeterminate"></div>
        {:else}
            <div class="fill" style:width="{percent}%"></div>
        {/if}
        <div class="ticks" aria-hidden="true"></div>
    </div>
    <div class="numbers" aria-hidden="true">
        {#if percent !== null}
            <span class="pct">{t("updates.progress.percent", { percent })}</span>
        {/if}
        {#if sizeText}<span>{sizeText}</span>{/if}
        {#if rateText}<span>{rateText}</span>{/if}
        {#if leftText}<span class="left">{leftText}</span>{/if}
    </div>
</div>

<style>
    .update-progress {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .track {
        position: relative;
        height: 0.875rem;
        overflow: hidden;
        border: 1px solid color-mix(in oklch, var(--brass) 45%, var(--border));
        border-radius: 2px;
        background: color-mix(in oklch, var(--foreground) 6%, var(--background));
        box-shadow: inset 0 1px 3px rgb(0 0 0 / 0.35);
    }
    [data-size="sm"] .track {
        height: 0.5rem;
    }

    .fill {
        height: 100%;
        background: linear-gradient(
            180deg,
            color-mix(in oklch, var(--brass) 80%, white) 0%,
            var(--brass) 45%,
            color-mix(in oklch, var(--brass) 70%, black) 100%
        );
        box-shadow: 0 0 10px color-mix(in oklch, var(--brass) 45%, transparent);
        transition: width 400ms ease-out;
    }

    .indeterminate {
        width: 35%;
        animation: sweep 1.6s ease-in-out infinite;
    }

    @keyframes sweep {
        from {
            transform: translateX(-100%);
        }
        to {
            transform: translateX(300%);
        }
    }

    :global(:root[data-reduced-motion]) .fill {
        transition: none;
    }
    :global(:root[data-reduced-motion]) .indeterminate {
        width: 100%;
        animation: none;
        opacity: 0.35;
    }

    /* Ten notches, like a gauge's scale: a percentage is easier to read against marks. */
    .ticks {
        position: absolute;
        inset: 0;
        background: repeating-linear-gradient(
            90deg,
            transparent 0 calc(10% - 1px),
            color-mix(in oklch, var(--background) 70%, transparent) calc(10% - 1px) 10%
        );
        pointer-events: none;
    }

    .numbers {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.25rem 0.875rem;
        font-size: 0.8rem;
        color: var(--muted-foreground);
        font-variant-numeric: tabular-nums;
    }
    [data-size="sm"] .numbers {
        font-size: 0.75rem;
        gap: 0.125rem 0.625rem;
    }

    .pct {
        font-family: "Valve Pulp", var(--font-heading);
        font-size: 1.05rem;
        line-height: 1;
        color: var(--foreground);
    }
    [data-size="sm"] .pct {
        font-size: 0.9rem;
    }

    .left {
        margin-left: auto;
    }
</style>
