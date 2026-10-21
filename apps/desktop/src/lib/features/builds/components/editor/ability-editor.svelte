<script lang="ts">
    import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { t, tn } from "$lib/core/i18n.svelte";
    import type { HeroKit } from "../../build-detail.svelte";
    import {
        appendStep,
        dependents,
        fillRest,
        isValid,
        loadOrder,
        moveStep,
        orderSteps,
        pointsSummary,
        removeStep,
        slotState,
        type BlockReason,
    } from "../../editor/ability-order";
    import { updateBuild } from "../../editor/document";
    import type { BuildEditor } from "../../editor/editor.svelte";
    import AbilityColumn from "./ability/ability-column.svelte";
    import SequenceStrip from "./ability/sequence-strip.svelte";

    let { editor, kit }: { editor: BuildEditor; kit: HeroKit } = $props();

    let refusal = $state<BlockReason | null>(null);

    const abilities = $derived([...kit.abilities.keys()]);
    const loaded = $derived(loadOrder(editor.build.abilityOrder, abilities, kit.ultimateId));
    const order = $derived(loaded.order);
    const stale = $derived(!isValid(editor.build.abilityOrder, abilities, kit.ultimateId));
    const slots = $derived(slotState(order, abilities, kit.ultimateId, kit.levels));
    const steps = $derived(orderSteps(order, kit.levels));
    const points = $derived(pointsSummary(order, kit.levels));
    const complete = $derived(fillRest(order, abilities, kit.ultimateId).length === order.length);

    function commit(next: CurrencyChangeView[]) {
        refusal = null;
        editor.apply(updateBuild(editor.build, { abilityOrder: next }));
    }

    function append(abilityId: number) {
        const edit = appendStep(order, abilityId, abilities, kit.ultimateId);
        if (edit.ok) commit(edit.order);
        else refusal = edit.reason;
    }

    function move(from: number, to: number): boolean {
        const edit = moveStep(order, from, to, abilities, kit.ultimateId);
        if (!edit.ok) {
            refusal = edit.reason;
            return false;
        }
        commit(edit.order);
        return true;
    }

    const alsoRemoves = (step: number) => dependents(order, step, abilities, kit.ultimateId).map((i) => i + 1);
</script>

<Card as="section" padding="none" aria-label={t("builds.editor.abilities.title")} class="flex flex-col">
    {#if abilities.length === 0}
        <EmptyState class="p-6">{t("builds.editor.abilities.no_kit")}</EmptyState>
    {:else}
        {#if stale && (loaded.dropped > 0 || loaded.moved > 0)}
            <div
                class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warning/10 px-4 py-2 text-sm"
                role="status"
            >
                <span>
                    {#if loaded.dropped > 0}{tn("builds.editor.abilities.dropped", loaded.dropped)}{/if}
                    {#if loaded.moved > 0}{tn("builds.editor.abilities.moved", loaded.moved)}{/if}
                </span>
                <Button size="sm" variant="outline" onclick={() => commit(order)}>
                    {t("builds.editor.abilities.clean_up")}
                </Button>
            </div>
        {/if}

        <div class="grid grid-cols-4 gap-3 p-4">
            {#each abilities as abilityId, column (abilityId)}
                <AbilityColumn
                    ability={kit.abilities.get(abilityId)}
                    ultimate={abilityId === kit.ultimateId}
                    slots={slots[column] ?? []}
                    nextStep={order.length + 1}
                    {alsoRemoves}
                    onappend={() => append(abilityId)}
                    onremove={(step) => commit(removeStep(order, step, abilities, kit.ultimateId))}
                />
            {/each}
        </div>

        <div class="flex flex-col gap-3 border-t border-border px-4 py-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="font-heading text-sm font-semibold">{t("builds.editor.abilities.sequence")}</h3>
                <div class="flex gap-2">
                    <Button size="sm" variant="outline" disabled={order.length === 0} onclick={() => commit([])}>
                        {t("builds.editor.abilities.clear")}
                    </Button>
                    <Tooltip.Provider>
                        <Tooltip.Root delayDuration={350}>
                            <Tooltip.Trigger>
                                {#snippet child({ props })}
                                    <Button
                                        {...props}
                                        size="sm"
                                        variant="outline"
                                        disabled={complete}
                                        onclick={() => commit(fillRest(order, abilities, kit.ultimateId))}
                                    >
                                        {t("builds.editor.abilities.fill_rest")}
                                    </Button>
                                {/snippet}
                            </Tooltip.Trigger>
                            <Tooltip.Content side="bottom"
                                >{t("builds.editor.abilities.fill_rest_hint")}</Tooltip.Content
                            >
                        </Tooltip.Root>
                    </Tooltip.Provider>
                </div>
            </div>
            {#if steps.length === 0}
                <EmptyState>{t("builds.editor.abilities.empty")}</EmptyState>
            {:else}
                <SequenceStrip {steps} {kit} onmove={move} />
                <p class="text-xs text-muted-foreground">{t("builds.editor.abilities.sequence_hint")}</p>
            {/if}
            <p class="min-h-4 text-xs text-warning" role="status" aria-live="polite">
                {#if refusal}{t(`builds.editor.abilities.reason_${refusal}`)}{/if}
            </p>
        </div>

        <footer
            class="flex flex-wrap gap-x-6 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted-foreground tabular-nums"
        >
            <span>
                {points.available === null
                    ? t("builds.editor.abilities.spent", { spent: points.spent })
                    : t("builds.editor.abilities.spent_of", { spent: points.spent, available: points.available })}
            </span>
            {#if steps.length > 0}
                <span>
                    {points.lastLevel === null
                        ? t("builds.editor.abilities.last_level_unknown")
                        : t("builds.editor.abilities.last_level", { level: points.lastLevel })}
                </span>
            {/if}
        </footer>
    {/if}
</Card>
