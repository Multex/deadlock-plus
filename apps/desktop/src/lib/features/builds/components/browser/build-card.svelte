<script lang="ts">
    import { Star } from "@lucide/svelte";
    import type { Screen } from "@deadlock-plus/build-layout";
    import { formatDate, formatNumber, t, tn } from "$lib/core/i18n.svelte";
    import ShopGrid from "../shop/shop-grid.svelte";
    import type { PublicBuild } from "../../public-builds";
    import { shopView, type ChipItem } from "../../shop-view";

    let {
        entry,
        author,
        resolve,
        weekly,
    }: {
        entry: PublicBuild;
        author: string | undefined;
        resolve: ((abilityId: number) => ChipItem | undefined) | null;
        /** Shows this week's favourites beside the total. */
        weekly: boolean;
    } = $props();

    const SCREEN: Screen = { width: 2560, height: 1440 };

    const build = $derived(entry.build);
    /** Share of the shop's width the categories use: the preview crops the empty right side away. */
    const used = $derived.by(() => {
        const view = shopView(build.modCategories, SCREEN, 1, "fit");
        const right = Math.max(0, ...view.categories.map(({ box }) => box.x + box.width));
        return right > 0 ? Math.min(1, right / view.contentWidth) : 1;
    });
    const href = $derived(`/builds/view?source=public&id=${build.heroBuildId}`);
    const favorites = $derived(tn("builds.browser.favorites", entry.favorites));
    const updated = $derived(
        build.lastUpdatedTimestamp === null
            ? null
            : formatDate(build.lastUpdatedTimestamp * 1000, { dateStyle: "medium" }),
    );
</script>

<article
    class="relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-brass/60 focus-within:border-brass"
>
    <div class="preview border-b border-border bg-background/40 p-2" inert>
        {#if resolve}
            <div style:width="{100 / used}%">
                <ShopGrid {build} {resolve} screen={SCREEN} mode="fit" />
            </div>
        {/if}
    </div>
    <div class="flex flex-col gap-1 px-3 py-2.5">
        <div class="flex items-center gap-3">
            <h3 class="min-w-0 truncate text-base font-semibold">
                <a {href} class="after:absolute after:inset-0 focus-visible:outline-none">{build.name}</a>
            </h3>
            <span class="ml-auto inline-flex shrink-0 items-center gap-1 text-sm" title={favorites}>
                <Star class="size-3.5 text-brass" aria-hidden="true" />
                <span aria-hidden="true">{formatNumber(entry.favorites)}</span>
                <span class="sr-only">{favorites}</span>
            </span>
        </div>
        <div class="flex items-center gap-3 text-xs text-muted-foreground">
            <span class="min-w-0 truncate">
                {#if author}{t("builds.browser.by", { name: author })}{/if}
                {#if author && updated}<span aria-hidden="true"> · </span>{/if}
                {#if updated}{t("builds.browser.updated", { date: updated })}{/if}
            </span>
            {#if weekly}
                <span class="ml-auto shrink-0">
                    {t("builds.browser.this_week", { count: formatNumber(entry.weeklyFavorites) })}
                </span>
            {/if}
        </div>
    </div>
</article>

<style>
    .preview {
        max-height: 16rem;
        overflow: hidden;
        mask-image: linear-gradient(to bottom, black 85%, transparent);
    }
</style>
