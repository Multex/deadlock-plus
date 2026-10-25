<script lang="ts">
    import Deck from "./deck.svelte";
    import { fitText } from "./fit";

    let {
        text,
        kicker,
        deck,
        size = "banner",
        max = size === "banner" ? 64 : 18,
        min = size === "banner" ? 34 : 14,
        lines = 2,
    }: {
        text: string;
        kicker?: string;
        deck?: string;
        size?: "banner" | "story";
        /** Font size in px before fitting. */
        max?: number;
        /** Font size in px the fit stops at; the line clamp cuts what still overflows. */
        min?: number;
        lines?: number;
    } = $props();

    function fit(el: HTMLElement) {
        const options = { max, min, lines };
        void text;
        let width = -1;
        const run = () => fitText(el, options);
        const observer = new ResizeObserver(([entry]) => {
            if (!entry || entry.contentRect.width === width) return;
            width = entry.contentRect.width;
            run();
        });
        observer.observe(el);
        void document.fonts?.ready.then(run);
        return () => observer.disconnect();
    }
</script>

<header class="headline {size}">
    {#if kicker}
        <p class="kicker">{kicker}</p>
    {/if}
    <svelte:element
        this={size === "banner" ? "h2" : "h3"}
        class="text"
        style="font-size: {max}px; -webkit-line-clamp: {lines};"
        {@attach fit}>{text}</svelte:element
    >
    {#if deck}
        <div class="below"><Deck text={deck} {size} /></div>
    {/if}
</header>

<style>
    .headline {
        min-width: 0;
    }

    .kicker {
        display: inline-block;
        margin: 0 0 6px;
        padding: 2px 8px;
        background: var(--fp-ink);
        color: var(--fp-paper);
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 15px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .text {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin: 0;
        color: var(--fp-ink);
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        text-transform: uppercase;
        overflow-wrap: normal;
    }

    .banner .text {
        line-height: 0.9;
        letter-spacing: -0.025em;
        padding-top: 0.06em;
    }

    .story .text {
        margin-bottom: 3px;
        line-height: 1.05;
    }

    .story .kicker {
        font-size: 12px;
    }

    .banner .below {
        margin-top: 8px;
    }
</style>
