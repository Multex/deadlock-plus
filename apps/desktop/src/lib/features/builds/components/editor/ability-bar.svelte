<script lang="ts">
    import { TriangleAlert } from "@lucide/svelte";
    import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { cn } from "@deadlock-plus/ui/utils";
    import { t, tn } from "$lib/core/i18n.svelte";
    import type { HeroKit } from "../../build-detail.svelte";
    import {
        abilityProgress,
        appendStep,
        dependents,
        fillRest,
        isValid,
        loadOrder,
        moveStep,
        orderSteps,
        pointsSummary,
        removeStep,
        TIER_COSTS,
        type BlockReason,
        type OrderStep,
    } from "../../editor/ability-order";
    import { updateBuild } from "../../editor/document";
    import type { BuildEditor } from "../../editor/editor.svelte";
    import AbilityButton from "./ability-bar/ability-button.svelte";
    import SequenceTrack from "./ability-bar/sequence-track.svelte";

    let { editor, kit, class: className }: { editor: BuildEditor; kit: HeroKit | null; class?: string } = $props();

    let refusal = $state<BlockReason | null>(null);
    let hovered = $state<number | null>(null);

    const abilities = $derived(kit ? [...kit.abilities.keys()] : []);
    const ultimateId = $derived(kit?.ultimateId ?? null);
    const levels = $derived(kit?.levels ?? []);
    const loaded = $derived(loadOrder(editor.build.abilityOrder, abilities, ultimateId));
    const order = $derived(loaded.order);
    const stale = $derived(!isValid(editor.build.abilityOrder, abilities, ultimateId));
    const progress = $derived(abilityProgress(order, abilities, ultimateId, levels));
    const steps = $derived(orderSteps(order, levels));
    const points = $derived(pointsSummary(order, levels));
    const complete = $derived(fillRest(order, abilities, ultimateId).length === order.length);
    const total = $derived(abilities.length * (TIER_COSTS.length + 1));

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
        commit(edit.order);
        return true;
    }

    const check = (from: number, to: number) => {
        const edit = moveStep(order, from, to, abilities, ultimateId);
        return edit.ok ? null : edit.reason;
    };

    const remove = (index: number) => commit(removeStep(order, index, abilities, ultimateId));
    const alsoRemoves = (index: number) => dependents(order, index, abilities, ultimateId).map((i) => i + 1);

    const label = "text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase";
</script>

<section
    aria-label={t("builds.editor.abilities.title")}
    class={cn("flex min-h-[150px] overflow-hidden rounded-lg border border-border bg-card", className)}
    data-testid="ability-bar"
>
    {#if !kit}
        <div class="flex flex-1 animate-pulse items-center gap-4 px-4" aria-busy="true">
            <div class="h-[50px] flex-1 rounded-md bg-muted/40"></div>
            {#each { length: 4 } as _, i (i)}
                <div class="size-16 rounded-full bg-muted/40"></div>
            {/each}
        </div>
    {:else if abilities.length === 0}
        <p class="m-auto text-sm text-muted-foreground">{t("builds.editor.abilities.no_kit")}</p>
    {:else}
        <div class="flex min-w-0 flex-1 flex-col gap-2 px-4 pt-2.5 pb-2">
            <header class="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
                <h3 class={label}>{t("builds.editor.abilities.title")}</h3>
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
                <div class="ml-auto flex gap-1.5">
                    <Tooltip.Provider>
                        <Tooltip.Root delayDuration={350}>
                            <Tooltip.Trigger>
                                {#snippet child({ props })}
                                    <Button
                                        {...props}
                                        size="sm"
                                        variant="outline"
                                        class="h-7"
                                        disabled={complete}
                                        onclick={() => commit(fillRest(order, abilities, ultimateId))}
                                    >
                                        {t("builds.editor.abilities.fill_rest")}
                                    </Button>
                                {/snippet}
                            </Tooltip.Trigger>
                            <Tooltip.Content side="top">{t("builds.editor.abilities.fill_rest_hint")}</Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>
                    <Button
                        size="sm"
                        variant="ghost"
                        class="h-7"
                        disabled={order.length === 0}
                        onclick={() => commit([])}
                    >
                        {t("builds.editor.abilities.clear")}
                    </Button>
                </div>
            </header>

            <SequenceTrack {steps} {kit} {total} {preview} {alsoRemoves} {check} onmove={move} onremove={remove} />

            <footer class="mt-auto flex min-h-4 items-center gap-3 text-xs text-muted-foreground tabular-nums">
                <span class="shrink-0">
                    {points.available === null
                        ? t("builds.editor.abilities.spent", { spent: points.spent })
                        : t("builds.editor.abilities.spent_of", { spent: points.spent, available: points.available })}
                    {#if steps.length > 0}
                        <span class="text-muted-foreground/50">·</span>
                        {points.lastLevel === null
                            ? t("builds.editor.abilities.last_level_unknown")
                            : t("builds.editor.abilities.last_level", { level: points.lastLevel })}
                    {/if}
                </span>
                <span class="min-w-0 truncate text-warning" role="status" aria-live="polite">
                    {#if refusal}{t(`builds.editor.abilities.reason_${refusal}`)}{/if}
                </span>
                <span class="ml-auto truncate text-muted-foreground/70">
                    {steps.length === 0
                        ? t("builds.editor.abilities.empty_bar")
                        : t("builds.editor.abilities.sequence_hint")}
                </span>
            </footer>
        </div>

        <div
            class="flex shrink-0 items-center gap-1 border-l border-border bg-[linear-gradient(to_bottom,transparent,color-mix(in_oklch,var(--brass)_5%,transparent))] px-4"
            role="group"
            aria-label={t("builds.editor.abilities.icons_label")}
        >
            {#each abilities as abilityId, column (abilityId)}
                <AbilityButton
                    ability={kit.abilities.get(abilityId)}
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
        </div>
    {/if}
</section>
