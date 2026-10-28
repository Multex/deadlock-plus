<script module lang="ts">
    import { SECTION_IDS as IDS } from "../edition-view";

    export const SECTION_IDS = IDS;
</script>

<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Briefs from "$lib/features/front-page/paper/briefs.svelte";
    import Deck from "$lib/features/front-page/paper/deck.svelte";
    import Headline from "$lib/features/front-page/paper/headline.svelte";
    import Paper from "$lib/features/front-page/paper/paper.svelte";
    import Photo from "$lib/features/front-page/paper/photo.svelte";
    import Stamp from "$lib/features/front-page/paper/stamp.svelte";
    import ExportFooter from "$lib/features/match-history/components/detail/export-footer.svelte";
    import { CARD_SIZES, KIND_INKS, type CardAspect, type EditionView, type SectionId } from "../edition-view";
    import BestGame from "./best-game.svelte";
    import EditionMasthead from "./edition-masthead.svelte";
    import { fillGap, fillScale, fitLines, fitMasthead, overflows, relayout, resetFill } from "./fill";
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

    /** How far a section's type may grow or shrink to fill the card, then how far apart its rows may spread, in px. */
    const FILL: Record<Exclude<SectionId, "front">, [number, number, number]> = {
        stories: [0.75, 2, 60],
        numbers: [0.6, 2, 60],
        best_game: [1, 3, 0],
        heroes: [0.6, 2.5, 56],
        people: [0.6, 2.5, 60],
    };

    const size = $derived(CARD_SIZES[aspect]);
    const wide = $derived(aspect === "16:9");
    const tall = $derived(aspect === "9:16");
    const stamped = $derived(live ?? view.live);

    function layout(root: HTMLElement) {
        void view;
        void section;
        void aspect;
        return relayout(root, ".banner", () => {
            fitMasthead(root);
            const body = root.querySelector<HTMLElement>(".body");
            if (!body) return;
            if (section === "front") {
                const deck = body.querySelector<HTMLElement>(".front-deck");
                if (deck && wide) fillScale(deck, 1, 2.4);
                return;
            }
            resetFill(body);
            for (const li of body.querySelectorAll<HTMLElement>(".briefs li")) li.style.display = "";
            const [min, max, gap] = FILL[section];
            fillScale(body, min, max);
            // Briefs that still do not fit at the smallest type leave whole, never cut mid-line.
            const briefs = [...body.querySelectorAll<HTMLElement>(".briefs li")];
            while (overflows(body) && briefs.length > 1) {
                briefs.pop()!.style.display = "none";
                fillScale(body, min, max);
            }
            fitLines(body);
            // Type that stopped growing at the card's width leaves height over: the rows take it.
            fillGap(body, gap);
            // Beside the wide card's stories the briefs have a column of their own to fill.
            const side = wide ? body.querySelector<HTMLElement>(":scope > .briefs") : null;
            if (side) {
                const scale = parseFloat(body.style.getPropertyValue("--fit-scale")) || 1;
                fillScale(side, scale, scale * 1.8);
                fillGap(side, 24);
            }
        });
    }
</script>

<div
    class="card"
    class:wide
    class:tall
    role="group"
    aria-label={view.titles[section]}
    style="width: {size.width}px; height: {size.height}px; --s: {size.scale};"
