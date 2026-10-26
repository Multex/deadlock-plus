<script lang="ts">
    import type { CoverArt } from "./art";
    import Cover from "./cover.svelte";
    import { PAGE } from "./layout";
    import type { Magazine } from "./magazine";
    import PageBest from "./page-best.svelte";
    import PageHeroes from "./page-heroes.svelte";
    import PageNumbers from "./page-numbers.svelte";
    import PagePeople from "./page-people.svelte";
    import { leftStack } from "./reader";

    let {
        mag,
        art,
        a1,
        a2,
        glare,
        sticker,
        curl = null,
    }: {
        mag: Magazine;
        art: CoverArt;
        /** Leaf angles in degrees, 0 (closed on the right) to -180 (turned over to the left). */
        a1: number;
        a2: number;
        glare: number;
        sticker: number;
        /** The page corner that lifts under the pointer: the one a click would turn. */
        curl?: "next" | "prev" | null;
    } = $props();

    const shade = (a: number) => Math.sin((Math.min(180, Math.max(0, -a)) * Math.PI) / 180);
    const z = (a: number, i: number) => (a < -90 ? 20 + i : 10 - i);
    // A face turned away is hidden outright as well as by backface-visibility, so its text leaves the
    // accessibility tree and stops catching the pointer.
    const shows = (a: number, front: boolean) => (front ? a > -90 : a <= -90);
    // Pages under the one in view stay drawn (the riffle shows them) but out of reach.
    const spread = $derived(a1 > -90 ? 0 : a2 > -90 ? 1 : 2);

    let px = $state<string | null>(null);
    let py = $state<string | null>(null);
    function track(e: PointerEvent) {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        px = `${((e.clientX - r.left) / r.width) * 100}%`;
        py = `${((e.clientY - r.top) / r.height) * 100}%`;
    }
</script>

<div class="book" style="width: {PAGE.width * 2}px; height: {PAGE.height}px;">
    <div class="edge-l" style="opacity: {leftStack(a1)};" aria-hidden="true"></div>
    <div class="edge-r" aria-hidden="true"></div>

    <div class="curl next" class:on={curl === "next"} data-curl="next" aria-hidden="true"></div>
    <div class="curl prev" class:on={curl === "prev"} data-curl="prev" aria-hidden="true"></div>

    <div class="slot" inert={spread !== 2}>
        <PagePeople {mag} />
    </div>

    <div class="leaf" style="z-index: {z(a2, 1)}; transform: perspective(4800px) rotateY({a2}deg);">
        <div class="face front" class:away={!shows(a2, true)} inert={spread !== 1}>
            <PageHeroes {mag} {art} />
            <div class="dim" style="opacity: {shade(a2) * 0.35};"></div>
        </div>
        <div class="face back" class:away={!shows(a2, false)} inert={spread !== 2}>
            <PageBest {mag} />
            <div class="dim" style="opacity: {shade(a2) * 0.2};"></div>
        </div>
    </div>

    <div class="leaf" style="z-index: {z(a1, 0)}; transform: perspective(4800px) rotateY({a1}deg);">
        <div
            class="face front cover-face"
            class:away={!shows(a1, true)}
            inert={spread !== 0}
            role="presentation"
            onpointermove={track}
            onpointerleave={() => (px = py = null)}
            style={px ? `--px: ${px}; --py: ${py};` : ""}
        >
            <Cover {mag} {art} {glare} {sticker} />
            <div class="spine" aria-hidden="true"></div>
            <div class="dim" style="opacity: {shade(a1) * 0.4};"></div>
        </div>
        <div class="face back" class:away={!shows(a1, false)} inert={spread !== 1}>
            <PageNumbers {mag} />
            <div class="dim" style="opacity: {shade(a1) * 0.2};"></div>
        </div>
    </div>
</div>

<style>
    .book {
        position: relative;
    }

    .slot,
    .leaf {
        position: absolute;
        top: 0;
        left: 50%;
        width: 50%;
        height: 100%;
    }

    .leaf {
        transform-origin: left center;
        transform-style: preserve-3d;
    }

    .face {
        position: absolute;
        inset: 0;
        overflow: hidden;
        backface-visibility: hidden;
    }

    .face.away {
        visibility: hidden;
    }

    .back {
        transform: rotateY(180deg);
    }

    .cover-face {
        border-radius: 0 3px 3px 0;
    }

    .dim {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(to right, #000, rgb(0 0 0 / 0.35));
    }

    /* Perfect binding: the crease a glued spine leaves along the cover's left edge. */
    .spine {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        z-index: 7;
        width: 18px;
        pointer-events: none;
        background: linear-gradient(
            to right,
            rgb(0 0 0 / 0.45),
            rgb(255 255 255 / 0.22) 3px,
            rgb(0 0 0 / 0.18) 7px,
            rgb(255 255 255 / 0.08) 10px,
            transparent 18px
        );
    }

    /* Page block: the stacked edges that make it a magazine with pages rather than one sheet. */
    .edge-r,
    .edge-l {
        position: absolute;
        top: 3px;
        bottom: -4px;
        width: 7px;
        background: repeating-linear-gradient(to right, #e9e4d9 0 1px, #c9c2b4 1px 2px);
        box-shadow: 0 2px 3px rgb(0 0 0 / 0.25);
    }

    .edge-r {
        right: -6px;
        border-radius: 0 2px 2px 0;
    }

    .edge-l {
        left: -6px;
        border-radius: 2px 0 0 2px;
    }
    /* A dog-ear: the corner peels up showing the paper's back, with the page beneath in its shadow. */
    .curl {
        position: absolute;
        bottom: 0;
        z-index: 40;
        width: 0;
        height: 0;
        pointer-events: none;
        filter: drop-shadow(0 0 6px rgb(0 0 0 / 0.35));
        transition:
            width 160ms ease-out,
            height 160ms ease-out;
    }

    .curl.on {
        width: 96px;
        height: 96px;
    }

    .curl.next {
        right: 0;
        border-top-left-radius: 6px;
        background: linear-gradient(
            to top left,
            rgb(20 16 12 / 0.55) 0,
            rgb(20 16 12 / 0.2) calc(50% - 1px),
            #fbf8f1 50%,
            #e4ddcf 72%,
            #c8bfae 100%
        );
    }

    .curl.prev {
        left: 0;
        border-top-right-radius: 6px;
        background: linear-gradient(
            to top right,
            rgb(20 16 12 / 0.55) 0,
            rgb(20 16 12 / 0.2) calc(50% - 1px),
            #fbf8f1 50%,
            #e4ddcf 72%,
            #c8bfae 100%
        );
    }

    @media (prefers-reduced-motion: reduce) {
        .curl {
            transition: none;
        }
    }
</style>
