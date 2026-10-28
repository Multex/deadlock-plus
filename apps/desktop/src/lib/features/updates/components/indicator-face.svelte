<script lang="ts">
    import { CircleCheck, Download, RotateCw, TriangleAlert } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { byteProgress, type IndicatorKind, type UpdateSource } from "../flow";

    let { kind, source }: { kind: IndicatorKind | "idle"; source: UpdateSource } = $props();

    const RING = 2 * Math.PI * 6;
    const fraction = $derived(byteProgress(source).fraction);
</script>

<span class="face" data-kind={kind} aria-hidden="true">
    {#if kind === "downloading"}
        <svg class="ring" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" class="ring-track" />
            {#if fraction !== null}
                <circle
                    cx="8"
                    cy="8"
                    r="6"
                    class="ring-fill"
                    stroke-dasharray={RING}
                    stroke-dashoffset={RING * (1 - fraction)}
                />
            {/if}
        </svg>
        {#if fraction !== null}
            <span class="text">{t("updates.progress.percent", { percent: Math.round(fraction * 100) })}</span>
        {/if}
    {:else if kind === "idle"}
        <CircleCheck class="size-3.5" />
    {:else}
        {#if kind === "ready"}
            <RotateCw class="size-3.5" />
        {:else if kind === "failed"}
            <TriangleAlert class="size-3.5" />
        {:else}
            <Download class="size-3.5" />
        {/if}
        {#if source.version}<span class="text">{source.version}</span>{/if}
    {/if}
</span>

<style>
    .face {
        --tone: var(--brass);
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        height: 1.625rem;
        padding: 0 0.625rem;
        border: 1px solid color-mix(in oklch, var(--tone) 55%, transparent);
        border-radius: 999px;
        background: color-mix(in oklch, var(--tone) 12%, transparent);
        color: var(--tone);
        font-family: var(--font-heading);
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.06em;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    .face[data-kind="ready"] {
        --tone: var(--success);
    }
    .face[data-kind="idle"] {
        --tone: var(--muted-foreground);
    }
    .face[data-kind="failed"] {
        --tone: var(--warning);
    }

    .ring {
        width: 1rem;
        height: 1rem;
        transform: rotate(-90deg);
    }
    .ring-track {
        fill: none;
        stroke: color-mix(in oklch, var(--tone) 25%, transparent);
        stroke-width: 2.5;
    }
    .ring-fill {
        fill: none;
        stroke: var(--tone);
        stroke-width: 2.5;
        stroke-linecap: round;
        transition: stroke-dashoffset 400ms ease-out;
    }
</style>
