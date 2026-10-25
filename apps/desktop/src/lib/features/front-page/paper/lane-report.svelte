<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import SectionHead from "./section-head.svelte";
    import type { LaneLine } from "./types";

    let { lanes, title = t("front_page.kit.lane_report") }: { lanes: LaneLine[]; title?: string } = $props();
</script>

<section class="lane-report">
    <SectionHead text={title} />
    <ul>
        {#each lanes as lane (lane.id)}
            <li style="--lane: var(--fp-lane-{lane.ink});">
                <b>{lane.name}</b>
                {lane.text}
            </li>
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

    li {
        padding-left: 7px;
        border-left: 4px solid var(--lane);
    }

    li + li {
        margin-top: 6px;
    }

    b {
        display: block;
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 13px;
        text-transform: uppercase;
    }
</style>
