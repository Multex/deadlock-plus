<script lang="ts">
    import { fitFontSize } from "$lib/features/front-page/paper/fit";
    import type { NumberLine } from "../edition-view";

    let {
        lines,
        title,
        scale = 1,
        columns = lines.length,
        head = true,
        ledger = false,
    }: {
        lines: NumberLine[];
        title: string;
        scale?: number;
        columns?: number;
        /** `false` when the card around the box already carries the title. */
        head?: boolean;
        /** One row a number, label left and value right, for a card's full-width tally. */
        ledger?: boolean;
    } = $props();

    /** A value is never cut: when the row is too narrow every value shrinks together, keeping the strip even. */
    function fitValues(dl: HTMLElement) {
        void lines;
        void columns;
        const fits = (pct: number) => {
            dl.style.setProperty("--v-fit", String(pct / 100));
            if (dl.scrollWidth > dl.clientWidth + 1) return false;
            const cut = (el: Element) => el.scrollWidth > el.clientWidth + 1;
            return ![...dl.querySelectorAll(".cell, dd")].some(cut);
        };
        const run = () => {
            const pct = fitFontSize({ max: 100, min: 40, fits });
            dl.style.setProperty("--v-fit", String(pct / 100));
        };
        let size = "";
        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            const next = `${entry.contentRect.width}x${entry.contentRect.height}`;
            if (next === size) return;
            size = next;
            run();
        });
        observer.observe(dl);
        void document.fonts?.ready.then(run);
        return () => observer.disconnect();
    }
</script>

<section
    class="numbers"
    class:headless={!head}
    class:ledger
    style="--s: calc({scale} * var(--fit-scale, 1)); --cols: {columns};"
    aria-label={title}
>
    {#if head}
        <h4>{title}</h4>
    {/if}
    <dl data-fit-values {@attach fitValues}>
        {#each lines as line (line.id)}
            <div class="cell">
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
            </div>
        {/each}
    </dl>
</section>

<style>
    .numbers {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: stretch;
        border-top: calc(3px * var(--s)) solid var(--dp-rule, var(--fp-ink));
        border-bottom: 1px solid var(--dp-rule, var(--fp-ink));
    }

    .numbers.headless {
        grid-template-columns: minmax(0, 1fr);
    }

    /* The title reads up the left edge, like a tabloid's boxed tally. */
    h4 {
        margin: 0;
        padding: calc(6px * var(--s)) calc(4px * var(--s));
        background: var(--fp-ink);
        color: var(--fp-paper);
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: calc(12px * var(--s));
        line-height: 1;
        letter-spacing: 0.06em;
        text-align: center;
        text-transform: uppercase;
        writing-mode: vertical-rl;
        transform: rotate(180deg);
    }

    /* Columns take their values' width, so a long K/D/A gets the room a two-digit match count does not need. */
    dl {
        display: grid;
        grid-template-columns: repeat(var(--cols), auto);
        margin: 0;
    }

    /* The value reads first on paper; the label stays first in the markup. */
    .cell {
        display: flex;
        flex-direction: column-reverse;
        justify-content: center;
        min-width: 0;
        padding: calc(5px * var(--s)) calc(10px * var(--s));
        border-left: 1px dotted color-mix(in oklch, var(--fp-ink) 45%, transparent);
        border-bottom: 1px dotted color-mix(in oklch, var(--fp-ink) 45%, transparent);
    }

    dd {
        margin: 0;
        color: var(--fp-ink);
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: calc(25px * var(--s) * var(--v-fit, 1));
        line-height: 1;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }

    dt {
        margin-top: calc(2px * var(--s));
        color: var(--fp-ink-soft);
        font-family: "Retail Demo", sans-serif;
        font-weight: 600;
        font-size: calc(10.5px * var(--s));
        line-height: 1.15;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        overflow-wrap: break-word;
    }

    .ledger dl {
        grid-template-columns: minmax(0, 1fr);
    }

    /* A value too wide to share its row with the label drops under it, still flush right. */
    .ledger .cell {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: calc(12px * var(--s));
        padding-block: calc(5px * var(--s) + var(--row-gap, 0px) / 2);
        border-left: 0;
    }

    .ledger dt {
        flex: 0 1 auto;
        min-width: 0;
        font-size: calc(9px * var(--s));
    }

    .ledger dd {
        flex: none;
        margin-left: auto;
    }

    .cell:first-child dd {
        color: var(--fp-spot);
    }
</style>
