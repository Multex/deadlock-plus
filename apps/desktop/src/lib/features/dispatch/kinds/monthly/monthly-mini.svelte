<script lang="ts">
    import MiniFrame from "../mini-frame.svelte";
    import MiniMast from "../mini-mast.svelte";
    import MiniPrint from "../mini-print.svelte";
    import { miniFormat, miniMonth, miniText, type MiniCopy, type MiniCover, type MonthlyMiniText } from "../minis";
    import { artColour, sampleArtColour } from "./cover-colour.svelte";
    import { MONTH_PALETTES, coverPalette } from "./palette";

    let { copy, cover, height }: { copy: MiniCopy; cover?: MiniCover; height: number } = $props();

    const text = $derived(miniText(copy, cover, miniFormat()) as MonthlyMiniText);
    const proof = $derived(copy.state === "proof");
    // An issued copy wears its cover's colour; a proof has no cover yet, so it keeps the month's.
    const starId = $derived(proof ? null : (cover?.heroId ?? null));
    const pal = $derived(
        starId === null
            ? MONTH_PALETTES[miniMonth(copy.window)]!
            : coverPalette(artColour(starId), cover?.colour, miniMonth(copy.window) + 1),
    );

    $effect(() => {
        if (starId !== null) void sampleArtColour(starId);
    });
    // Sized to the part of the cover still showing when copies pack over each other.
    const monthSize = $derived(Math.min(40, 132 / (text.month.length * 0.62)));
</script>

<MiniFrame {copy} {height}>
    <span
        class="monthly"
        class:proof
        style="--bg: {pal.bg}; --glow: {pal.glow}; --accent: {pal.accent}; --fg: {pal.fg}; --ink: {pal.ink};"
    >
        {#if proof}
            <span class="crop tl"></span><span class="crop tr"></span><span class="crop bl"></span><span class="crop br"
            ></span>
            <span class="top">{text.top}</span>
            <MiniMast text={text.mast} w={216} h={50} fill="none" stroke={pal.ink} />
            <span class="hole">{text.coverStar}</span>
            <span class="month" style="font-size: {monthSize}px; color: {pal.ink};">{text.month}</span>
            <span class="year" style="color: {pal.ink};">{text.year}</span>
            <MiniPrint label={text.print} ink={pal.ink} />
        {:else}
            <span class="glow"></span>
            {#if cover?.portrait}<img class="star" src={cover.portrait} alt="" />{/if}
            <span class="top">{text.top}</span>
            <MiniMast text={text.mast} w={216} h={50} fill={pal.fg} />
            {#if text.line}<span class="line">{text.line}</span>{/if}
            <span class="month" style="font-size: {monthSize}px;">{text.month}</span>
            <span class="year">{text.year}</span>
            <span class="sheen"></span>
        {/if}
    </span>
</MiniFrame>

<style>
    /* A glossy magazine in its month's colour. */
    .monthly {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 12px;
        background: var(--bg);
        color: var(--fg);
        box-shadow: inset 3px 0 0 rgb(0 0 0 / 0.25);
    }

    .glow {
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at 70% 68%, var(--glow), transparent 62%);
    }

    .star {
        position: absolute;
        right: -22px;
        bottom: 0;
        height: 78%;
        filter: drop-shadow(0 4px 10px rgb(0 0 0 / 0.45));
    }

    .top {
        position: relative;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.14em;
        opacity: 0.9;
    }

    .monthly :global(.mini-mast) {
        position: relative;
        margin-top: 4px;
    }

    .line {
        position: relative;
        display: -webkit-box;
        width: 118px;
        margin-top: 10px;
        overflow: hidden;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 15px;
        line-height: 1.05;
        text-transform: uppercase;
        text-shadow: 0 1px 3px rgb(0 0 0 / 0.5);
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
    }

    .month {
        position: relative;
        margin-top: auto;
        font-family: "Retail Demo", sans-serif;
        font-weight: 800;
        line-height: 1;
        color: var(--accent);
        text-shadow: 0 2px 6px rgb(0 0 0 / 0.45);
        white-space: nowrap;
    }

    .year {
        position: relative;
        margin-top: 2px;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 15px;
        letter-spacing: 0.12em;
        white-space: nowrap;
        text-shadow: 0 1px 3px rgb(0 0 0 / 0.5);
    }

    .sheen {
        position: absolute;
        inset: 0;
        background: linear-gradient(
            115deg,
            transparent 30%,
            rgb(255 255 255 / 0.2) 42%,
            transparent 50%,
            transparent 70%,
            rgb(255 255 255 / 0.08) 78%,
            transparent 86%
        );
    }

    .monthly.proof {
        background: #f6f3ec;
        color: var(--ink);
        box-shadow: none;
        outline: 2px dashed color-mix(in oklch, var(--ink) 45%, transparent);
        outline-offset: -6px;
    }

    .proof .month {
        margin-top: 0;
        text-shadow: none;
    }

    .proof .year {
        text-shadow: none;
    }

    .crop {
        position: absolute;
        width: 14px;
        height: 14px;
        border-color: var(--ink);
        border-style: solid;
        border-width: 0;
    }

    .crop.tl {
        top: 3px;
        left: 3px;
        border-top-width: 2px;
        border-left-width: 2px;
    }

    .crop.tr {
        top: 3px;
        right: 3px;
        border-top-width: 2px;
        border-right-width: 2px;
    }

    .crop.bl {
        bottom: 3px;
        left: 3px;
        border-bottom-width: 2px;
        border-left-width: 2px;
    }

    .crop.br {
        right: 3px;
        bottom: 3px;
        border-right-width: 2px;
        border-bottom-width: 2px;
    }

    .hole {
        display: grid;
        flex: 1;
        place-items: center;
        margin: 10px 0 8px;
        border: 2px dashed color-mix(in oklch, var(--ink) 35%, transparent);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 0.14em;
        opacity: 0.7;
    }

    .proof :global(.mini-print) {
        align-self: flex-start;
        margin-top: 8px;
        margin-bottom: 4px;
    }
</style>
