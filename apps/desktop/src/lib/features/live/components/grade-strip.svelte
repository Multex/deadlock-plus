<script lang="ts">
    import type { Hero } from "$lib/features/heroes/heroes";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { i18n, t } from "$lib/core/i18n.svelte";
    import { tierName } from "$lib/features/stats/rank-view";
    import {
        LETTER_COLOR,
        stripView,
        type Message,
        type ShownGradesView,
        type TileMark,
        type TileTip,
    } from "../grade-strip";
    import GradeBar from "./grade-bar.svelte";
    import HeroIcon from "./hero-icon.svelte";

    let { view, heroes, tiers }: { view: ShownGradesView; heroes: Record<number, Hero>; tiers: RankTier[] } = $props();

    const strip = $derived(
        stripView(view, {
            locale: i18n.locale,
            hero: heroes[view.heroId]?.name ?? t("stats.hero_fallback", { id: view.heroId }),
            tierName: (tier) => tierName(tiers, tier),
        }),
    );
    const groupArt = $derived(
        strip.overall.groupTiers.flatMap((tier) => {
            const found = tiers.find((r) => r.tier === tier);
            return found?.image ? [{ tier, image: found.image }] : [];
        }),
    );

    const say = (m: Message) => t(m.key, m.params);
    const markText = (mark: TileMark) =>
        mark.kind === "letter" ? mark.letter : mark.kind === "tooEarly" ? t("live.grades.too_early") : "—";
</script>

{#snippet markView(mark: TileMark, big = false)}
    {#if mark.kind === "letter"}
        <span class="letter" class:big style:color={LETTER_COLOR[mark.letter]}>{mark.letter}</span>
    {:else if mark.kind === "tooEarly"}
        <span class="note">{t("live.grades.too_early")}</span>
    {:else}
        <span class="letter dash" class:big>—</span>
    {/if}
{/snippet}

{#snippet tierArt()}
    {#each groupArt as art (art.tier)}
        <img src={art.image} alt="" class="tier" />
    {/each}
{/snippet}

{#snippet tip(tile: { mark: TileMark; score: number | null; tip: TileTip }, value: string | null)}
    <div class="flex w-64 flex-col gap-2 py-1">
        <div class="flex items-baseline gap-2 text-[13px]">
            <span class="flex-1 text-muted-foreground">{t(tile.tip.name)}</span>
            {#if value !== null}<span class="font-semibold tabular-nums">{value}</span>{/if}
            {#if tile.mark.kind !== "tooEarly"}{@render markView(tile.mark)}{/if}
        </div>
        <GradeBar score={tile.score} />
        {#each tile.tip.lines as line, i (i)}
            <p class="text-[11px] text-muted-foreground tabular-nums">{say(line)}</p>
        {/each}
        {#if tile.tip.group}
            <div class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span class="min-w-0 flex-1">{say(tile.tip.group)}</span>
                {@render tierArt()}
            </div>
        {/if}
    </div>
{/snippet}

<Tooltip.Provider>
    <div class="grid grid-cols-8 gap-2" style:--marker-ring="var(--card)">
        <Tooltip.Root delayDuration={100}>
            <Tooltip.Trigger>
                {#snippet child({ props })}
                    <button
                        {...props}
                        type="button"
                        class="tile overall"
                        aria-label="{t(strip.overall.label)} {markText(strip.overall.mark)}"
                    >
                        <span class="flex items-center gap-1.5">
                            <HeroIcon heroId={view.heroId} {heroes} size={16} />
                            <span class="lbl">{t(strip.overall.label)}</span>
                        </span>
                        <span class="row" class:noted={strip.overall.note !== null}>
                            {#if strip.overall.note && strip.overall.mark.kind !== "letter"}
                                <span class="note">{say(strip.overall.note)}</span>
                            {:else}
                                {#if strip.overall.note}
                                    <span class="note">{say(strip.overall.note)}</span>
                                {:else}
                                    <span class="flex flex-none items-center gap-0.5">{@render tierArt()}</span>
                                {/if}
                                {@render markView(strip.overall.mark, true)}
                            {/if}
                        </span>
                        <GradeBar score={strip.overall.score} mini />
                    </button>
                {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content class="max-w-none" style="--marker-ring: var(--popover)">
                {@render tip(strip.overall, null)}
            </Tooltip.Content>
        </Tooltip.Root>
        {#each strip.tiles as tile (tile.stat)}
            <Tooltip.Root delayDuration={100}>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <button
                            {...props}
                            type="button"
                            class="tile"
                            aria-label="{t(tile.label)} {tile.value} {markText(tile.mark)}"
                        >
                            <span class="lbl">{t(tile.label)}</span>
                            <span class="row">
                                <span class="val tabular-nums">{tile.value}</span>
                                {@render markView(tile.mark)}
                            </span>
                            <GradeBar score={tile.score} mini />
                        </button>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content class="max-w-none" style="--marker-ring: var(--popover)">
                    {@render tip(tile, tile.value)}
                </Tooltip.Content>
            </Tooltip.Root>
        {/each}
    </div>
</Tooltip.Provider>

<style>
    .tile {
        display: flex;
        height: 64px;
        min-width: 0;
        flex-direction: column;
        justify-content: space-between;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--card);
        padding: 6px 10px 9px;
        text-align: left;
        font: inherit;
        color: inherit;
        cursor: default;
    }
    .tile:hover,
    .tile:focus-visible {
        background: color-mix(in oklch, var(--accent) 60%, var(--card));
        outline: none;
    }
    .tile:focus-visible {
        box-shadow: 0 0 0 2px var(--ring);
    }
    .overall {
        border-color: color-mix(in oklch, var(--brass) 45%, transparent);
    }
    .row {
        display: flex;
        min-width: 0;
        align-items: baseline;
        justify-content: space-between;
        gap: 4px;
    }
    .row.noted {
        gap: 2px;
    }
    .row.noted .note {
        flex: 1;
        font-size: 9.5px;
    }
    .lbl {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
        line-height: 14px;
        color: var(--muted-foreground);
    }
    .val {
        font-size: 15px;
        font-weight: 600;
        line-height: 1;
    }
    .letter {
        font-family: var(--heading-font);
        font-weight: 700;
        font-size: 15px;
        line-height: 1;
    }
    .letter.big {
        font-size: 18px;
    }
    .dash {
        color: var(--muted-foreground);
    }
    .note {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 10px;
        font-style: italic;
        color: var(--muted-foreground);
    }
    .tier {
        width: 16px;
        height: 16px;
        flex: none;
        object-fit: contain;
    }
</style>
