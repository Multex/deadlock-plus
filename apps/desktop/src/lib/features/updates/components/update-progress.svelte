<script lang="ts">
    import { formatNumber, t, tn } from "$lib/core/i18n.svelte";
    import { byteProgress, mebibytes, secondsLeft, timeLeft, type UpdateSource } from "../flow";

    let { source }: { source: UpdateSource } = $props();

    const progress = $derived(byteProgress(source));
    const percent = $derived(progress.fraction === null ? null : Math.round(progress.fraction * 100));
    const finished = $derived(progress.fraction === 1);
    const rate = $derived(finished ? null : (source.speed ?? null));
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

<div class="update-progress">
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

    .pct {
        font-family: "Valve Pulp", var(--font-heading);
        font-size: 1.05rem;
        line-height: 1;
        color: var(--foreground);
    }

    .left {
        margin-left: auto;
    }
</style>
