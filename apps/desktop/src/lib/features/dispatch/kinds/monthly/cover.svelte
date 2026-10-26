<script lang="ts">
    import { SITE_URL } from "@deadlock-plus/links";
    import { t } from "$lib/core/i18n.svelte";
    import type { CoverArt } from "./art";
    import { fitText } from "./fit-text";
    import type { Magazine } from "./magazine";
    import { paletteStyle } from "./palette";
    import { stickerScale } from "./timeline";

    let {
        mag,
        art,
        glare = -1,
        sticker = 1,
    }: {
        mag: Magazine;
        art: CoverArt;
        /** 0..1 position of the light sweep across the laminate; outside that range it is off. */
        glare?: number;
        /** 0..1 pop-in of the sticker. */
        sticker?: number;
    } = $props();

    const site = new URL(SITE_URL).host;
</script>

<div class="cover" style="{paletteStyle(mag.palette)} --glare: {glare};">
    <div class="backdrop"></div>
    {#if art.backdrop}
        <img class="collage" src={art.backdrop} alt="" />
    {/if}

    <div class="topline">
        <span class="brand">{t("dispatch.monthly.brand")}</span>
        <span class="issue">{mag.issueLine}</span>
    </div>
    <div class="masthead" aria-hidden="true">{t("dispatch.monthly.masthead")}</div>

    {#if mag.coverHero && art.card}
        <img class="star" src={art.card} alt={mag.coverHero.name} />
    {/if}
    <div class="scrim"></div>

    <div class="lines">
        {#if mag.lead}
            <div class="lead">
                <span class="kicker">{mag.lead.kicker}</span>
                <h2 class="lead-head" {@attach fitText(46, 22)}>{mag.lead.headline}</h2>
                <p class="lead-deck" {@attach fitText(17, 12)}>{mag.lead.deck}</p>
            </div>
        {/if}
        {#each mag.coverlines as line (line.id)}
            <div class="line">
                <span class="kicker">
                    <span>{line.kicker}</span>
                    {#if line.pageRef}<i>{line.pageRef}</i>{/if}
                </span>
                <h3 {@attach fitText(21, 13)}>{line.headline}</h3>
            </div>
        {/each}
    </div>

    {#if mag.coverHero}
        <div class="starline">
            <span class="kicker">{t("dispatch.monthly.kicker.top_hero")}</span>
            <div class="name" {@attach fitText(124, 48)}>{mag.coverHero.name}</div>
            <p {@attach fitText(18, 12)}>{mag.coverHero.line}</p>
        </div>
    {/if}

    {#if mag.sticker && sticker > 0}
        <div
            class="sticker"
            class:long={mag.sticker.long}
            style="transform: rotate(9deg) scale({stickerScale(sticker)});"
        >
            <span>{mag.sticker.top}</span>
            <b>{mag.sticker.big}</b>
            <span>{mag.sticker.bottom}</span>
        </div>
    {/if}

    <div class="barcode" aria-hidden="true">
        <div class="bars">
            {#each mag.barcode.bars as w, i (i)}
                <i style="width: {w}px; opacity: {i % 2 === 0 ? 1 : 0};"></i>
            {/each}
        </div>
        <span>{mag.barcode.digits}</span>
        <small>{site}</small>
    </div>

    <div class="gloss" aria-hidden="true"></div>
    <div class="sweep" aria-hidden="true"></div>
</div>

<style>
    .cover {
        position: absolute;
        inset: 0;
        overflow: hidden;
        color: var(--fg);
        background: var(--bg);
        font-family: "Radiance", sans-serif;
    }

    .backdrop {
        position: absolute;
        inset: 0;
        background:
            radial-gradient(ellipse 60% 48% at 64% 52%, var(--glow), transparent 72%),
            radial-gradient(ellipse 120% 80% at 50% 110%, rgb(0 0 0 / 0.35), transparent 60%);
    }

    /* The collage's shape lives in the right half of a 16:9 frame; this puts it behind the star. */
    .collage {
        position: absolute;
        top: 0;
        left: -700px;
        height: 100%;
        width: auto;
        max-width: none;
        opacity: 0.92;
    }

    .topline {
        position: absolute;
        top: 20px;
        left: 30px;
        right: 30px;
        z-index: 1;
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        font-family: "Retail Demo", sans-serif;
        font-weight: 600;
        font-size: 13px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        white-space: nowrap;
        text-shadow: 0 1px 8px rgb(0 0 0 / 0.3);
    }

    .brand {
        color: var(--accent);
        font-weight: 700;
    }

    .issue {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .masthead {
        position: absolute;
        top: 30px;
        left: 0;
        right: 0;
        z-index: 1;
        text-align: center;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 176px;
        line-height: 1;
        letter-spacing: -0.035em;
        text-transform: uppercase;
        text-shadow: 0 4px 24px rgb(0 0 0 / 0.25);
    }

    /* The card is 280x380; 1.5x is as far as it goes and stays sharp. */
    .star {
        position: absolute;
        left: 258px;
        top: 150px;
        width: 420px;
        height: auto;
        z-index: 2;
        filter: drop-shadow(0 18px 30px rgb(0 0 0 / 0.35)) saturate(1.08) contrast(1.04);
    }

    .scrim {
        position: absolute;
        inset: 0;
        z-index: 2;
        background:
            linear-gradient(to top, var(--bg) 0%, color-mix(in oklab, var(--bg) 80%, transparent) 20%, transparent 38%),
            linear-gradient(to right, color-mix(in oklab, var(--bg) 75%, transparent) 0%, transparent 46%);
    }

    .lines {
        position: absolute;
        top: 222px;
        left: 30px;
        width: 284px;
        bottom: 200px;
        z-index: 3;
        display: flex;
        flex-direction: column;
        gap: 14px;
        overflow: hidden;
        text-shadow: 0 1px 12px rgb(0 0 0 / 0.35);
    }

    .kicker {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        color: var(--accent);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
    }

    .kicker i {
        flex: none;
        font-style: normal;
        letter-spacing: 0.06em;
    }

    .lead {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-bottom: 12px;
        border-bottom: 2px solid var(--accent);
    }

    .lead-head {
        max-height: 136px;
        padding-bottom: 0.12em;
        margin: 0;
        overflow: hidden;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: var(--fs, 46px);
        line-height: 0.95;
        text-transform: uppercase;
        overflow-wrap: anywhere;
    }

    .lead-deck {
        max-height: 44px;
        margin: 0;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-style: italic;
        font-weight: 500;
        font-size: var(--fs, 17px);
        line-height: 1.2;
    }

    .line {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .line h3 {
        max-height: 50px;
        padding-bottom: 0.1em;
        margin: 0;
        overflow: hidden;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: var(--fs, 21px);
        line-height: 1.05;
        text-transform: uppercase;
        overflow-wrap: anywhere;
    }

    .starline {
        position: absolute;
        left: 30px;
        right: 200px;
        bottom: 26px;
        z-index: 3;
        text-shadow: 0 1px 12px rgb(0 0 0 / 0.3);
    }

    .name {
        height: 118px;
        overflow: hidden;
        color: var(--accent);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: var(--fs, 124px);
        line-height: 118px;
        letter-spacing: -0.02em;
        text-transform: uppercase;
        white-space: nowrap;
    }

    .starline p {
        max-height: 24px;
        margin: 2px 0 0;
        overflow: hidden;
        font-family: "Valve Oracle", serif;
        font-style: italic;
        font-weight: 500;
        font-size: var(--fs, 18px);
        line-height: 1.3;
        white-space: nowrap;
    }

    .sticker {
        position: absolute;
        top: 548px;
        right: 30px;
        z-index: 4;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 142px;
        height: 142px;
        border-radius: 50%;
        color: var(--bg);
        background: var(--accent);
        box-shadow:
            0 0 0 4px var(--accent),
            0 0 0 6px var(--bg),
            0 10px 24px rgb(0 0 0 / 0.35);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        text-transform: uppercase;
        text-align: center;
        line-height: 1;
    }

    .sticker span {
        max-width: 110px;
        font-size: 12px;
        letter-spacing: 0.12em;
    }

    .sticker b {
        margin: 2px 0;
        font-family: "Valve Oracle", serif;
        font-size: 64px;
        line-height: 0.95;
    }

    .sticker.long b {
        font-size: 30px;
        line-height: 1.2;
    }

    .barcode {
        position: absolute;
        right: 26px;
        bottom: 26px;
        z-index: 4;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        width: 140px;
        padding: 8px 8px 5px;
        background: #fff;
        color: #111;
        font-family: "Radiance", sans-serif;
        font-size: 10px;
        letter-spacing: 0.08em;
    }

    .bars {
        display: flex;
        justify-content: center;
        width: 100%;
        height: 44px;
    }

    .bars i {
        display: block;
        flex: none;
        height: 100%;
        background: #111;
    }

    .barcode small {
        color: #444;
        font-size: 9px;
    }

    .gloss {
        position: absolute;
        inset: 0;
        z-index: 5;
        pointer-events: none;
        background:
            linear-gradient(
                128deg,
                rgb(255 255 255 / 0.22) 0%,
                rgb(255 255 255 / 0.06) 18%,
                transparent 34%,
                transparent 70%,
                rgb(255 255 255 / 0.08) 88%,
                rgb(255 255 255 / 0.16) 100%
            ),
            radial-gradient(circle 260px at var(--px, 120%) var(--py, -20%), rgb(255 255 255 / 0.28), transparent 70%);
        mix-blend-mode: screen;
    }

    .sweep {
        position: absolute;
        top: -20%;
        bottom: -20%;
        left: calc(-60% + var(--glare) * 190%);
        z-index: 6;
        width: 46%;
        pointer-events: none;
        background: linear-gradient(
            90deg,
            transparent,
            rgb(255 255 255 / 0.2) 32%,
            rgb(255 255 255 / 0.85) 50%,
            rgb(255 255 255 / 0.2) 68%,
            transparent
        );
        transform: rotate(18deg);
        mix-blend-mode: screen;
        opacity: clamp(0, calc((var(--glare) + 0.001) * 1000), 1);
    }
</style>
