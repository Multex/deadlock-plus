<script lang="ts">
    import type { Snippet } from "svelte";
    import { Star, Trophy } from "@lucide/svelte";
    import ArtImage from "@deadlock-plus/ui/art-image.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { formatDate, formatNumber, t, tn } from "$lib/core/i18n.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
    import type { HeroKit } from "../../build-detail.svelte";
    import type { ShopCatalog } from "../../catalog";
    import type { TagInfo } from "../../editor/details";
    import { tagLabel } from "../../lookups.svelte";
    import type { WinRate } from "../../public-builds";
    import AbilityOrder from "../build-detail/ability-order.svelte";
    import ShopPanel from "../build-detail/shop-panel.svelte";
    import TagGlyph from "./tag-glyph.svelte";

    let {
        build,
        hero,
        author,
        version,
        favourites = null,
        weekly = null,
        winRate,
        tags,
        catalog,
        catalogFailed,
        kit,
        badges,
        actions,
        notes,
    }: {
        build: BuildView;
        hero: Hero | undefined;
        /** Already worded, such as "By you". */
        author: string | null;
        /** Only a published build's version means anything to the player. */
        version: number | null;
        favourites?: number | null;
        weekly?: number | null;
        winRate?: WinRate;
        tags: readonly TagInfo[];
        catalog: ShopCatalog | null;
        catalogFailed: boolean;
        kit: HeroKit | null;
        badges?: Snippet;
        actions: Snippet;
        notes?: Snippet;
    } = $props();

    const updated = $derived(
        build.lastUpdatedTimestamp
            ? t("builds.browser.updated", {
                  date: formatDate(build.lastUpdatedTimestamp * 1000, { dateStyle: "medium" }),
              })
            : null,
    );
    const meta = $derived(
        [hero?.name, author, version === null ? null : t("builds.mine.favourite_version", { version }), updated].filter(
            (part): part is string => !!part,
        ),
    );
    const rate = $derived(
        winRate && formatNumber(winRate.wins / winRate.matches, { style: "percent", maximumFractionDigits: 0 }),
    );
    const description = $derived(build.description.trim());
    const heroArt = "size-full object-cover object-top";
</script>

<article class="flex flex-col gap-4 p-5" data-testid="build-overview" data-build={build.heroBuildId}>
    <header class="flex gap-4">
        <div class="h-[88px] w-[72px] shrink-0 overflow-hidden rounded-md border border-border bg-muted">
            {#if hero?.portrait && hero.icon}
                <ArtImage src={hero.portrait} alt={hero.name} label={hero.name} class={heroArt}>
                    {#snippet fallback()}
                        <ArtImage src={hero.icon} alt="" label={hero.name} class={heroArt} />
                    {/snippet}
                </ArtImage>
            {:else}
                <ArtImage
                    src={hero?.portrait ?? hero?.icon}
                    alt={hero?.name ?? ""}
                    label={hero?.name}
                    class={heroArt}
                />
            {/if}
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                <h2 class="min-w-0 truncate text-2xl leading-tight" data-testid="overview-name">{build.name}</h2>
                {@render badges?.()}
            </div>
            <p class="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                {#each meta as part, i (i)}
                    {#if i > 0}<span aria-hidden="true">·</span>{/if}
                    <span class={i === 0 && hero ? "font-medium text-foreground" : ""}>{part}</span>
                {/each}
            </p>
            {#if favourites !== null || weekly || winRate}
                <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
                    {#if favourites !== null}
                        <span class="inline-flex items-center gap-1.5" data-testid="overview-favourites">
                            <Star class="size-3.5 text-brass" aria-hidden="true" />
                            {tn("builds.browser.favorites", favourites)}
                        </span>
                    {/if}
                    {#if weekly}
                        <span class="text-muted-foreground">
                            {t("builds.browser.this_week", { count: formatNumber(weekly) })}
                        </span>
                    {/if}
                    {#if winRate && rate}
                        <Tooltip.Provider>
                            <Tooltip.Root delayDuration={150}>
                                <Tooltip.Trigger
                                    class="inline-flex cursor-default items-center gap-1.5 rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                                    data-testid="overview-win-rate"
                                >
                                    <Trophy class="size-3.5 text-brass" aria-hidden="true" />
                                    {t("builds.browser.win_rate", { rate })}
                                </Tooltip.Trigger>
                                <Tooltip.Content>
                                    {t("builds.browser.win_rate_detail", {
                                        wins: formatNumber(winRate.wins),
                                        matches: formatNumber(winRate.matches),
                                    })}
                                </Tooltip.Content>
                            </Tooltip.Root>
                        </Tooltip.Provider>
                    {/if}
                </p>
            {/if}
            {#if tags.length > 0}
                <ul class="mt-0.5 flex flex-wrap gap-1.5" aria-label={t("builds.browser.tag")}>
                    {#each tags as tag (tag.id)}
                        <li
                            class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/40 pr-2.5 pl-1.5 text-xs text-foreground/85"
                        >
                            <TagGlyph {tag} class="size-[18px]" />
                            {tagLabel(tag)}
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    </header>

    {@render actions()}
    {@render notes?.()}

    {#if description}
        <p class="text-sm leading-relaxed whitespace-pre-line text-foreground/85" data-testid="overview-description">
            {description}
        </p>
    {/if}

    <ShopPanel {build} {catalog} {catalogFailed} {kit} />
    <AbilityOrder order={build.abilityOrder} {kit} {build} {catalog} />
</article>
