<script lang="ts">
    import { Monitor, Ruler, TriangleAlert } from "@lucide/svelte";
    import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { formatNumber, t, tn } from "$lib/core/i18n.svelte";
    import Segmented from "$lib/features/match-history/components/list/segmented.svelte";
    import { chipFor, costLine, type HeroKit } from "../../build-detail.svelte";
    import type { ShopCatalog } from "../../catalog";
    import {
        MEASURED_RESOLUTION,
        SHOP_SCREENS,
        closestResolution,
        deviceScreen,
        screenDifferences,
        type ShopMode,
        type ShopResolution,
    } from "../../shop-view";
    import { HeroPopularity } from "../../editor/popularity.svelte";
    import { provideItemTips } from "../shop/item-tips";
    import ShopGrid from "../shop/shop-grid.svelte";

    let {
        build,
        catalog,
        catalogFailed,
        kit = null,
    }: { build: BuildView; catalog: ShopCatalog | null; catalogFailed: boolean; kit?: HeroKit | null } = $props();

    const popularity = new HeroPopularity();
    provideItemTips(() => (catalog ? { catalog, popularity, build, kit } : null));

    $effect(() => {
        void popularity.load(build.heroId);
    });

    const RESOLUTIONS: readonly { value: ShopResolution; label: string }[] = [
        { value: "1080", label: "1080p" },
        { value: "1440", label: "1440p" },
        { value: "2160", label: "4K" },
    ];

    const device = deviceScreen({
        width: window.screen.width,
        height: window.screen.height,
        devicePixelRatio: window.devicePixelRatio,
    });

    let resolution = $state<ShopResolution>(closestResolution(device.height));
    let mode = $state<ShopMode>("fit");

    const resolve = $derived((abilityId: number) => (catalog ? chipFor(catalog.byId, abilityId) : undefined));
    const cost = $derived(catalog ? costLine(build, catalog.byId) : null);
    const hasOptional = $derived(build.modCategories.some((c) => c.optional));
    const differences = $derived(screenDifferences(build.modCategories, device));
</script>

<Card as="section" padding="none" class="overflow-hidden" aria-label={t("builds.view.shop")}>
    <div class="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h2 class="text-lg font-semibold">{t("builds.view.shop")}</h2>
        {#if cost}
            <p
                class="text-sm text-muted-foreground"
                data-testid="cost-line"
                data-total={cost.total}
                data-items={cost.items}
            >
                {tn("builds.view.cost", cost.items, { souls: formatNumber(cost.total) })}
                {#if hasOptional}
                    <span class="text-muted-foreground/70">{t("builds.view.cost_optional")}</span>
                {/if}
            </p>
        {/if}
        <div class="ml-auto flex flex-wrap items-center gap-2">
            {#if resolution !== MEASURED_RESOLUTION}
                <Tooltip.Provider>
                    <Tooltip.Root delayDuration={100}>
                        <Tooltip.Trigger>
                            {#snippet child({ props })}
                                <Badge {...props} variant="warning" tabindex={0} data-testid="unmeasured">
                                    {t("builds.view.unmeasured")}
                                </Badge>
                            {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content>{t("builds.view.unmeasured_hint")}</Tooltip.Content>
                    </Tooltip.Root>
                </Tooltip.Provider>
            {/if}
            <Segmented
                options={RESOLUTIONS}
                value={resolution}
                label={t("builds.view.resolution")}
                icon={Monitor}
                onselect={(v) => (resolution = v)}
            />
            <Button
                variant="toggle"
                size="sm"
                aria-pressed={mode === "native"}
                data-testid="actual-size"
                onclick={() => (mode = mode === "native" ? "fit" : "native")}
            >
                <Ruler aria-hidden="true" />{t("builds.view.actual_size")}
            </Button>
        </div>
    </div>

    {#if cost && cost.removed > 0}
        <p class="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm" role="note">
            <TriangleAlert class="size-4 shrink-0 text-warning" aria-hidden="true" />
            {tn("builds.view.removed", cost.removed)}
        </p>
    {/if}

    <div class="p-4" data-testid="shop" data-resolution={resolution} data-mode={mode}>
        {#if catalog}
            <ShopGrid {build} {resolve} screen={SHOP_SCREENS[resolution]} {mode} {differences} />
        {:else if catalogFailed}
            <EmptyState role="alert">{t("builds.view.shop_failed")}</EmptyState>
        {/if}
    </div>
</Card>
