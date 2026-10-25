<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import SectionHead from "$lib/features/front-page/paper/section-head.svelte";
    import type { HeroLine } from "../edition-view";

    let {
        rows,
        title,
        scale = 1,
        head = true,
    }: {
        rows: HeroLine[];
        title: string;
        scale?: number;
        /** `false` when the card around it already carries the title. */
        head?: boolean;
    } = $props();
</script>

<!-- A grid with table roles, not a <table>: html-to-image grows every table row in the exported image. -->
<section class="report" style="--s: calc({scale} * var(--fit-scale, 1));">
    {#if head}
        <SectionHead text={title} />
    {/if}
    <div role="table" aria-label={title}>
        <div class="row head" role="row">
            <span role="columnheader">{t("front_page.kit.hero")}</span>
            <span role="columnheader">{t("dispatch.heroes.games")}</span>
            <span role="columnheader">{t("dispatch.heroes.wins")}</span>
            <span role="columnheader">{t("dispatch.heroes.time")}</span>
        </div>
        {#each rows as row, i (row.id)}
            <div class="row" class:top={i === 0} role="row">
                <span class="hero" role="cell">{row.hero}</span>
                <span role="cell">{row.games}</span>
                <span role="cell">{row.wins}</span>
                <span class="time" role="cell">{row.playtime}</span>
            </div>
        {/each}
    </div>
</section>

<style>
    .report {
        min-width: 0;
    }

    .row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) calc(40px * var(--s)) calc(34px * var(--s)) calc(58px * var(--s));
        padding: calc(1px * var(--s) + var(--row-gap, 0px) / 2) 0;
        border-bottom: 1px dotted color-mix(in oklch, var(--fp-ink) 40%, transparent);
        font-family: "Retail Demo", sans-serif;
        font-size: calc(12.5px * var(--s));
        line-height: 1.3;
        font-variant-numeric: tabular-nums;
        text-align: right;
        white-space: nowrap;
    }

    .row.head {
        border-bottom: 2px solid var(--fp-ink);
        color: var(--fp-ink-soft);
        font-weight: 600;
        font-size: calc(10px * var(--s));
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }

    .row span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .row > :first-child {
        text-align: left;
    }

    .row.top {
        background: var(--fp-highlight);
        font-weight: 700;
    }

    .time {
        color: var(--fp-ink-soft);
    }
</style>
