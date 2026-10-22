<script lang="ts">
    import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
    import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
    import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
    import { i18n, t } from "$lib/core/i18n.svelte";
    import { abilityTooltipsRevision, heroAbilityTooltips, type TooltipHero } from "../../ability-tooltip";
    import type { HeroKit } from "../../build-detail.svelte";
    import type { ShopCatalog } from "../../catalog";
    import { readSteps, stepsSummary } from "../../editor/ability-order";
    import { buildsHero } from "../../game-ui-host.svelte";
    import { heroStatsAtStep, heroTimeline } from "../../hero-timeline";
    import AbilityButton from "../editor/ability-bar/ability-button.svelte";
    import BarFrame from "../editor/ability-bar/bar-frame.svelte";
    import PointsLine from "../editor/ability-bar/points-line.svelte";
    import SequenceTrack from "../editor/ability-bar/sequence-track.svelte";

    let {
        order,
        kit,
        build,
        catalog,
    }: {
        order: readonly CurrencyChangeView[];
        kit: HeroKit | null;
        /** With the catalog, scales the hovers by the hero as it stands at each step. */
        build?: BuildView;
        catalog?: ShopCatalog | null;
    } = $props();

    const levels = $derived(kit?.levels ?? []);
    const steps = $derived(readSteps(order, levels));
    const points = $derived(stepsSummary(steps, levels));

    let tooltips = $state.raw<ReadonlyMap<number, AbilityTooltip>>(new Map());

    $effect(() => {
        let live = true;
        abilityTooltipsRevision();
        void heroAbilityTooltips(i18n.locale).then((read) => {
            if (live) tooltips = read;
        });
        return () => {
            live = false;
        };
    });

    const hero = $derived(build ? buildsHero(build.heroId) : null);
    const timeline = $derived(
        build && catalog && hero?.stats ? heroTimeline(hero.stats, build, catalog, levels) : null,
    );
    const heroAt = (index: number | null): TooltipHero => ({
        stats: timeline ? heroStatsAtStep(timeline, steps, index) : undefined,
        icon: hero?.icon ?? null,
    });

    function progress(abilityId: number) {
        let tier: number | null = null;
        let lastStep: number | null = null;
        for (const [i, step] of steps.entries()) {
            if (step.abilityId !== abilityId) continue;
            tier = step.tier;
            lastStep = i;
        }
        return { tier, lastStep };
    }
</script>

<BarFrame {kit} title={t("builds.view.abilities")} class="rounded-lg border border-border" data-testid="ability-order">
    {#snippet track(kit: HeroKit)}
        {#if steps.length === 0}
            <p class="my-auto text-sm text-muted-foreground">{t("builds.view.no_abilities")}</p>
        {:else}
            <SequenceTrack {steps} {kit} {tooltips} {heroAt} readonly />
        {/if}
    {/snippet}

    {#snippet footer()}
        {#if steps.length > 0}<PointsLine {points} stepCount={steps.length} />{/if}
    {/snippet}

    {#snippet icons(kit: HeroKit)}
        {#each [...kit.abilities.keys()] as abilityId, column (abilityId)}
            {@const shown = progress(abilityId)}
            <AbilityButton
                ability={kit.abilities.get(abilityId)}
                tooltip={tooltips.get(abilityId)}
                slot={column + 1}
                ultimate={abilityId === kit.ultimateId}
                hero={heroAt(shown.lastStep)}
                progress={shown}
                readonly
            />
        {/each}
    {/snippet}
</BarFrame>
