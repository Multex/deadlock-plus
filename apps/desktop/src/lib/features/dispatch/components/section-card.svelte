<script module lang="ts">
    import { SECTION_IDS as IDS } from "../edition-view";

    export const SECTION_IDS = IDS;
</script>

<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Briefs from "$lib/features/front-page/paper/briefs.svelte";
    import Deck from "$lib/features/front-page/paper/deck.svelte";
    import Headline from "$lib/features/front-page/paper/headline.svelte";
    import Masthead from "$lib/features/front-page/paper/masthead.svelte";
    import Paper from "$lib/features/front-page/paper/paper.svelte";
    import Photo from "$lib/features/front-page/paper/photo.svelte";
    import Stamp from "$lib/features/front-page/paper/stamp.svelte";
    import ExportFooter from "$lib/features/match-history/components/detail/export-footer.svelte";
    import { CARD_SIZES, type CardAspect, type EditionView, type SectionId } from "../edition-view";
    import BestGame from "./best-game.svelte";
    import HeroReport from "./hero-report.svelte";
    import NumbersBox from "./numbers-box.svelte";
    import People from "./people.svelte";

    let {
        view,
        section,
        aspect,
        live,
    }: {
        view: EditionView;
        section: SectionId;
        aspect: CardAspect;
        /** Defaults to the view's own. */
        live?: boolean;
    } = $props();

    /** Columns of the numbers box: a tall ledger on a story card, one row across a wide one. */
    const NUMBER_COLUMNS: Record<CardAspect, number> = { "9:16": 1, "1:1": 2, "16:9": 5 };

    const size = $derived(CARD_SIZES[aspect]);
    const wide = $derived(aspect === "16:9");
    const stamped = $derived(live ?? view.live);
</script>

<div
    class="card"
    class:wide
    class:tall={aspect === "9:16"}
    role="group"
    aria-label={view.titles[section]}
    style="width: {size.width}px; height: {size.height}px; --s: {size.scale};"
>
    <Paper width={size.width} height={size.height - size.footer} angle={0} label={view.label}>
        <div class="layout">
            <Masthead
                name={view.masthead.name}
                date={view.masthead.date}
                edition={view.masthead.edition}
                detail={view.masthead.issue}
            />
            {#if section !== "front"}
                <h2 class="title">{view.titles[section]}</h2>
            {/if}

            <div class="body {section}">
                {#if section === "front"}
                    {#if view.banner}
                        <div class="banner">
                            <Headline
                                text={view.banner.headline}
                                size="banner"
                                max={wide ? 56 : 68}
                                min={30}
                                lines={aspect === "9:16" || wide ? 3 : 2}
                            />
                        </div>
                    {/if}
                    <div class="front-lead">
                        {#if view.photo}
                            <Photo
                                src={view.photo.src}
                                alt={view.photo.alt}
                                caption={view.photo.caption}
                                height={size.photo}
                            >
                                {#if stamped}
                                    <Stamp text={t("dispatch.stamp.so_far")} tone="spot" />
                                {/if}
                            </Photo>
                        {/if}
                        {#if view.banner}
                            <div class="front-deck"><Deck text={view.banner.deck} /></div>
                        {/if}
                    </div>
                {:else if section === "stories"}
                    <div class="stories">
                        {#each view.columns as story (story.id)}
                            <article class="story">
                                <Headline
                                    text={story.headline}
                                    deck={story.deck}
                                    size="story"
                                    max={Math.round(18 * size.scale)}
                                    min={16}
                                />
                            </article>
                        {/each}
                    </div>
                    {#if view.briefs.length > 0}
                        <div class="briefs"><Briefs items={view.briefs} /></div>
                    {/if}
                {:else if section === "numbers"}
                    <NumbersBox
                        lines={view.numbers}
                        title={view.titles.numbers}
                        scale={size.scale * 1.3}
                        columns={NUMBER_COLUMNS[aspect]}
                    />
                {:else if section === "best_game" && view.bestGame}
                    {#if wide}
                        <div class="best-wide">
                            <Photo src={view.bestGame.art} alt={view.bestGame.hero} height={size.photo} />
                            <BestGame game={view.bestGame} title={view.titles.best_game} scale={size.scale} />
                        </div>
                    {:else}
                        <BestGame
                            game={view.bestGame}
                            title={view.titles.best_game}
                            scale={size.scale}
                            photo={size.photo}
                        />
                    {/if}
                {:else if section === "heroes"}
                    <HeroReport rows={view.heroes} title={view.titles.heroes} scale={size.scale * 1.2} />
                {:else if section === "people" && view.people}
                    <People people={view.people} title={view.titles.people} scale={size.scale} />
                {/if}
            </div>
        </div>
    </Paper>
    <div class="foot" style="height: {size.footer}px;">
        <ExportFooter label={t("match_history.detail.export.made_with")} />
    </div>
</div>

<style>
    .card {
        display: flex;
        flex-direction: column;
        flex: none;
        overflow: hidden;
    }

    .layout {
        display: flex;
        flex-direction: column;
        gap: 12px;
        height: 100%;
        min-height: 0;
    }

    .title {
        margin: 0;
        padding: 2px 0 4px;
        border-bottom: 3px solid var(--fp-ink);
        color: var(--fp-spot);
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: calc(17px * var(--s));
        line-height: 1.05;
        text-transform: uppercase;
    }

    .body {
        display: flex;
        flex-direction: column;
        gap: 12px;
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    .banner {
        padding-bottom: 6px;
        border-bottom: 2px solid var(--fp-ink);
    }

    .front-lead {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 0;
    }

    .front-deck {
        min-width: 0;
    }

    .card:not(.tall) .front-lead {
        display: grid;
        grid-template-columns: 300px minmax(0, 1fr);
        gap: 16px;
    }

    .card.wide .body.front {
        display: grid;
        grid-template-columns: 380px minmax(0, 1fr);
        grid-template-rows: auto minmax(0, 1fr);
        column-gap: 18px;
    }

    .card.wide .body.front .banner {
        grid-column: 2;
        grid-row: 1;
    }

    .card.wide .front-lead {
        display: contents;
    }

    .card.wide .front-lead > :global(.photo) {
        grid-column: 1;
        grid-row: 1 / span 2;
    }

    .card.wide .front-deck {
        grid-column: 2;
        grid-row: 2;
    }

    .stories {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .card.wide .stories {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 24px;
        row-gap: 12px;
    }

    .story + .story {
        padding-top: 10px;
        border-top: 1px solid var(--fp-ink);
    }

    .card.wide .story {
        padding-top: 0;
        border-top: 0;
    }

    .briefs {
        padding-top: 8px;
        border-top: 3px solid var(--fp-ink);
    }

    .best-wide {
        display: grid;
        grid-template-columns: 380px minmax(0, 1fr);
        gap: 18px;
        align-items: start;
    }

    /* The footer fills its fixed slot so every aspect exports at exactly its size. */
    .foot {
        display: flex;
        flex: none;
        flex-direction: column;
    }

    .foot > :global(*) {
        display: flex;
        flex: 1;
        flex-direction: column;
        justify-content: center;
    }
</style>
