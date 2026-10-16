<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import { BANDS } from "../grade-strip";

    let { score, mini = false }: { score: number | null; mini?: boolean } = $props();

    const TINT = [4, 16, 30, 46, 66, 90];
</script>

<div class="wrap" class:mini class:empty={score === null}>
    <div class="bar">
        {#each BANDS as b, i (b.letter)}
            <span
                class="band"
                style:left="{b.from}%"
                style:width="{b.to - b.from}%"
                style:background="color-mix(in oklch, var(--brass) {TINT[i]}%, var(--muted))"
            ></span>
        {/each}
        {#if !mini}<span class="avg"></span>{/if}
        {#if score !== null}<span class="you" style:left="{score}%"></span>{/if}
    </div>
    {#if !mini}
        <div class="scale" aria-hidden="true">
            {#each BANDS as b (b.letter)}
                <span style:left="{(b.from + b.to) / 2}%">{b.letter}</span>
            {/each}
            <span class="avg-label">{t("live.grades.avg")}</span>
        </div>
    {/if}
</div>

<style>
    .wrap {
        --bar-h: 8px;
        position: relative;
        width: 100%;
    }
    .wrap.mini {
        --bar-h: 4px;
    }
    .bar {
        position: relative;
        height: var(--bar-h);
        border-radius: 999px;
    }
    .band {
        position: absolute;
        top: 0;
        bottom: 0;
    }
    .band:first-child {
        border-radius: 999px 0 0 999px;
    }
    .band:nth-child(6) {
        border-radius: 0 999px 999px 0;
    }
    .band + .band {
        border-left: 1px solid var(--marker-ring, var(--card));
    }
    .empty .band {
        opacity: 0.4;
    }
    .avg {
        position: absolute;
        top: -3px;
        bottom: -3px;
        left: 50%;
        width: 1px;
        transform: translateX(-50%);
        background: color-mix(in oklch, var(--foreground) 70%, transparent);
    }
    .you {
        position: absolute;
        top: -4px;
        bottom: -4px;
        width: 4px;
        border-radius: 2px;
        transform: translateX(-50%);
        background: var(--foreground);
        box-shadow: 0 0 0 2px var(--marker-ring, var(--card));
        transition: left 0.6s ease;
    }
    .mini .you {
        box-shadow: 0 0 0 1.5px var(--marker-ring, var(--card));
    }
    .scale {
        position: relative;
        height: 12px;
        margin-top: 5px;
        font-size: 9.5px;
        line-height: 12px;
        color: var(--muted-foreground);
    }
    .scale span {
        position: absolute;
        transform: translateX(-50%);
        opacity: 0.75;
    }
    .scale .avg-label {
        left: 50%;
        opacity: 1;
        color: var(--foreground);
    }
</style>
