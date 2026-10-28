<script lang="ts">
    import { fitLines } from "../../components/fill";
    import type { YearEndCover } from "./year-end-view";

    let { cover, backdrop, portrait }: { cover: YearEndCover; backdrop: string | null; portrait: string | null } =
        $props();

    let root = $state<HTMLElement | null>(null);

    /** A made-up barcode drawn from the issue line: decoration, not a real code. */
    const bars = $derived.by(() => {
        let h = 2166136261;
        for (const c of `${cover.issue}${cover.player ?? ""}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
        return Array.from({ length: 34 }, (_, i) => 1 + (((h >>> (i % 29)) ^ i) & 3));
    });

    $effect(() => {
        void cover;
        const el = root;
        if (!el) return;
        let live = true;
        fitLines(el);
        void document.fonts?.ready.then(() => live && fitLines(el));
        return () => (live = false);
    });
</script>

<div class="cover" bind:this={root}>
    {#if backdrop}
        <img class="collage" src={backdrop} alt="" />
    {/if}
    <div class="shade"></div>
    {#if portrait}
        <img class="card" src={portrait} alt="" />
    {/if}
    <div class="frame"></div>
    <header class="mast">
        <p class="name" data-fit-line>{cover.name}</p>
        <div class="row" data-fit-line><span>{cover.issue}</span><span>{cover.edition}</span></div>
    </header>
    <p class="year">{cover.year}</p>
    <ul class="lines">
        {#each cover.lines as line (line.id)}
            <li><strong>{line.value}</strong><span data-fit-line>{line.label}</span></li>
        {/each}
    </ul>
    <footer class="poy">
        <p class="title" data-fit-line>{cover.title}</p>
        {#if cover.player}
            <p class="player" data-fit-line>{cover.player}</p>
        {/if}
        {#if cover.star}
            <p class="with" data-fit-line>{cover.star.line}</p>
        {/if}
    </footer>
    <div class="code" aria-hidden="true">
        <div class="bars">
            {#each bars as w, i (i)}
                <span style="width: {w}px; margin-right: {((i * 7) % 3) + 1}px"></span>
            {/each}
        </div>
        <span class="span">{cover.span}</span>
    </div>
    <div class="peel" aria-hidden="true">
        <div class="under"></div>
        <div class="flap"><span>{cover.flap}</span></div>
    </div>
</div>

<style>
    .cover {
        --gold: oklch(0.8 0.11 85);
        --gold-deep: oklch(0.58 0.1 75);
        --cream: oklch(0.95 0.02 88);
        --black: oklch(0.15 0.01 80);
        position: relative;
        width: 600px;
        height: 900px;
        overflow: hidden;
        color: var(--cream);
        background: var(--black);
        font-family: "Retail Demo", sans-serif;
    }

    p,
    ul {
        margin: 0;
        padding: 0;
    }

    /* The collage sits on the right of a wide transparent field; the crop keeps that part on the cover. */
    .collage {
        position: absolute;
        inset: 90px 0 0;
        width: 100%;
        height: calc(100% - 90px);
        object-fit: cover;
        object-position: 80% 30%;
        filter: grayscale(1) sepia(1) saturate(1.7) hue-rotate(-6deg) brightness(0.8) contrast(1.15);
    }

    .shade {
        position: absolute;
        inset: 0;
        background:
            linear-gradient(180deg, var(--black) 0 13%, oklch(0.15 0.01 80 / 0.5) 28%, transparent 44%),
            linear-gradient(0deg, var(--black) 0 13%, oklch(0.15 0.01 80 / 0.86) 27%, transparent 50%),
            linear-gradient(90deg, oklch(0.15 0.01 80 / 0.7), transparent 45%);
    }

    /* The 280x380 card cutout at about 1.15x: any bigger and it goes soft. */
    .card {
        position: absolute;
        top: 214px;
        left: 238px;
        width: 322px;
        height: 437px;
        object-fit: contain;
        filter: drop-shadow(0 10px 22px oklch(0 0 0 / 0.65));
        /* The card is a bust cut off at its own edges: fade those cuts into the collage. */
        mask-image:
            linear-gradient(180deg, #000 70%, transparent 97%),
            linear-gradient(90deg, transparent 0, #000 14%, #000 86%, transparent 100%);
        mask-composite: intersect;
    }

    .frame {
        position: absolute;
        inset: 16px;
        border: 3px solid var(--gold);
        box-shadow:
            inset 0 0 0 5px var(--black),
            inset 0 0 0 6px var(--gold-deep);
    }

    .mast {
        position: absolute;
        top: 34px;
        left: 40px;
        right: 40px;
        text-align: center;
    }

    .mast .name {
        overflow: hidden;
        white-space: nowrap;
        font-size: calc(30px * var(--line-fit, 1));
        font-weight: 700;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: var(--gold);
    }

    .row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-top: 8px;
        padding-top: 7px;
        overflow: hidden;
        white-space: nowrap;
        border-top: 1.5px solid var(--gold-deep);
        font-size: calc(14px * var(--line-fit, 1));
        font-weight: 600;
        letter-spacing: 0.22em;
        text-transform: uppercase;
    }

    .year {
        position: absolute;
        top: 116px;
        left: 0;
        right: 0;
        font-family: "Valve Pulp", sans-serif;
        font-size: 178px;
        line-height: 1;
        text-align: center;
        letter-spacing: 0.01em;
        color: transparent;
        background: linear-gradient(
            172deg,
            oklch(0.97 0.05 95) 0%,
            var(--gold) 34%,
            oklch(0.62 0.11 74) 52%,
            oklch(0.88 0.09 90) 68%,
            var(--gold-deep) 100%
        );
        background-clip: text;
        filter: drop-shadow(0 6px 14px oklch(0 0 0 / 0.6));
    }

    .lines {
        position: absolute;
        top: 330px;
        left: 40px;
        list-style: none;
    }

    .lines li {
        width: 170px;
        padding: 7px 0 8px;
        border-top: 2px solid var(--gold);
        text-shadow: 0 1px 6px oklch(0 0 0 / 0.9);
    }

    .lines strong {
        display: block;
        font-family: "Valve Pulp", sans-serif;
        font-size: 42px;
        font-weight: 700;
        line-height: 1;
        color: var(--gold);
    }

    .lines span {
        display: block;
        overflow: hidden;
        white-space: nowrap;
        font-size: calc(15px * var(--line-fit, 1));
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
    }

    .poy {
        position: absolute;
        bottom: 112px;
        left: 40px;
        right: 40px;
        text-align: center;
    }

    .title {
        overflow: hidden;
        white-space: nowrap;
        font-family: "Valve Oracle", serif;
        font-size: calc(50px * var(--line-fit, 1));
        font-style: italic;
        font-weight: 600;
        line-height: 1.3;
        letter-spacing: 0.02em;
    }

    .player {
        margin-top: 0;
        overflow: hidden;
        white-space: nowrap;
        font-size: calc(64px * var(--line-fit, 1));
        font-weight: 700;
        line-height: 1.25;
        text-transform: uppercase;
        color: var(--gold);
    }

    .with {
        margin-top: 4px;
        overflow: hidden;
        white-space: nowrap;
        font-size: calc(17px * var(--line-fit, 1));
        font-weight: 600;
        letter-spacing: 0.22em;
        text-transform: uppercase;
    }

    .code {
        position: absolute;
        bottom: 36px;
        left: 40px;
        display: flex;
        align-items: flex-end;
        gap: 10px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--gold);
    }

    .bars {
        display: flex;
        height: 40px;
        padding: 4px 6px;
        background: var(--cream);
    }

    .bars span {
        background: var(--black);
    }

    .span {
        white-space: nowrap;
    }

    .peel {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 132px;
        height: 132px;
    }

    .under {
        position: absolute;
        inset: 0;
        clip-path: polygon(100% 0, 100% 100%, 0 100%);
        background:
            repeating-linear-gradient(0deg, transparent 0 9px, oklch(0.2 0.01 80 / 0.16) 9px 11px), oklch(0.93 0.022 86);
    }

    .flap {
        position: absolute;
        inset: 0;
        filter: drop-shadow(-5px -5px 7px oklch(0 0 0 / 0.6));
    }

    .flap::before {
        content: "";
        position: absolute;
        inset: 0;
        clip-path: polygon(0 0, 100% 0, 0 100%);
        background: linear-gradient(315deg, oklch(0.95 0.07 92) 0%, var(--gold) 30%, oklch(0.62 0.11 74) 100%);
    }

    .flap span {
        position: absolute;
        top: 28px;
        left: -14px;
        width: 120px;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: 0.12em;
        text-align: center;
        text-transform: uppercase;
        color: var(--black);
        transform: rotate(-45deg);
    }
</style>
