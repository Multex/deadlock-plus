<script lang="ts">
    import { fitText } from "./fit-text";
    import Inner from "./inner.svelte";
    import type { Magazine } from "./magazine";

    let { mag }: { mag: Magazine } = $props();

    const b = $derived(mag.best);
</script>

<Inner {mag} side="left" folio={4} section={mag.sections.best}>
    <div class="page">
        {#if b}
            <div class="photo">
                {#if b.grade}
                    <span class="grade" aria-hidden="true">{b.grade}</span>
                {/if}
                {#if b.art}
                    <img src={b.art} alt={b.hero} />
                {/if}
                <div class="tag">
                    <span>{b.hero}</span>
                    <span>{b.date}</span>
                </div>
            </div>
            <div class="words">
                <span class="kicker">{b.kicker}</span>
                <h2 {@attach fitText(44, 24)}>{b.headline}</h2>
                {#if b.deck}
                    <p {@attach fitText(17, 12)}>{b.deck}</p>
                {/if}
            </div>
            <div class="line">
                <div><b {@attach fitText(50, 26)}>{b.kills}</b><small>{b.labels.kills}</small></div>
                <div><b {@attach fitText(50, 26)}>{b.deaths}</b><small>{b.labels.deaths}</small></div>
                <div><b {@attach fitText(50, 26)}>{b.assists}</b><small>{b.labels.assists}</small></div>
                <div class="nw"><b {@attach fitText(34, 20)}>{b.netWorth}</b><small>{b.labels.netWorth}</small></div>
                {#if b.grade}
                    <div class="g"><b {@attach fitText(34, 20)}>{b.grade}</b><small>{b.labels.grade}</small></div>
                {/if}
            </div>
        {/if}
        {#if mag.also.stories.length > 0}
            <div class="also">
                <h3>{mag.also.title}</h3>
                <div class="also-cols">
                    {#each mag.also.stories as a (a.id)}
                        <article>
                            <span class="kicker">{a.kicker}</span>
                            <b {@attach fitText(15, 11)}>{a.headline}</b>
                            <p {@attach fitText(12.5, 10)}>{a.deck}</p>
                        </article>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</Inner>

<style>
    .page {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .photo {
        position: relative;
        flex: none;
        height: 450px;
        overflow: hidden;
        background:
            radial-gradient(ellipse 60% 70% at 55% 70%, color-mix(in oklab, var(--glow) 55%, #000), transparent 75%),
            var(--page-dark);
    }

    .grade {
        position: absolute;
        top: -40px;
        left: 30px;
        color: var(--night);
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 420px;
        line-height: 1;
        white-space: nowrap;
        opacity: 0.9;
    }

    /* The 280x380 card at about 1.3x: no larger, so it stays sharp. */
    .photo img {
        position: absolute;
        left: 210px;
        bottom: 0;
        width: 370px;
        filter: drop-shadow(0 12px 24px rgb(0 0 0 / 0.5));
    }

    .tag {
        position: absolute;
        right: 84px;
        bottom: 16px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        color: var(--page-dark-text);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        text-shadow: 0 1px 6px rgb(0 0 0 / 0.6);
    }

    .words {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 20px 84px 0 48px;
    }

    .kicker {
        color: var(--ink);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
    }

    h2 {
        max-height: 100px;
        padding-bottom: 0.14em;
        margin: 0;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: var(--fs, 44px);
        line-height: 1;
        letter-spacing: -0.015em;
    }

    .words p {
        max-height: 44px;
        margin: 0;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-style: italic;
        font-weight: 500;
        font-size: var(--fs, 17px);
        line-height: 1.25;
    }

    .line {
        display: flex;
        margin: 12px 84px 0 48px;
        border-top: 2px solid var(--page-text);
        border-bottom: 1px solid var(--page-text);
    }

    .line div {
        display: flex;
        flex: 1;
        flex-direction: column;
        justify-content: flex-end;
        min-width: 0;
        padding: 6px 0 6px 10px;
    }

    .line div:first-child {
        padding-left: 0;
    }

    .line div + div {
        border-left: 1px solid #d8d2c6;
    }

    .line b {
        height: 50px;
        overflow: hidden;
        color: var(--ink);
        font-family: "Valve Oracle", serif;
        font-weight: 100;
        font-size: var(--fs, 50px);
        line-height: 50px;
        white-space: nowrap;
    }

    .line .nw b,
    .line .g b {
        font-weight: 600;
        font-size: var(--fs, 34px);
    }

    .line small {
        overflow: hidden;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .also {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 0;
        margin: 16px 84px 0 48px;
    }

    .also h3 {
        margin: 0 0 8px;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 22px;
    }

    .also-cols {
        display: grid;
        flex: 1;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        min-height: 0;
    }

    article {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
        min-height: 0;
    }

    article + article {
        padding-left: 14px;
        border-left: 1px solid #d8d2c6;
    }

    article b {
        max-height: 50px;
        flex: none;
        overflow: hidden;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: var(--fs, 15px);
        line-height: 1.1;
        text-transform: uppercase;
    }

    article p {
        max-height: 70px;
        margin: 0;
        overflow: hidden;
        color: #3a352d;
        font-size: var(--fs, 12.5px);
        line-height: 1.3;
    }
</style>
