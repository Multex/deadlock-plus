<script lang="ts">
    import { TriangleAlert } from "@lucide/svelte";
    import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
    import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { cn } from "@deadlock-plus/ui/utils";
    import { i18n, t, tn } from "$lib/core/i18n.svelte";
    import { abilityTooltipsRevision, heroAbilityTooltips, type TooltipHero } from "../../ability-tooltip";
    import type { HeroKit } from "../../build-detail.svelte";
    import {
        abilityProgress,
        appendStep,
        dependents,
        isUnlocksFirst,
        isValid,
        loadOrder,
        moveStep,
        orderSteps,
        pointsSummary,
        previewUnlocksFirst,
        removeStep,
        TIER_COSTS,
        type BlockReason,
        type OrderStep,
    } from "../../editor/ability-order";
    import { updateBuild } from "../../editor/document";
    import type { BuildEditor } from "../../editor/editor.svelte";
    import { buildsHero } from "../../game-ui-host.svelte";
    import { heroStatsAtStep, heroTimeline } from "../../hero-timeline";
    import { itemTipSource } from "../shop/item-tips";
    import AbilityButton from "./ability-bar/ability-button.svelte";
    import BarFrame from "./ability-bar/bar-frame.svelte";
    import PointsLine from "./ability-bar/points-line.svelte";
    import SequenceTrack from "./ability-bar/sequence-track.svelte";

    let { editor, kit, class: className }: { editor: BuildEditor; kit: HeroKit | null; class?: string } = $props();

    let refusal = $state<BlockReason | null>(null);
    let hovered = $state<number | null>(null);
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

    const abilities = $derived(kit ? [...kit.abilities.keys()] : []);
    const ultimateId = $derived(kit?.ultimateId ?? null);
    const levels = $derived(kit?.levels ?? []);
    const loaded = $derived(loadOrder(editor.build.abilityOrder, abilities, ultimateId));
    const order = $derived(loaded.order);
    const stale = $derived(!isValid(editor.build.abilityOrder, abilities, ultimateId));
    const progress = $derived(abilityProgress(order, abilities, ultimateId, levels));
    const steps = $derived(orderSteps(order, levels));
    const points = $derived(pointsSummary(order, levels));
    const total = $derived(abilities.length * (TIER_COSTS.length + 1));

    const tipSource = itemTipSource();
    const hero = $derived(buildsHero(editor.build.heroId));
    const timeline = $derived.by(() => {
        const catalog = tipSource()?.catalog;
        return catalog && hero?.stats ? heroTimeline(hero.stats, editor.build, catalog, levels) : null;
    });
    // Each button shows the ability at its current tier, so its hero is the one at the step that trained it.
    const heroes = $derived(
        progress.map((p): TooltipHero => ({
            stats: timeline ? heroStatsAtStep(timeline, steps, p.lastStep) : undefined,
            icon: hero?.icon ?? null,
        })),
    );

    const preview = $derived.by((): OrderStep | null => {
        const column = hovered === null ? -1 : abilities.indexOf(hovered);
        const next = progress[column]?.next;
        return next?.kind === "next" ? { abilityId: hovered!, tier: next.tier, level: next.level } : null;
    });

    function commit(next: CurrencyChangeView[]) {
        refusal = null;
        editor.apply(updateBuild(editor.build, { abilityOrder: next }));
    }

    function append(abilityId: number) {
        const edit = appendStep(order, abilityId, abilities, ultimateId);
        if (edit.ok) commit(edit.order);
        else refusal = edit.reason;
    }

    function move(from: number, to: number): boolean {
        const edit = moveStep(order, from, to, abilities, ultimateId);
        if (!edit.ok) {
            refusal = edit.reason;
            return false;
        }
        if (!edit.changed) return false;
        commit(edit.order);
        return true;
    }

    const check = (from: number, to: number) => {
        const edit = moveStep(order, from, to, abilities, ultimateId);
        return edit.ok ? null : edit.reason;
    };

    const remove = (index: number) => commit(removeStep(order, index, abilities, ultimateId));
    const alsoRemoves = (index: number) => dependents(order, index, abilities, ultimateId).map((i) => i + 1);
</script>

<BarFrame
    {kit}
    title={t("builds.editor.abilities.title")}
    class={cn("h-[150px] shrink-0 border-t border-border", className)}
    data-testid="ability-bar"
>
    {#snippet actions()}
        {#if stale && (loaded.dropped > 0 || loaded.moved > 0)}
            <span class="flex min-w-0 items-center gap-2 text-xs text-warning" role="status">
                <TriangleAlert class="size-3.5 shrink-0" />
                <span class="truncate">
                    {#if loaded.dropped > 0}{tn("builds.editor.abilities.dropped", loaded.dropped)}{/if}
                    {#if loaded.moved > 0}{tn("builds.editor.abilities.moved", loaded.moved)}{/if}
                </span>
                <Button size="sm" variant="outline" class="h-6 px-2" onclick={() => commit(order)}>
                    {t("builds.editor.abilities.clean_up")}
                </Button>
            </span>
        {/if}
        <div class="ml-auto flex shrink-0 gap-1.5">
            <Tooltip.Provider>
                <Tooltip.Root delayDuration={300}>
                    <Tooltip.Trigger>
                        {#snippet child({ props })}
                            <span {...props} class="inline-flex">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    class="h-7"
                                    disabled={isUnlocksFirst(order)}
                                    data-testid="ability-unlocks-first"
                                    onclick={() => commit(previewUnlocksFirst(order))}
                                >
                                    {t("builds.editor.abilities.unlocks_first")}
                                </Button>
                            </span>
                        {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content>{t("builds.editor.abilities.unlocks_first_hint")}</Tooltip.Content>
                </Tooltip.Root>
            </Tooltip.Provider>
            <Button size="sm" variant="ghost" class="h-7" disabled={order.length === 0} onclick={() => commit([])}>
                {t("builds.editor.abilities.clear")}
            </Button>
        </div>
    {/snippet}

    {#snippet track(kit: HeroKit)}
        <SequenceTrack {steps} {kit} {total} {preview} {alsoRemoves} {check} onmove={move} onremove={remove} />
    {/snippet}

    {#snippet footer()}
        <PointsLine {points} stepCount={steps.length} />
        <span class="min-w-0 truncate text-warning" role="status" aria-live="polite">
            {#if refusal}{t(`builds.editor.abilities.reason_${refusal}`)}{/if}
        </span>
        <span class="ml-auto truncate text-muted-foreground">
            {steps.length === 0 ? t("builds.editor.abilities.empty_bar") : t("builds.editor.abilities.sequence_hint")}
        </span>
    {/snippet}

    {#snippet icons(kit: HeroKit)}
        {#each abilities as abilityId, column (abilityId)}
            <AbilityButton
                ability={kit.abilities.get(abilityId)}
                tooltip={tooltips.get(abilityId)}
                hero={heroes[column]}
                slot={column + 1}
                ultimate={abilityId === ultimateId}
                progress={progress[column]!}
                nextStep={order.length + 1}
                {alsoRemoves}
                onappend={() => append(abilityId)}
                onremove={remove}
                onpreview={(on) => {
                    if (on) hovered = abilityId;
                    else if (hovered === abilityId) hovered = null;
                }}
            />
        {/each}
    {/snippet}
</BarFrame>
