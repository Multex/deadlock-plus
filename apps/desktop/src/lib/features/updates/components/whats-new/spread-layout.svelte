<script lang="ts">
    import type { Snippet } from "svelte";
    import { formatDate, t, tn } from "$lib/core/i18n.svelte";
    import Masthead from "$lib/features/front-page/paper/masthead.svelte";
    import { PAPER_STYLE } from "$lib/features/front-page/paper/tokens";
    import { releaseDay } from "../../release-date";
    import type { Brief, ReleaseStory } from "../../release-story";

    let { story, actions }: { story: ReleaseStory; actions?: Snippet } = $props();

    const day = $derived(releaseDay(story.date));
    const lead = $derived(story.headlines[0]);
    const stories = $derived(story.headlines.slice(1));
    const tally = $derived(
        (["added", "changed", "fixed"] as const)
            .filter((kind) => story.counts[kind] > 0)
            .map((kind) => tn(`whats_new.count_${kind}`, story.counts[kind]))
            .join("  ·  "),
    );

    function boxTitle(brief: Brief): string {
        if (brief.kind === "added") return t("whats_new.also_new");
        if (brief.kind === "changed") return t("whats_new.in_brief");
        if (brief.kind === "fixed") return t("whats_new.corrections");
        if (brief.kind === "removed") return t("whats_new.section_removed");
        return brief.title;
    }
</script>

