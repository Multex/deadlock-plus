<script lang="ts">
    import type { NumberLine } from "../edition-view";

    let {
        lines,
        title,
        scale = 1,
        columns = lines.length,
    }: { lines: NumberLine[]; title: string; scale?: number; columns?: number } = $props();
</script>

<section class="numbers" style="--s: {scale}; --cols: {columns};" aria-label={title}>
    <h4>{title}</h4>
    <dl>
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
        border-top: calc(3px * var(--s)) solid var(--fp-ink);
        border-bottom: 1px solid var(--fp-ink);
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

    dl {
        display: grid;
        grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
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
        overflow: hidden;
        color: var(--fp-ink);
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: calc(25px * var(--s));
        line-height: 1;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    dt {
        margin-top: calc(2px * var(--s));
        overflow: hidden;
        color: var(--fp-ink-soft);
        font-family: "Retail Demo", sans-serif;
        font-weight: 600;
        font-size: calc(10.5px * var(--s));
        letter-spacing: 0.08em;
        text-transform: uppercase;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .cell:first-child dd {
        color: var(--fp-spot);
    }
</style>
