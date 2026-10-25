<script module lang="ts">
    /** The seal's scalloped rim: 36 points alternating between two radii on a 100 x 100 box. */
    /** The seal overhangs the name band by this much in all: up into the sheet's margin and down to the dateline. */
    const SEAL_OVER_BAND = 22;

    const RIM = Array.from({ length: 72 }, (_, i) => {
        const r = i % 2 === 0 ? 50 : 46.5;
        const a = (i / 72) * 2 * Math.PI;
        return `${(50 + r * Math.sin(a)).toFixed(2)},${(50 - r * Math.cos(a)).toFixed(2)}`;
    }).join(" ");
</script>

<script lang="ts">
    import { fitFontSize } from "$lib/features/front-page/paper/fit";
    import Masthead from "$lib/features/front-page/paper/masthead.svelte";
    import type { EditionView } from "../edition-view";

    let { view }: { view: EditionView } = $props();

    const id = $props.id();
    const foil = `${id}-foil`;
    const sheen = `${id}-sheen`;

    /**
     * Sizes the seal from the name band, which the masthead fit shrinks on narrow cards, so the seal never reaches
     * the dateline's text; then shrinks its words until each fits the inner ring. Measured on offset sizes, which
     * the seal's tilt does not change.
     */
    function fitSeal(head: HTMLElement) {
        const band = head.querySelector<HTMLElement>(".masthead h1");
        const words = head.querySelector<HTMLElement>(".words");
        if (!band || !words) return;
        const fit = () => {
            head.style.setProperty("--seal", `${band.offsetHeight + SEAL_OVER_BAND}px`);
            const fits = (pct: number) => {
                words.style.setProperty("--seal-fit", String(pct / 100));
                const lines = [...words.children] as HTMLElement[];
                return words.scrollHeight <= words.clientHeight && lines.every((l) => l.scrollWidth <= l.clientWidth);
            };
            words.style.setProperty("--seal-fit", String(fitFontSize({ max: 100, min: 50, fits }) / 100));
        };
        const observer = new ResizeObserver(fit);
        observer.observe(band);
        void document.fonts?.ready.then(fit);
        return () => observer.disconnect();
    }
</script>

<div class="head kind-{view.kind}" class:sealed={!!view.seal} {@attach fitSeal}>
    <Masthead
        name={view.masthead.name}
        date={view.masthead.date}
        edition={view.masthead.edition}
        detail={view.masthead.issue}
    />
    {#if view.seal}
        <div class="seal" aria-hidden="true">
            <svg viewBox="0 0 100 100">
                <defs>
                    <linearGradient id={foil} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stop-color="#6f4e12" />
                        <stop offset="0.22" stop-color="#c8983b" />
                        <stop offset="0.4" stop-color="#f6e3a1" />
                        <stop offset="0.55" stop-color="#b9893a" />
                        <stop offset="0.74" stop-color="#ebcd7c" />
                        <stop offset="1" stop-color="#7d5a17" />
                    </linearGradient>
                    <linearGradient id={sheen} x1="1" y1="0" x2="0" y2="1">
                        <stop offset="0" stop-color="#8a6620" />
                        <stop offset="0.45" stop-color="#e9cf86" />
                        <stop offset="0.6" stop-color="#fbefc2" />
                        <stop offset="1" stop-color="#9b7426" />
                    </linearGradient>
                </defs>
                <polygon points={RIM} fill="url(#{foil})" stroke="#5c410d" stroke-width="0.6" />
                <circle cx="50" cy="50" r="40" fill="url(#{sheen})" stroke="#5c410d" stroke-width="0.8" />
                <circle
                    cx="50"
                    cy="50"
                    r="36.5"
                    fill="none"
                    stroke="#5c410d"
                    stroke-width="0.5"
                    stroke-dasharray="1.2 1.6"
                />
            </svg>
            <span class="words">
                {#if view.seal.season}<span class="season">{view.seal.season}</span>{/if}
                <span class="title">{view.seal.title}</span>
            </span>
        </div>
    {/if}
</div>

<style>
    .head {
        --seal: 84px;
        position: relative;
        flex: none;
    }

    .head :global(.dateline) {
        border-color: var(--dp-rule, var(--fp-ink));
    }

    .kind-collectors :global(h1) {
        background: linear-gradient(
            100deg,
            #6e4f14 0%,
            #c99a3e 16%,
            #f3dd94 32%,
            #b88a33 48%,
            #e6c56f 64%,
            #f7e7ae 78%,
            #9a7425 100%
        );
        color: #2b1f07;
        text-shadow: 0 1px 0 rgb(255 246 214 / 0.55);
    }

    /* Room for the largest seal at the band's end; the name shrinks to fit what is left. */
    .sealed :global(h1) {
        padding-right: 86px;
    }

    .kind-year_end :global(.top) {
        background: var(--fp-ink);
        box-shadow:
            inset 0 0 0 3px var(--fp-ink),
            inset 0 0 0 4px #c9a24a;
    }

    .kind-year_end :global(h1) {
        background: linear-gradient(180deg, #f8e7a6 0%, #e2bd62 45%, #b0832c 55%, #edd28a 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
    }

    .seal {
        position: absolute;
        top: -14px;
        right: 4px;
        width: var(--seal);
        height: var(--seal);
        transform: rotate(-12deg);
        filter: drop-shadow(0 1px 1.5px rgb(60 40 5 / 0.45));
    }

    .seal svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }

    .words {
        position: absolute;
        inset: 19%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1px;
        color: #3a2905;
        text-align: center;
        text-shadow: 0 1px 0 rgb(255 242 196 / 0.7);
        text-transform: uppercase;
    }

    .season,
    .title {
        max-width: 100%;
    }

    .season {
        font-family: "Retail Demo", sans-serif;
        font-weight: 600;
        font-size: calc(8px * var(--seal-fit, 1));
        line-height: 1.05;
        letter-spacing: 0.06em;
    }

    .title {
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: calc(10.5px * var(--seal-fit, 1));
        line-height: 1;
    }
</style>
