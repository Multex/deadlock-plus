<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Briefs from "$lib/features/front-page/paper/briefs.svelte";
    import Deck from "$lib/features/front-page/paper/deck.svelte";
    import Headline from "$lib/features/front-page/paper/headline.svelte";
    import Masthead from "$lib/features/front-page/paper/masthead.svelte";
    import Paper from "$lib/features/front-page/paper/paper.svelte";
    import Photo from "$lib/features/front-page/paper/photo.svelte";
    import Stamp from "$lib/features/front-page/paper/stamp.svelte";
    import { DISPATCH_PAPER, type EditionView } from "../edition-view";
    import BestGame from "./best-game.svelte";
    import HeroReport from "./hero-report.svelte";
    import NumbersBox from "./numbers-box.svelte";
    import People from "./people.svelte";

    let {
        view,
        live,
        angle = 0,
    }: {
        view: EditionView;
        /** Stamps the page "so far": the edition is still being written. Defaults to the view's own. */
        live?: boolean;
        /** Degrees; 0 for an image export. */
        angle?: number;
    } = $props();

    const stamped = $derived(live ?? view.live);
    const hasLower = $derived(view.heroes.length > 0 || !!view.people || view.briefs.length > 0);
</script>

<Paper width={DISPATCH_PAPER.width} height={DISPATCH_PAPER.height} {angle} label={view.label}>
    <div class="layout">
        <Masthead
            name={view.masthead.name}
            date={view.masthead.date}
            edition={view.masthead.edition}
            detail={view.masthead.issue}
        />

        {#if view.banner}
            <div class="banner">
                <Headline text={view.banner.headline} size="banner" max={68} min={36} />
            </div>
        {/if}

        <div class="lead" class:solo={!view.photo}>
            {#if view.photo}
                <Photo src={view.photo.src} alt={view.photo.alt} caption={view.photo.caption} height={248}>
                    {#if stamped}
                        <Stamp text={t("dispatch.stamp.so_far")} tone="spot" />
                    {/if}
                </Photo>
            {:else if stamped}
                <div class="loose-stamp"><Stamp text={t("dispatch.stamp.so_far")} tone="spot" /></div>
            {/if}
            <div class="side">
                {#if view.banner}
                    <Deck text={view.banner.deck} />
                {/if}
                {#if view.bestGame}
                    <div class="best"><BestGame game={view.bestGame} title={view.titles.best_game} /></div>
                {/if}
            </div>
        </div>

        {#if view.numbers.length > 0}
            <NumbersBox lines={view.numbers} title={view.titles.numbers} />
        {/if}

        {#if view.columns.length > 0}
            <div class="columns" style="--n: {view.columns.length};">
                {#each view.columns as story (story.id)}
                    <article class="column">
                        <Headline text={story.headline} deck={story.deck} size="story" lines={3} />
                    </article>
                {/each}
            </div>
        {/if}

        {#if hasLower}
            <div class="lower">
                {#if view.heroes.length > 0}
                    <HeroReport rows={view.heroes} title={view.titles.heroes} />
                {/if}
                {#if view.people}
                    <People people={view.people} title={view.titles.people} />
                {/if}
                {#if view.briefs.length > 0}
                    <Briefs items={view.briefs} />
                {/if}
            </div>
        {/if}
    </div>
</Paper>

<style>
    .layout {
        display: flex;
        flex-direction: column;
        gap: 10px;
        height: 100%;
        min-height: 0;
    }

    .banner {
        padding-bottom: 6px;
        border-bottom: 2px solid var(--fp-ink);
    }

    .lead {
        position: relative;
        display: grid;
        grid-template-columns: 300px minmax(0, 1fr);
        gap: 16px;
        flex: none;
    }

    .lead.solo {
        grid-template-columns: minmax(0, 1fr);
    }

    .loose-stamp {
        position: absolute;
        top: -6px;
        right: 0;
        z-index: 1;
    }

    /* As tall as the photo: a long deck pushes the best game out of sight instead of the page down. */
    .side {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
        overflow: hidden;
        contain: size;
    }

    .lead.solo .side {
        contain: none;
    }

    .best {
        margin-top: auto;
    }

    .columns {
        display: grid;
        grid-template-columns: repeat(var(--n), minmax(0, 1fr));
        flex: none;
        max-height: 190px;
        overflow: hidden;
    }

    .column {
        min-width: 0;
        padding: 0 12px;
    }

    .column:first-child {
        padding-left: 0;
    }

    .column:last-child {
        padding-right: 0;
    }

    .column + .column {
        border-left: 1px solid var(--fp-ink);
    }

    .lower {
        display: grid;
        grid-auto-columns: minmax(0, 1fr);
        grid-auto-flow: column;
        gap: 18px;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        padding-top: 8px;
        border-top: 3px solid var(--fp-ink);
    }
</style>
