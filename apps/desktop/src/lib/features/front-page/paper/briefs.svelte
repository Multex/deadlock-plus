<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import SectionHead from "./section-head.svelte";
    import type { Brief } from "./types";

    let { items, title = t("front_page.kit.in_brief") }: { items: Brief[]; title?: string } = $props();
</script>

<section class="briefs">
    <SectionHead text={title} />
    <ul>
        {#each items as item (item.id)}
            <li><b>{item.headline}</b>{item.body}</li>
        {/each}
    </ul>
</section>

<style>
    ul {
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 12px;
        line-height: 1.2;
    }

    li + li {
        margin-top: 6px;
    }

    b {
        display: block;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
    }
</style>
