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
        head = true,
        fill = false,
    }: {
        game: BestGameView;
        title: string;
        scale?: number;
        /** Picture height in px; no picture when absent. With `fill`, the least it shrinks to. */
        photo?: number;
        /** `false` when the card around it already carries the title. */
        head?: boolean;
        /** Fills its parent's height: the picture takes whatever the facts leave. */
        fill?: boolean;
    } = $props();
</script>

<section
    class="best"
    class:headless={!head}
    class:fill
    style="--s: calc({scale} * var(--fit-scale, 1)); --photo-min: {photo ?? 0}px;"
    aria-label={title}
>
    {#if head}
        <SectionHead text={title} />
    {/if}
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
            <b class="hero" data-fit-line>{game.hero}</b>
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
        border-top: 2px solid var(--dp-rule, var(--fp-ink));
    }

    .best.headless {
        padding-top: 0;
        border-top: 0;
    }

    .picture {
        margin-bottom: calc(6px * var(--s));
    }

    .best.fill {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    /* A zero flex basis lets the picture's frame ignore the fixed height the kit's Photo gives it. */
    .fill .picture {
        display: flex;
        flex: 1 1 0;
        flex-direction: column;
        min-height: var(--photo-min);
    }

    .fill .picture :global(.photo) {
        display: flex;
        flex: 1 1 0;
        flex-direction: column;
        min-height: 0;
    }

    .fill .picture :global(.frame) {
        flex: 1 1 0;
        min-height: 0;
    }

    .fill .line {
        flex: none;
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
        font-size: calc(20px * var(--s) * var(--line-fit, 1));
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
