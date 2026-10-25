<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Photo from "$lib/features/front-page/paper/photo.svelte";
    import SectionHead from "$lib/features/front-page/paper/section-head.svelte";
    import type { BestGameView } from "../edition-view";

    let {
        game,
        title,
        scale = 1,
        photo,
    }: {
        game: BestGameView;
        title: string;
        scale?: number;
        /** Picture height in px; no picture when absent. */
        photo?: number;
    } = $props();
</script>

<section class="best" style="--s: {scale};" aria-label={title}>
    <SectionHead text={title} />
    {#if photo !== undefined}
        <div class="picture">
            <Photo src={game.art} alt={game.hero} height={photo} />
        </div>
    {/if}
    <div class="line" class:graded={game.grade !== null}>
        {#if game.grade !== null}
            <span class="grade" aria-label={t("front_page.kit.grade")}>{game.grade}</span>
        {/if}
        <div class="facts">
            <b class="hero">{game.hero}</b>
            <span class="kda">{game.kda}</span>
            <span class="nw">{t("dispatch.best_game.net_worth", { value: game.netWorth })}</span>
            <span class="date">{game.date}</span>
        </div>
    </div>
</section>

<style>
    .best {
        min-width: 0;
        padding-top: calc(4px * var(--s));
        border-top: 2px solid var(--fp-ink);
    }

    .picture {
        margin-bottom: calc(6px * var(--s));
    }

    .line {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: calc(10px * var(--s));
        align-items: center;
    }

    .line.graded {
        grid-template-columns: auto minmax(0, 1fr);
    }

    .grade {
        display: grid;
        place-items: center;
        min-width: calc(58px * var(--s));
        height: calc(58px * var(--s));
        padding: 0 calc(4px * var(--s));
        border: calc(3px * var(--s)) solid var(--fp-spot);
        color: var(--fp-spot);
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: calc(34px * var(--s));
        line-height: 1;
        transform: rotate(-4deg);
    }

    .facts {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.15;
    }

    .hero {
        overflow: hidden;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: calc(20px * var(--s));
        text-transform: uppercase;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .kda {
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: calc(18px * var(--s));
        font-variant-numeric: tabular-nums;
    }

    .nw {
        font-size: calc(12px * var(--s));
    }

    .date {
        color: var(--fp-ink-soft);
        font-size: calc(11px * var(--s));
        font-style: italic;
    }
</style>
