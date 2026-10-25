<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import SectionHead from "./section-head.svelte";
    import type { Rating } from "./types";

    let { rows, title = t("front_page.kit.critics") }: { rows: Rating[]; title?: string } = $props();

    const sorted = $derived([...rows].sort((a, b) => a.place - b.place));
</script>

<section class="ratings">
    <SectionHead text={title} />
    <ol>
        {#each sorted as row (row.id)}
            <li class:own={row.own}>
                <span class="letter">{row.letter}</span>
                <span class="who"><b>{row.name}</b><br />{row.placeLabel}</span>
            </li>
        {/each}
    </ol>
</section>

<style>
    ol {
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 12px;
        line-height: 1.2;
    }

    li {
        display: grid;
        grid-template-columns: 40px 1fr;
        align-items: center;
        padding: 2px 0;
    }

    li.own {
        background: var(--fp-highlight);
    }

    .letter {
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: 24px;
        line-height: 1;
    }

    .who {
        min-width: 0;
        overflow-wrap: anywhere;
    }
</style>
