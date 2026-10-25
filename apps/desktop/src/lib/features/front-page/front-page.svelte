<script lang="ts">
    import { PAPER_HEIGHT, PAPER_WIDTH, type FrontPageView } from "./front-page-view";
    import BoxScore from "./paper/box-score.svelte";
    import Briefs from "./paper/briefs.svelte";
    import Deck from "./paper/deck.svelte";
    import Headline from "./paper/headline.svelte";
    import LaneReport from "./paper/lane-report.svelte";
    import Masthead from "./paper/masthead.svelte";
    import ObjectivesStrip from "./paper/objectives-strip.svelte";
    import Paper from "./paper/paper.svelte";
    import Photo from "./paper/photo.svelte";
    import Ratings from "./paper/ratings.svelte";
    import Stamp from "./paper/stamp.svelte";
    import TeamScore from "./paper/team-score.svelte";

    let { view }: { view: FrontPageView } = $props();

    const graded = $derived(view.ratings.length > 0);
</script>

<Paper width={PAPER_WIDTH} height={PAPER_HEIGHT} angle={0} label={view.label}>
    <div class="layout">
        <Masthead
            name={view.masthead.name}
            date={view.masthead.date}
            edition={view.masthead.edition}
            detail={view.masthead.detail}
            weather={view.masthead.weather}
        />

        {#if view.banner}
            <div class="banner">
                <Headline text={view.banner.headline} kicker={view.banner.kicker} size="banner" />
            </div>
        {/if}

        <div class="lead">
            <Photo src={view.photo.src} alt={view.photo.alt} caption={view.photo.caption} height={250}>
                {#if view.photo.stamp}
                    <Stamp text={view.photo.stamp.text} tone={view.photo.stamp.tone} />
                {/if}
            </Photo>
            <div class="side">
                {#if view.banner}
                    <Deck text={view.banner.deck} />
                {/if}
                {#if view.lead}
                    <Headline text={view.lead.headline} deck={view.lead.deck} size="story" />
                {/if}
                <div class="score"><TeamScore teams={view.score} /></div>
            </div>
        </div>

        <BoxScore teams={view.box} />

        <div class="lower" class:graded>
            {#if graded}
                <Ratings rows={view.ratings} />
            {/if}
            <LaneReport lanes={view.lanes} />
            {#if view.briefs.length > 0}
                <Briefs items={view.briefs} />
            {/if}
        </div>

        <div class="objectives">
            <ObjectivesStrip
                marks={view.objectives.marks}
                durationS={view.objectives.durationS}
                teamNames={view.objectives.teamNames}
            />
        </div>
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
        display: grid;
        grid-template-columns: 290px minmax(0, 1fr);
        gap: 16px;
    }

    .side {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
    }

    .score {
        margin-top: auto;
    }

    .lower {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
        gap: 18px;
        padding-top: 8px;
        border-top: 3px solid var(--fp-ink);
    }

    .lower.graded {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.3fr);
    }

    .objectives {
        margin-top: auto;
    }
</style>
