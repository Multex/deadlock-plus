<script lang="ts">
    import type { Component, Snippet } from "svelte";
    import {
        ChevronLeft,
        ChevronRight,
        ChevronsUp,
        LockOpen,
        PackageMinus,
        PackagePlus,
        ShoppingCart,
    } from "@lucide/svelte";
    import { i18n, t } from "$lib/core/i18n.svelte";
    import { formatClock } from "$lib/features/live/live";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Slider from "@deadlock-plus/ui/slider.svelte";
    import type { IdVisual } from "@deadlock-plus/match/deep-dive/catalog";
    import { resolveItemListVisuals } from "../../../deep-dive/catalog";
    import {
        ABILITY_UPGRADES,
        clampStep,
        purchaseActions,
        purchaseStateAt,
        type PurchaseAction,
        type PurchaseKind,
    } from "@deadlock-plus/match/deep-dive/purchases";
    import type { MatchPlayer } from "@deadlock-plus/match/detail";
    import ItemTile from "../item-tile.svelte";
    import IdTile from "./id-tile.svelte";
    import SectionCard from "./section-card.svelte";

    let { selected, actions: headerActions }: { selected: MatchPlayer; actions?: Snippet } = $props();

    type Icon = Component<{ size?: number; class?: string; "aria-hidden"?: boolean | "true" | "false" }>;

    const ICONS: Record<PurchaseKind, Icon> = {
        "item-buy": PackagePlus,
        "item-sell": PackageMinus,
        "ability-unlock": LockOpen,
        "ability-upgrade": ChevronsUp,
    };

    let visuals = $state.raw(new Map<number, IdVisual>());
    let token = 0;

    $effect(() => {
        const ids = [
            ...new Set(selected.items.flatMap((i) => [i.itemId, ...(i.imbuedAbilityId ? [i.imbuedAbilityId] : [])])),
        ];
        const locale = i18n.locale;
        const mine = ++token;
        void resolveItemListVisuals(ids, locale).then((found) => {
            if (mine === token) visuals = found;
        });
    });

    const actions = $derived(purchaseActions(selected.items, (id) => visuals.get(id)?.kind));

    let picked = $state.raw<{ player: MatchPlayer; step: number } | null>(null);
    const step = $derived(clampStep(picked?.player === selected ? picked.step : 0, actions.length));
    const current = $derived<PurchaseAction | undefined>(actions[step]);
    const held = $derived(purchaseStateAt(actions, step));

    const select = (next: number) => (picked = { player: selected, step: clampStep(next, actions.length) });

    const clock = (s: number) => formatClock(Math.round(s)) ?? "0:00";
    const isAbility = (a: PurchaseAction) => a.kind === "ability-unlock" || a.kind === "ability-upgrade";
    const itemName = (id: number) => visuals.get(id)?.name ?? t("match_history.deep_dive.names.item");
    const abilityName = (id: number) => visuals.get(id)?.name ?? t("match_history.deep_dive.names.ability");
    const nameOf = (a: PurchaseAction) => (isAbility(a) ? abilityName(a.id) : itemName(a.id));
    const upgradesOf = (level: number) => Math.min(Math.max(level - 1, 0), ABILITY_UPGRADES);

    function describe(a: PurchaseAction): string {
        const name = nameOf(a);
        switch (a.kind) {
            case "item-buy":
                return t("match_history.deep_dive.purchases.item_buy", { name });
            case "item-sell":
                return t("match_history.deep_dive.purchases.item_sell", { name });
            case "ability-unlock":
                return t("match_history.deep_dive.purchases.ability_unlock", { name });
            case "ability-upgrade":
                return t("match_history.deep_dive.purchases.ability_upgrade", {
                    name,
                    count: upgradesOf(a.level ?? 1),
                    total: ABILITY_UPGRADES,
                });
        }
    }

    let list = $state<HTMLOListElement | null>(null);

    // Scrolls the list alone: `scrollIntoView` would also move the page.
    $effect(() => {
        const row = list?.children[step];
        if (!list || !(row instanceof HTMLElement)) return;
        const top = row.offsetTop - list.offsetTop;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) {
            list.scrollTop = top + row.offsetHeight - list.clientHeight;
        }
    });
</script>

<SectionCard
    title={t("match_history.deep_dive.purchases.heading")}
    icon={ShoppingCart}
    available={actions.length > 0}
    actions={headerActions}
