<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import { fitText } from "./fit-text";
    import Inner from "./inner.svelte";
    import type { Magazine } from "./magazine";
    import { paletteStyle } from "./palette";

    let { mag }: { mag: Magazine } = $props();

    const p = $derived(mag.people);
</script>

<Inner {mag} side="right" folio={5} section={mag.sections.people}>
    <div class="page">
        <span class="kicker">{mag.sections.people}</span>
        <h2 {@attach fitText(50, 32)}>{p.title}</h2>
        {#if p.intro}
            <p class="intro" {@attach fitText(17, 12)}>{p.intro}</p>
        {/if}

        {#if p.mates.length > 0}
            <ol class="mates">
                {#each p.mates as m, i (m.id)}
                    <li>
                        <span class="mono" class:first={i === 0} aria-hidden="true">{m.initial}</span>
                        <div>
                            <b>{m.name}</b>
                            <span>{m.line}</span>
                        </div>
                    </li>
                {/each}
            </ol>
        {/if}

        {#if p.nemesis}
            <div class="nemesis">
                <span class="kicker">{p.nemesis.kicker}</span>
                <b>{p.nemesis.name}</b>
                <span class="nline">{p.nemesis.line}</span>
                {#if p.nemesis.headline}
                    <p {@attach fitText(15, 11)}>{p.nemesis.headline}</p>
                {/if}
            </div>
        {/if}

        {#if mag.rank}
            {@const r = mag.rank}
            <div class="rank">
                <div class="rank-head">
                    <span class="kicker">{r.kicker}</span>
                    {#if r.headline}<b {@attach fitText(19, 13)}>{r.headline}</b>{/if}
                </div>
                <div class="badges">
                    <figure>
                        {#if r.start.image}<img src={r.start.image} alt="" />{/if}
                        <figcaption>{r.start.name}<small>{r.start.caption}</small></figcaption>
                    </figure>
                    <span class="arrow" aria-hidden="true">→</span>
                    <figure>
                        {#if r.end.image}<img src={r.end.image} alt="" />{/if}
                        <figcaption>{r.end.name}<small>{r.end.caption}</small></figcaption>
                    </figure>
                    <figure class="peak">
                        <figcaption><small>{r.peak.caption}</small>{r.peak.name}</figcaption>
                    </figure>
                </div>
            </div>
        {/if}

        <div class="next" style={paletteStyle(mag.nextPalette)}>
            <div>
                <span>{mag.nextLabel}</span>
                <b {@attach fitText(18, 12)}>{mag.next}</b>
            </div>
            <em aria-hidden="true">{t("dispatch.monthly.masthead")}</em>
        </div>
    </div>
</Inner>

<style>
    .page {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 40px 48px 0 84px;
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
        flex: none;
        width: 340px;
        height: 100px;
        margin: 4px 0 0;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: var(--fs, 50px);
        line-height: 0.95;
        letter-spacing: -0.02em;
        text-wrap: balance;
    }

    .intro {
        max-height: 46px;
        margin: 10px 0 0;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-style: italic;
        font-weight: 500;
        font-size: var(--fs, 17px);
        line-height: 1.3;
    }

    .mates {
        margin: 12px 0 0;
        padding: 0;
        list-style: none;
        border-top: 2px solid var(--page-text);
    }

    .mates li {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 9px 0;
        border-bottom: 1px solid #d8d2c6;
    }

    .mono {
        display: flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border: 2px solid var(--ink);
        border-radius: 50%;
        color: var(--ink);
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 24px;
    }

    .mono.first {
        width: 60px;
        height: 60px;
        border-color: var(--bg);
        color: var(--fg);
        background: var(--bg);
        font-size: 30px;
    }

    .mates div {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .mates b {
        overflow: hidden;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 20px;
        line-height: 1.25;
        text-transform: uppercase;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .mates span {
        color: #3a352d;
        font-size: 13px;
    }

    .nemesis {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 16px;
        padding: 14px 18px;
        color: var(--page-dark-text);
        background: var(--page-dark);
    }

    .nemesis .kicker {
        color: var(--night);
    }

    .nemesis b {
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 34px;
        line-height: 1.2;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .nline {
        color: var(--page-dark-muted);
        font-size: 13px;
    }

    .nemesis p {
        max-height: 40px;
        margin: 4px 0 0;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-style: italic;
        font-size: var(--fs, 15px);
        line-height: 1.3;
    }

    .rank {
        margin-top: 16px;
        padding-top: 8px;
        border-top: 2px solid var(--page-text);
    }

    .rank-head {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .rank-head b {
        max-height: 44px;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: var(--fs, 19px);
        line-height: 1.15;
    }

    .badges {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 8px;
    }

    figure {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        margin: 0;
    }

    figure img {
        flex: none;
        width: 76px;
        height: 76px;
        object-fit: contain;
    }

    figcaption {
        display: flex;
        flex-direction: column;
        min-width: 0;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 14px;
        line-height: 1.1;
        text-transform: uppercase;
    }

    figcaption small {
        color: var(--page-muted);
        font-weight: 600;
        font-size: 10px;
        letter-spacing: 0.1em;
    }

    .peak {
        flex: none;
        margin-left: auto;
        padding-left: 12px;
        border-left: 1px solid #d8d2c6;
    }

    .arrow {
        color: var(--ink);
        font-size: 26px;
    }

    .next {
        position: relative;
        display: flex;
        flex: none;
        align-items: flex-end;
        justify-content: space-between;
        height: 120px;
        margin: auto -48px 0 0;
        padding: 16px 48px 16px 20px;
        overflow: hidden;
        color: var(--fg);
        background: var(--bg);
    }

    .next div {
        position: relative;
        z-index: 1;
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
    }

    .next em {
        position: absolute;
        top: -16px;
        right: 40px;
        font-family: "Valve Oracle", serif;
        font-style: normal;
        font-weight: 600;
        font-size: 120px;
        line-height: 1;
        letter-spacing: -0.03em;
        text-transform: uppercase;
        white-space: nowrap;
        opacity: 0.18;
    }

    .next span {
        color: var(--accent);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
    }

    .next b {
        max-height: 24px;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-style: italic;
        font-weight: 500;
        font-size: var(--fs, 18px);
        line-height: 1.3;
        white-space: nowrap;
    }
</style>
