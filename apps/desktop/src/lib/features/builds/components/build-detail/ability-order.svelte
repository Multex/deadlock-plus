<script lang="ts">
    import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
    import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
    import { i18n, t } from "$lib/core/i18n.svelte";
    import { heroAbilityTooltips } from "../../ability-tooltip";
    import type { HeroKit } from "../../build-detail.svelte";
    import { readSteps, stepsSummary } from "../../editor/ability-order";
    import AbilityButton from "../editor/ability-bar/ability-button.svelte";
    import BarFrame from "../editor/ability-bar/bar-frame.svelte";
    import PointsLine from "../editor/ability-bar/points-line.svelte";
    import SequenceTrack from "../editor/ability-bar/sequence-track.svelte";

    let { order, kit }: { order: readonly CurrencyChangeView[]; kit: HeroKit | null } = $props();

    const levels = $derived(kit?.levels ?? []);
    const steps = $derived(readSteps(order, levels));
    const points = $derived(stepsSummary(steps, levels));

    let tooltips = $state.raw<ReadonlyMap<number, AbilityTooltip>>(new Map());

    $effect(() => {
        let live = true;
        void heroAbilityTooltips(i18n.locale).then((read) => {
            if (live) tooltips = read;
        });
        return () => {
            live = false;
        };
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
            <SequenceTrack {steps} {kit} {tooltips} readonly />
        {/if}
    {/snippet}

    {#snippet footer()}
        {#if steps.length > 0}<PointsLine {points} stepCount={steps.length} />{/if}
    {/snippet}

    {#snippet icons(kit: HeroKit)}
        {#each [...kit.abilities.keys()] as abilityId, column (abilityId)}
            <AbilityButton
                ability={kit.abilities.get(abilityId)}
                tooltip={tooltips.get(abilityId)}
                slot={column + 1}
                ultimate={abilityId === kit.ultimateId}
                progress={progress(abilityId)}
                readonly
            />
        {/each}
    {/snippet}
</BarFrame>
