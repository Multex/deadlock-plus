<script lang="ts">
    import { CalendarDays, Settings2, Swords, Trophy, Users, X } from "@lucide/svelte";

    import { t, tn } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import type { RowFilters } from "@deadlock-plus/match/filters";
    import Segmented from "./segmented.svelte";
    import {
        DAY_OPTIONS,
        MODE_OPTIONS,
        OUTCOME_OPTIONS,
        filtersActive,
        heroMenuItems,
        parseHeroValue,
        type HeroOption,
    } from "./view-model";

    let {
        filters,
        heroes,
        heroArt,
        onchange,
        onreset,
    }: {
        filters: RowFilters;
        heroes: HeroOption[];
        heroArt: Record<number, Hero>;
        onchange: (patch: Partial<RowFilters>) => void;
        onreset: () => void;
    } = $props();

    const modes = $derived(MODE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })));
    const outcomes = $derived(OUTCOME_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })));
    const windows = $derived(
        DAY_OPTIONS.map((d) => ({
            value: d === null ? "" : String(d),
            label: d === null ? t("stats.filter.all_time") : tn("stats.filter.days", d),
        })),
    );
    const heroItems = $derived(heroMenuItems(heroes, t("match_history.list.filter.any_hero")));
</script>

<div
    class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-3 py-2.5"
    role="group"
    aria-label={t("match_history.list.filter.label")}
>
    <Segmented
        label={t("match_history.list.filter.mode")}
        icon={Swords}
        options={modes}
        value={filters.mode}
        disabled={filters.custom}
        onselect={(v) => onchange({ mode: v })}
    />
    <Segmented
        label={t("match_history.list.filter.outcome")}
        icon={Trophy}
        options={outcomes}
        value={filters.outcome}
        onselect={(v) => onchange({ outcome: v })}
    />
    <Segmented
        label={t("match_history.list.filter.window")}
        icon={CalendarDays}
        options={windows}
        value={filters.days === null ? "" : String(filters.days)}
        onselect={(v) => onchange({ days: v === "" ? null : Number(v) })}
    />
    <SelectMenu
        items={heroItems}
        class="w-48"
        aria-label={t("match_history.list.filter.hero")}
        bind:value={
            () => (filters.heroId === null ? "" : String(filters.heroId)),
            (v) => onchange({ heroId: parseHeroValue(v) })
        }
    >
        {#snippet leading(item)}
            {@const icon = item.heroId === undefined ? undefined : heroArt[item.heroId]?.icon}
            {#if icon}
                <img src={icon} alt="" />
            {:else}
                <Users aria-hidden="true" />
            {/if}
        {/snippet}
    </SelectMenu>
    <Button
        variant="toggle"
        size="sm"
        class="h-9"
        aria-pressed={filters.custom}
        onclick={() => onchange({ custom: !filters.custom })}
    >
        <Settings2 aria-hidden="true" />
        {t("match_history.list.filter.custom")}
    </Button>
    {#if filtersActive(filters)}
        <Button variant="ghost" size="sm" class="ml-auto h-9 px-2 text-muted-foreground" onclick={onreset}>
            <X aria-hidden="true" />
            {t("match_history.list.filter.reset")}
        </Button>
    {/if}
</div>