>
    <Paper width={size.width} height={size.height - size.footer} angle={0} label={view.label}>
        <div class="layout kind-{view.kind}" style={KIND_INKS[view.kind]} {@attach layout}>
            <EditionMasthead {view} />
            {#if section !== "front"}
                <h2 class="title">{view.titles[section]}</h2>
            {/if}

            <div class="body is-{section}">
                {#if section === "front"}
                    {#if view.banner}
                        <div class="banner">
                            <Headline
                                text={view.banner.headline}
                                size="banner"
                                max={tall ? 92 : wide ? 84 : 72}
                                min={30}
                                lines={3}
                            />
                        </div>
                    {/if}
                    {#if view.photo}
                        <div class="front-photo">
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
                        </div>
                    {/if}
                    {#if view.banner}
                        <div class="front-deck"><Deck text={view.banner.deck} /></div>
                    {/if}
                {:else if section === "stories"}
                    <div class="stories">
                        {#each view.columns as story (story.id)}
                            <article class="story">
                                <h3>{story.headline}</h3>
                                <p>{story.deck}</p>
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
                        head={false}
                        ledger
                    />
                {:else if section === "best_game" && view.bestGame}
                    {#if !tall}
                        <div class="best-wide">
                            <div class="best-photo">
                                <Photo src={view.bestGame.art} alt={view.bestGame.hero} height={size.photo} />
                            </div>
                            <BestGame
                                game={view.bestGame}
                                title={view.titles.best_game}
                                scale={size.scale}
                                head={false}
                            />
                        </div>
                    {:else}
                        <BestGame
                            game={view.bestGame}
                            title={view.titles.best_game}
                            scale={size.scale}
                            photo={size.photo}
                            head={false}
                            fill
                        />
                    {/if}
                {:else if section === "heroes"}
                    <HeroReport rows={view.heroes} title={view.titles.heroes} scale={size.scale * 1.2} head={false} />
                {:else if section === "people" && view.people}
                    <People
                        people={view.people}
                        title={view.titles.people}
                        scale={size.scale}
                        head={false}
                        row={wide}
                        spread={!tall && !wide}
                    />
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
        border-bottom: 3px solid var(--dp-rule, var(--fp-ink));
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

    /* A section whose type stops growing at the card's width sits in the middle instead of leaving a band below. */
    .body.is-numbers,
    .body.is-heroes,
    .body.is-people,
    .card:not(.tall) .body.is-best_game {
        justify-content: safe center;
    }

    .banner {
        flex: none;
        padding-bottom: 6px;
        border-bottom: 2px solid var(--dp-rule, var(--fp-ink));
    }

    /* The picture takes whatever height the headline and deck leave; a zero flex basis overrides the kit's fixed one. */
    .front-photo {
        display: flex;
        flex: 1 1 0;
        flex-direction: column;
        min-height: 160px;
    }

    .front-photo :global(.photo) {
        display: flex;
        flex: 1 1 0;
        flex-direction: column;
        min-height: 0;
    }

    .front-photo :global(.frame) {
        flex: 1 1 0;
        min-height: 0;
    }

    .front-deck {
        flex: none;
        min-width: 0;
    }

    .body.is-front .front-deck :global(.deck) {
        font-size: calc(18px * var(--s) * var(--fit-scale, 1));
    }

    .card.wide .body.is-front {
        display: grid;
        grid-template-columns: 380px minmax(0, 1fr);
        grid-template-rows: auto minmax(0, 1fr);
        column-gap: 18px;
    }

    .card.wide .body.is-front .banner {
        grid-column: 2;
        grid-row: 1;
    }

    .card.wide .front-photo {
        grid-column: 1;
        grid-row: 1 / span 2;
        min-height: 0;
    }

    .card.wide .front-deck {
        grid-column: 2;
        grid-row: 2;
        overflow: hidden;
    }

    .stories {
        display: flex;
        flex-direction: column;
        gap: calc(10px * var(--fit-scale, 1) + var(--row-gap, 0px) / 2);
    }

    .card.wide .stories {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 24px;
    }

    .story + .story {
        padding-top: calc(10px * var(--fit-scale, 1) + var(--row-gap, 0px) / 2);
        border-top: 1px solid var(--dp-rule, var(--fp-ink));
    }

    .card.wide .story:nth-child(2) {
        padding-top: 0;
        border-top: 0;
    }

    .story h3 {
        margin: 0 0 3px;
        color: var(--fp-ink);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: calc(18px * var(--s) * var(--fit-scale, 1));
        line-height: 1.05;
        text-transform: uppercase;
        overflow-wrap: break-word;
    }

    .story p {
        margin: 0;
        font-size: calc(9px * var(--s) * var(--fit-scale, 1));
        line-height: 1.3;
    }

    .briefs {
        padding-top: 8px;
        border-top: 3px solid var(--dp-rule, var(--fp-ink));
    }

    .briefs :global(h4) {
        font-size: calc(10px * var(--s) * var(--fit-scale, 1));
    }

    .briefs :global(ul) {
        font-size: calc(8px * var(--s) * var(--fit-scale, 1));
    }

    .card:not(.tall):not(.wide) .briefs :global(ul) {
        column-gap: 24px;
        columns: 2;
    }

    .briefs :global(li) {
        break-inside: avoid;
    }

    .briefs :global(li + li) {
        margin-top: calc(6px * var(--fit-scale, 1) + var(--row-gap, 0px));
    }

    .card.wide .body.is-stories {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
        column-gap: 24px;
    }

    .card.wide .body.is-stories > .briefs {
        min-height: 0;
        overflow: hidden;
        padding-top: 0;
        padding-left: 18px;
        border-top: 0;
        border-left: 3px solid var(--dp-rule, var(--fp-ink));
    }

    .best-wide {
        display: grid;
        grid-template-columns: 300px minmax(0, 1fr);
        gap: 18px;
        align-items: center;
        height: 100%;
    }

    /* On a square card the facts column is narrow: the grade sits above the facts instead of beside them. */
    .card:not(.tall):not(.wide) .best-wide :global(.line) {
        grid-template-columns: minmax(0, 1fr);
        justify-items: start;
    }

    .card.wide .best-wide {
        grid-template-columns: 380px minmax(0, 1fr);
    }

    .best-photo {
        display: flex;
        flex-direction: column;
        align-self: stretch;
    }

    .best-photo :global(.photo) {
        display: flex;
        flex: 1 1 0;
        flex-direction: column;
    }

    .best-photo :global(.frame) {
        flex: 1 1 0;
        min-height: 0;
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
    }

    /* The bar, not the footer box, takes the slot's height: its rule is drawn at its top edge and must meet the paper. */
    .foot :global(.bar) {
        flex: 1;
    }
</style>