>
    <div class="flex flex-col gap-4">
        <div class="flex items-center gap-2">
            <Button
                size="icon"
                variant="outline"
                class="shrink-0"
                aria-label={t("match_history.deep_dive.purchases.previous")}
                title={t("match_history.deep_dive.purchases.previous")}
                disabled={step <= 0}
                onclick={() => select(step - 1)}
            >
                <ChevronLeft aria-hidden="true" />
            </Button>
            <Slider
                class="min-w-0 flex-1"
                bind:value={() => step, select}
                min={0}
                max={Math.max(actions.length - 1, 1)}
                step={1}
                ticks
                disabled={actions.length < 2}
                formatValue={(i) => (actions[i] ? clock(actions[i].timeS) : "")}
                valueText={(i) => (actions[i] ? `${clock(actions[i].timeS)} ${describe(actions[i])}` : "")}
                aria-label={t("match_history.deep_dive.purchases.slider_aria")}
            />
            <Button
                size="icon"
                variant="outline"
                class="shrink-0"
                aria-label={t("match_history.deep_dive.purchases.next")}
                title={t("match_history.deep_dive.purchases.next")}
                disabled={step >= actions.length - 1}
                onclick={() => select(step + 1)}
            >
                <ChevronRight aria-hidden="true" />
            </Button>
            <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
                {t("match_history.deep_dive.purchases.step", { current: step + 1, total: actions.length })}
            </span>
        </div>

        {#if current}
            {@const Glyph = ICONS[current.kind]}
            <div class="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3" aria-live="polite">
                <span class="w-12 shrink-0 text-sm font-semibold tabular-nums">{clock(current.timeS)}</span>
                <IdTile src={visuals.get(current.id)?.src} label={nameOf(current)} size={40} />
                <span class="flex min-w-0 flex-col">
                    <span class="flex items-center gap-1.5 text-sm font-medium">
                        <Glyph size={14} class="shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span class="truncate">{describe(current)}</span>
                    </span>
                    {#if current.imbuedAbilityId !== undefined}
                        <span class="truncate text-xs text-muted-foreground">
                            {t("match_history.deep_dive.purchases.imbued", {
                                ability: abilityName(current.imbuedAbilityId),
                            })}
                        </span>
                    {/if}
                </span>
            </div>
        {/if}

        <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex min-w-0 flex-col gap-2">
                <h3 class="text-xs font-medium text-muted-foreground">
                    {t("match_history.deep_dive.purchases.holding")}
                </h3>
                {#if held.items.length > 0}
                    <ul class="held" aria-label={t("match_history.deep_dive.purchases.holding")}>
                        {#each held.items as item, i (i)}
                            <ItemTile
                                slot={{
                                    itemId: item.itemId,
                                    name: visuals.get(item.itemId)?.name ?? null,
                                    src: visuals.get(item.itemId)?.src ?? null,
                                }}
                            />
                        {/each}
                    </ul>
                {:else}
                    <p class="text-sm text-muted-foreground">{t("match_history.deep_dive.purchases.no_items")}</p>
                {/if}
            </div>
            <div class="flex min-w-0 flex-col gap-2">
                <h3 class="text-xs font-medium text-muted-foreground">
                    {t("match_history.deep_dive.purchases.abilities")}
                </h3>
                {#if held.abilities.length > 0}
                    <ul class="flex flex-col gap-1.5">
                        {#each held.abilities as a (a.abilityId)}
                            {@const upgrades = upgradesOf(a.level)}
                            <li class="flex items-center gap-2 text-sm">
                                <IdTile
                                    src={visuals.get(a.abilityId)?.src}
                                    label={abilityName(a.abilityId)}
                                    size={24}
                                />
                                <span class="min-w-0 flex-1 truncate">{abilityName(a.abilityId)}</span>
                                <span
                                    class="flex shrink-0 gap-0.5"
                                    role="img"
                                    aria-label={t("match_history.deep_dive.purchases.ability_level_aria", {
                                        count: upgrades,
                                        total: ABILITY_UPGRADES,
                                    })}
                                >
                                    {#each { length: ABILITY_UPGRADES } as _, n (n)}
                                        <span class="size-2 rounded-sm {n < upgrades ? 'bg-primary' : 'bg-muted'}"
                                        ></span>
                                    {/each}
                                </span>
                            </li>
                        {/each}
                    </ul>
                {:else}
                    <p class="text-sm text-muted-foreground">
                        {t("match_history.deep_dive.purchases.no_abilities")}
                    </p>
                {/if}
            </div>
        </div>

        <ol
            bind:this={list}
            class="flex max-h-64 flex-col overflow-y-auto rounded-md border border-border"
            aria-label={t("match_history.deep_dive.purchases.list_aria")}
        >
            {#each actions as a, i (i)}
                {@const Glyph = ICONS[a.kind]}
                <li>
                    <Button
                        variant="unstyled"
                        class="flex w-full items-center gap-2 px-2 py-1 text-sm hover:bg-accent/60 {i === step
                            ? 'bg-accent text-accent-foreground'
                            : ''}"
                        aria-current={i === step ? "step" : undefined}
                        onclick={() => select(i)}
                    >
                        <span class="w-11 shrink-0 text-xs text-muted-foreground tabular-nums">{clock(a.timeS)}</span>
                        <Glyph size={14} class="shrink-0 text-muted-foreground" aria-hidden="true" />
                        <IdTile src={visuals.get(a.id)?.src} label={nameOf(a)} size={20} />
                        <span class="min-w-0 flex-1 truncate">{describe(a)}</span>
                    </Button>
                </li>
            {/each}
        </ol>
    </div>
</SectionCard>

<style>
    .held {
        display: grid;
        grid-template-columns: repeat(auto-fill, 2.25rem);
        gap: 4px;
    }
</style>
