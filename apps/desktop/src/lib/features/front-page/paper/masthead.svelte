<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import type { Weather } from "./types";

    let {
        name,
        date,
        edition,
        detail,
        weather,
        weatherTitle = t("front_page.kit.weather"),
    }: {
        name: string;
        date: string;
        edition: string;
        detail: string;
        weather?: Weather;
        weatherTitle?: string;
    } = $props();
</script>

<header class="masthead">
    <div class="top" class:eared={!!weather}>
        <h1>{name}</h1>
        {#if weather}
            <aside class="ear">
                <b>{weatherTitle}</b>
                <span>{weather.forecast}</span>
                {#each weather.lines as line, i (i)}
                    <span>{line}</span>
                {/each}
            </aside>
        {/if}
    </div>
    <p class="dateline">
        <span>{date}</span>
        <span>{edition}</span>
        <span>{detail}</span>
    </p>
</header>

<style>
    .top {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
        align-items: stretch;
    }

    .top.eared {
        grid-template-columns: 1fr 150px;
    }

    h1 {
        margin: 0;
        min-width: 0;
        padding: 8px 12px 6px;
        overflow: hidden;
        background: var(--fp-spot);
        color: var(--fp-paper);
        font-family: "Valve Pulp", sans-serif;
        font-weight: 700;
        font-size: 45px;
        line-height: 1;
        letter-spacing: -0.01em;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .ear {
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-width: 0;
        padding: 4px 8px;
        border: 2px solid var(--fp-ink);
        font-size: 11px;
        line-height: 1.2;
    }

    .ear b {
        font-family: "Valve Oracle", serif;
        font-weight: 600;
        font-size: 14px;
    }

    .dateline {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin: 8px 0 0;
        padding: 3px 0;
        border-top: 2px solid var(--fp-ink);
        border-bottom: 2px solid var(--fp-ink);
        font-family: "Retail Demo", sans-serif;
        font-weight: 600;
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        white-space: nowrap;
    }

    .dateline span {
        overflow: hidden;
        text-overflow: ellipsis;
    }
</style>