<div class="desk">
    <article class="sheet" style={PAPER_STYLE}>
        <Masthead
            name={t("whats_new.title")}
            date={day ? formatDate(day, { dateStyle: "full" }) : ""}
            edition={t("whats_new.version", { version: story.version })}
            detail={tally}
        />

        {#if lead}
            <section class="lead-story">
                <span class="label">{t("whats_new.lead_story")}</span>
                <h2>{lead.title}</h2>
                <p class="deck">{lead.lead}</p>
                {#if lead.points.length > 0}
                    <div class="body">
                        {#each lead.points as point, i (i)}
                            <p class:dropcap={i === 0}>{point}</p>
                        {/each}
                    </div>
                {/if}
            </section>
        {/if}

        {#if stories.length > 0}
            <div class="stories">
                {#each stories as s, i (i)}
                    <section class="story">
                        <h3>{s.title}</h3>
                        <p class="story-deck">{s.lead}</p>
                        {#each s.points as point, j (j)}
                            <p>{point}</p>
                        {/each}
                    </section>
                {/each}
            </div>
        {/if}

        {#if story.briefs.length > 0}
            <div class="boxes">
                {#each story.briefs as brief (brief.title)}
                    <section class="box kind-{brief.kind}">
                        <h4>{boxTitle(brief)}</h4>
                        {#each brief.items as item, j (j)}
                            <p>{item}</p>
                        {/each}
                        {#each brief.groups as group (group.title)}
                            <h5>{group.title}</h5>
                            {#each group.items as item, j (j)}
                                <p>{item}</p>
                            {/each}
                        {/each}
                    </section>
                {/each}
            </div>
        {/if}
    </article>

    {#if actions}
        <footer class="actions">{@render actions()}</footer>
    {/if}
</div>

<style>
    .desk {
        container-type: inline-size;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        padding: clamp(12px, 3cqi, 36px) clamp(8px, 3cqi, 40px) 40px;
    }

    /* The sheet is an object on the desk, like the Dispatch papers: its inks stay the same on every theme. */
    .sheet {
        position: relative;
        width: 100%;
        max-width: 1180px;
        padding: clamp(14px, 2.4cqi, 30px) clamp(14px, 3cqi, 38px) clamp(18px, 3cqi, 34px);
        color: var(--fp-ink);
        font-family: "Radiance", sans-serif;
        font-size: 14px;
        line-height: 1.35;
        background-color: var(--fp-paper);
        background-image:
            radial-gradient(ellipse at 50% 30%, transparent 60%, var(--fp-paper-edge) 140%),
            linear-gradient(100deg, rgb(255 255 255 / 0.18), transparent 40%, rgb(120 90 40 / 0.06));
        box-shadow:
            inset 0 0 0 1px rgb(120 95 55 / 0.25),
            0 1px 2px rgb(0 0 0 / 0.35),
            0 14px 28px -6px rgb(0 0 0 / 0.5),
            0 38px 80px -18px rgb(0 0 0 / 0.6);
        rotate: -0.25deg;
    }

    .sheet :global(.masthead h1) {
        font-size: clamp(30px, 6cqi, 72px);
        text-align: center;
        letter-spacing: 0.01em;
    }

    .lead-story {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        padding: clamp(14px, 2cqi, 22px) 0 clamp(14px, 2cqi, 20px);
        border-bottom: 4px double var(--fp-ink);
    }

    .label {
        justify-self: start;
        margin-bottom: 8px;
        padding: 2px 8px;
        background: var(--fp-spot);
        color: var(--fp-paper);
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 13px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }

    .lead-story h2 {
        margin: 0;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: clamp(38px, 8.4cqi, 104px);
        line-height: 0.88;
        letter-spacing: -0.03em;
        text-transform: uppercase;
        color: var(--fp-ink);
    }

    .deck {
        max-width: 62ch;
        margin: 10px 0 0;
        font-family: "Valve Oracle", serif;
        font-weight: 500;
        font-style: italic;
        font-size: clamp(17px, 2.2cqi, 24px);
        line-height: 1.25;
        color: var(--fp-ink-soft);
    }

    .body {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid var(--fp-ink);
        columns: 4 200px;
        column-gap: 22px;
        column-rule: 1px solid color-mix(in oklch, var(--fp-ink) 35%, transparent);
        text-align: justify;
        hyphens: auto;
    }

    .body p,
    .story p,
    .box p {
        margin: 0 0 7px;
    }

    .dropcap::first-letter {
        float: left;
        margin: 4px 6px 0 0;
        font-family: "Valve Pulp", sans-serif;
        font-size: 50px;
        line-height: 0.8;
        color: var(--fp-spot);
    }

    .stories {
        padding: 16px 0;
        columns: 3 250px;
        column-gap: 24px;
        column-rule: 1px solid color-mix(in oklch, var(--fp-ink) 35%, transparent);
        border-bottom: 4px double var(--fp-ink);
    }

    .story {
        margin-bottom: 18px;
        text-align: justify;
        hyphens: auto;
    }

    .story h3 {
        margin: 0;
        break-after: avoid;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 26px;
        line-height: 0.95;
        letter-spacing: -0.015em;
        text-transform: uppercase;
        text-align: left;
    }

    .story-deck {
        break-after: avoid;
        padding: 4px 0 6px;
        border-bottom: 1px solid var(--fp-ink);
        font-family: "Valve Oracle", serif;
        font-style: italic;
        font-size: 16px;
        line-height: 1.2;
        text-align: left;
        color: var(--fp-ink-soft);
    }

    .boxes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
        padding-top: 16px;
    }

    .box {
        padding: 10px 12px 6px;
        border: 2px solid var(--fp-ink);
        font-size: 13px;
    }

    .box.kind-fixed {
        background: var(--fp-highlight);
    }

    .box h4 {
        margin: -10px -12px 8px;
        padding: 4px 12px;
        background: var(--fp-ink);
        color: var(--fp-paper);
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 15px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }

    .box h5 {
        margin: 8px 0 4px;
        color: var(--fp-spot);
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 14px;
        text-transform: uppercase;
    }

    .box p {
        padding-left: 12px;
        text-indent: -12px;
    }

    .box p::before {
        content: "\25A0";
        display: inline-block;
        width: 12px;
        text-indent: 0;
        font-size: 8px;
        vertical-align: 2px;
        color: var(--fp-spot);
    }

    .actions {
        display: flex;
        gap: 10px;
    }

    @container (max-width: 640px) {
        .sheet {
            rotate: none;
        }

        .sheet :global(.dateline) {
            flex-wrap: wrap;
            white-space: normal;
        }
    }
</style>
