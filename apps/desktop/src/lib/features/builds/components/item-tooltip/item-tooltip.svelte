<script lang="ts">
    import { Timer } from "@lucide/svelte";
    import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import type { PopularityText } from "../../editor/popularity.svelte";
    import { statText, type ItemTooltipModel, type TooltipCooldown, type TooltipItemRef } from "./item-tooltip";

    let {
        model,
        popularity = null,
        heroIcon = null,
        count = 0,
    }: {
        model: ItemTooltipModel;
        popularity?: PopularityText | null;
        /** The hero portrait the game puts beside its "Purchased ... in N% of matches" line. */
        heroIcon?: string | null;
        /** Copies already in the build; 0 hides the line. */
        count?: number;
    } = $props();

    const sections = $derived(
        (
            [
                ["passive", model.passive],
                ["active", model.active],
            ] as const
        )
            .map(([kind, stats]) => ({
                kind,
                stats,
                cooldown: model.cooldown?.section === kind ? model.cooldown : null,
            }))
            .filter((s) => s.stats.length > 0 || s.cooldown !== null),
    );
    const popular = $derived(popularity?.popular ?? []);
    const phases = $derived(popularity?.stats ?? []);
</script>

{#snippet value(stat: ItemStat, signed: boolean)}
    {@const text = statText(stat.value, null, signed, formatNumber)}
    <span class="value"
        >{text}{#if stat.unit}<span class="unit">{stat.unit}</span>{/if}</span
    >
{/snippet}

{#snippet cooldownTag(cd: TooltipCooldown)}
    <span class="cooldown" aria-label={t("builds.tooltip.cooldown")}>
        <Timer aria-hidden="true" />{formatNumber(cd.value)}{cd.unit ?? ""}
    </span>
{/snippet}

{#snippet relation(label: string, items: TooltipItemRef[])}
    <div class="relation">
        <div class="relation-label">{label}</div>
        <ul>
            {#each items as item (item.id)}
                <li data-slot={item.slot}>
                    <span class="mini" aria-hidden="true">
                        {#if item.art}<img src={item.art} alt="" draggable="false" />{/if}
                    </span>
                    <span>{item.name}</span>
                </li>
            {/each}
        </ul>
    </div>
{/snippet}

<div class="tip" data-slot={model.slot} data-item-tooltip={model.id}>
    <header>
        <div class="name">{model.name}</div>
        <div class="cost">
            <svg class="souls" viewBox="0 0 12 16" aria-hidden="true">
                <path
                    d="M9.6 3.6C8.9 2.6 7.6 2 6.2 2 4.2 2 2.7 3.2 2.7 4.8c0 3.5 6.7 2.2 6.7 6 0 1.8-1.6 3.2-3.8 3.2-1.6 0-3-.7-3.8-1.9"
                />
                <path d="M6 .5v15" />
            </svg>
            <span>{formatNumber(model.cost)}</span>
        </div>
    </header>
    <div class="body">
        {#if model.innate.length > 0}
            <ul class="stats">
                {#each model.innate as stat (stat.key)}
                    <li>{@render value(stat, true)} <span class="label">{stat.label}</span></li>
                {/each}
            </ul>
        {/if}
        {#each sections as section (section.kind)}
            <section class="ability">
                <div class="bar">
                    <span>{t(`builds.tooltip.${section.kind}`)}</span>
                    {#if section.cooldown}{@render cooldownTag(section.cooldown)}{/if}
                </div>
                {#if section.stats.length > 0}
                    <ul class="stats">
                        {#each section.stats as stat (stat.key)}
                            <li>{@render value(stat, false)} <span class="label">{stat.label}</span></li>
                        {/each}
                    </ul>
                {/if}
            </section>
        {/each}
        {#if popular.length > 0}
            <div class="popular">
                {#if heroIcon}<img class="hero" src={heroIcon} alt="" draggable="false" />{/if}
                <div>
                    {#each popular as line (line)}<p>{line}</p>{/each}
                </div>
            </div>
        {/if}
        {#if phases.length > 0}
            <dl class="phases">
                {#each phases as line (line.label)}
                    <dt>{line.label}</dt>
                    <dd>{line.value}</dd>
                {/each}
            </dl>
        {/if}
        {#if count > 0}
            <p class="count">{t("builds.editor.picker.in_build", { count })}</p>
        {/if}
        {#if model.upgradesTo.length > 0}
            {@render relation(t("builds.tooltip.upgrades_to"), model.upgradesTo)}
        {/if}
        {#if model.builtFrom.length > 0}
            {@render relation(t("builds.tooltip.built_from"), model.builtFrom)}
        {/if}
    </div>
</div>

<style>
    /* Header and body tones are sampled from the game's weapon tooltip at 1440p; spirit and vitality follow the
       same lightness in their slot hue. */
    .tip {
        --head-a: #562601;
        --head-b: #7a4508;
        --body: #785017;
        --bar: #2a210f;
        --off-white: #ffefd7;
        position: relative;
        width: 340px;
        color: var(--off-white);
        font-size: 13px;
        line-height: 1.3;
        filter: drop-shadow(0 6px 14px #000a);
    }
    .tip[data-slot="spirit"] {
        --head-a: #2e1648;
        --head-b: #4a2a6c;
        --body: #59407a;
        --bar: #1f1530;
    }
    .tip[data-slot="vitality"] {
        --head-a: #1f3307;
        --head-b: #35511a;
        --body: #4c6425;
        --bar: #18220c;
    }

    header,
    .body {
        position: relative;
    }
    header {
        padding: 14px 18px 12px;
        /* Torn top edge, then the game's diagonal brush streaks. */
        clip-path: polygon(
            0 4px,
            8% 1px,
            17% 5px,
            29% 0,
            41% 4px,
            55% 1px,
            68% 5px,
            80% 0,
            91% 3px,
            100% 0,
            100% 100%,
            0 100%
        );
        background:
            repeating-linear-gradient(
                -32deg,
                transparent 0 22px,
                color-mix(in oklch, var(--head-b) 70%, #000) 22px 30px,
                transparent 30px 58px
            ),
            linear-gradient(100deg, var(--head-a), var(--head-b));
    }
    .name {
        font-family: var(--font-heading);
        font-size: 24px;
        font-weight: 700;
        line-height: 1.05;
        text-shadow: 0 2px 0 #0006;
    }
    .cost {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;
        color: #9affd6;
        font-family: var(--font-heading);
        font-size: 17px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
    }
    .souls {
        width: 11px;
        height: 15px;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-width: 2.2;
    }

    .body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 14px 14px;
        clip-path: polygon(
            0 0,
            100% 0,
            100% calc(100% - 3px),
            88% 100%,
            74% calc(100% - 4px),
            60% calc(100% - 1px),
            47% calc(100% - 5px),
            33% 100%,
            19% calc(100% - 3px),
            7% calc(100% - 1px),
            0 calc(100% - 4px)
        );
        background: var(--body);
    }

    .stats {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 0 4px;
    }
    .stats li {
        display: flex;
        align-items: baseline;
        gap: 6px;
    }
    .value {
        font-family: var(--font-heading);
        font-size: 15px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
    }
    .unit {
        margin-left: 1px;
        color: color-mix(in oklch, var(--off-white) 62%, transparent);
        font-size: 12px;
    }
    .label {
        font-weight: 600;
    }

    .ability {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .bar,
    .relation-label {
        padding: 3px 8px;
        background: var(--bar);
        color: color-mix(in oklch, var(--off-white) 85%, transparent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    .bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .cooldown {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        color: var(--off-white);
        font-variant-numeric: tabular-nums;
        text-transform: none;
    }
    .cooldown :global(svg) {
        width: 12px;
        height: 12px;
    }

    .popular {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 4px;
        color: #60e69f;
        font-style: italic;
        font-weight: 600;
    }
    .hero {
        width: 28px;
        height: 28px;
        flex: none;
        border-radius: 50%;
        object-fit: cover;
    }
    .phases {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 1px 10px;
        padding: 0 4px;
        font-size: 12px;
    }
    .phases dt {
        color: color-mix(in oklch, var(--off-white) 70%, transparent);
    }
    .phases dd {
        font-variant-numeric: tabular-nums;
        text-align: right;
    }
    .count {
        padding: 0 4px;
        color: color-mix(in oklch, var(--off-white) 75%, transparent);
        font-size: 12px;
    }

    .relation {
        background: color-mix(in oklch, var(--bar) 45%, transparent);
    }
    .relation ul {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 12px;
        padding: 5px 8px 6px;
    }
    .relation li {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
    }
    .mini {
        width: 22px;
        height: 22px;
        flex: none;
        overflow: hidden;
        border-radius: 2px;
        background: #0004;
    }
    .mini > img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
</style>
