<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import { ArrowDownWideNarrow, CalendarClock, Languages, Star, Tag, UserRound, X } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import { formatNumber, i18n, t } from "$lib/core/i18n.svelte";
    import Segmented from "$lib/features/match-history/components/list/segmented.svelte";
    import { stats } from "$lib/features/stats/stats.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import { BuildBrowser } from "../../browser.svelte";
    import { languageOptions } from "../../editor/details";
    import {
        DEFAULT_FILTERS,
        filtersFromParams,
        filtersToParams,
        MIN_FAVORITES_STEPS,
        PUBLIC_SORTS,
        UPDATED_WITHIN,
        type BrowserFilters,
        type UpdatedWithin,
    } from "../../public-builds";
    import BuildCard from "./build-card.svelte";

    let { hero = null }: { hero?: number | null } = $props();

    const browser = new BuildBrowser();

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
    const heroItems = $derived(browser.heroes.map((h) => ({ value: String(h.id), label: h.name, icon: h.icon })));
    const heroName = $derived(browser.heroes.find((h) => h.id === browser.heroId)?.name ?? "");
    const sortItems = $derived(PUBLIC_SORTS.map((value) => ({ value, label: t(`builds.browser.sort_${value}`) })));
    const windows = $derived<{ value: UpdatedWithin; label: string }[]>(
        UPDATED_WITHIN.map((value) => ({ value, label: t(`builds.browser.updated_${value}`) })),
    );
    const tagItems = $derived([
        { value: "any", label: t("builds.browser.tag_any"), icon: null },
        ...browser.tags.map((tag) => ({ value: String(tag.id), label: tag.name, icon: tag.icon ?? null })),
    ]);
    const languageItems = $derived([
        { value: "default", label: t("builds.browser.language_default") },
        { value: "any", label: t("builds.browser.language_any") },
        ...languageOptions(i18n.locale, 0, String),
    ]);
    const favoriteItems = $derived(
        MIN_FAVORITES_STEPS.map((n) => ({
            value: String(n),
            label:
                n === 0
                    ? t("builds.browser.favorites_any")
                    : t("builds.browser.favorites_min", { count: formatNumber(n) }),
        })),
    );
    const authorName = $derived(
        browser.filters.author === null
            ? null
            : (browser.authors.get(browser.filters.author) ?? String(browser.filters.author)),
    );

    /** The URL holds the filters, so they survive leaving the page and coming back. */
    function apply(filters: BrowserFilters, heroId: number | null = hero) {
        const params = filtersToParams(filters, page.url.searchParams);
        if (heroId === null) params.delete("hero");
        else params.set("hero", String(heroId));
        const query = params.toString();
        void goto(`${page.url.pathname}${query ? `?${query}` : ""}`, {
            replaceState: true,
            keepFocus: true,
            noScroll: true,
        });
    }

    const patch = (change: Partial<BrowserFilters>) => apply({ ...browser.filters, ...change });

    function pickHero(id: number) {
        browser.picked = id;
        apply(browser.filters, id);
    }

    $effect(() => {
        if (accountId !== null) void stats.load(accountId);
    });

    $effect(() => {
        browser.requested = hero;
        browser.picked = null;
    });

    $effect(() => browser.readFilters(filtersFromParams(page.url.searchParams)));

    $effect(() => browser.debounceSearch(apply));

    $effect(() => browser.debounceAuthor(apply));

    $effect(() => {
        if (browser.request) void browser.load(browser.request);
    });

    $effect(() => {
        if (browser.heroId !== null) void browser.loadWinRates(browser.heroId);
    });

    onMount(() => browser.start());
</script>

<div class="flex flex-col gap-4">
    <div class="flex flex-col gap-2" role="group" aria-label={t("builds.browser.filters")}>
        <div class="flex flex-wrap items-center gap-2">
            <SelectMenu
                items={heroItems}
                value={browser.heroId === null ? undefined : String(browser.heroId)}
                onValueChange={(v) => pickHero(Number(v))}
                placeholder={t("builds.browser.hero")}
                aria-label={t("builds.browser.hero")}
                class="w-52"
            >
                {#snippet leading(item)}
                    {#if item.icon}<img src={item.icon} alt="" />{/if}
                {/snippet}
            </SelectMenu>
            <SelectMenu
                items={sortItems}
                value={browser.filters.sort}
                onValueChange={(v) => patch({ sort: v as BrowserFilters["sort"] })}
                aria-label={t("builds.browser.sort")}
                class="w-52"
            >
                {#snippet icon()}<ArrowDownWideNarrow />{/snippet}
            </SelectMenu>
            <Segmented
                options={windows}
                value={browser.filters.within}
                label={t("builds.browser.updated_within")}
                icon={CalendarClock}
                onselect={(v) => patch({ within: v })}
            />
            <Input
                bind:value={browser.search}
                type="search"
                placeholder={t("builds.browser.search")}
                aria-label={t("builds.browser.search_label")}
                class="min-w-48 flex-1"
            />
        </div>
        <div class="flex flex-wrap items-center gap-2">
            <SelectMenu
                items={tagItems}
                value={browser.filters.tag === null ? "any" : String(browser.filters.tag)}
                onValueChange={(v) => patch({ tag: v === "any" ? null : Number(v) })}
                aria-label={t("builds.browser.tag")}
                size="sm"
                class="w-48"
            >
                {#snippet leading(item)}
                    {#if item.icon}<img src={item.icon} alt="" class="object-contain!" />{:else}<Tag />{/if}
                {/snippet}
            </SelectMenu>
            <SelectMenu
                items={languageItems}
                value={String(browser.filters.language)}
                onValueChange={(v) => patch({ language: v === "default" || v === "any" ? v : Number(v) })}
                aria-label={t("builds.browser.language")}
                size="sm"
                class="w-56"
            >
                {#snippet icon()}<Languages />{/snippet}
            </SelectMenu>
            <SelectMenu
                items={favoriteItems}
                value={String(browser.filters.minFavorites)}
                onValueChange={(v) => patch({ minFavorites: Number(v) })}
                aria-label={t("builds.browser.min_favorites")}
                size="sm"
                class="w-44"
            >
                {#snippet icon()}<Star />{/snippet}
            </SelectMenu>
            {#if authorName !== null}
                <span
                    class="inline-flex h-8 items-center gap-1.5 rounded-md border border-brass/60 bg-brass/10 pr-1 pl-2 text-xs"
                >
                    <UserRound class="size-3.5 text-brass" aria-hidden="true" />
                    {t("builds.browser.by", { name: authorName })}
                    <IconButton
                        label={t("builds.browser.author_clear")}
                        class="size-6 [&_svg]:size-3.5"
                        onclick={() => patch({ author: null })}
                    >
                        <X />
                    </IconButton>
                </span>
            {:else}
                <div class="relative w-56">
                    <Input
                        bind:value={browser.authorQuery}
                        type="search"
                        placeholder={t("builds.browser.author")}
                        aria-label={t("builds.browser.author_label")}
                        class="h-8 text-xs"
                    />
                    {#if browser.authorMatches}
                        <div
                            class="absolute top-full left-0 z-(--z-popover) mt-1 flex w-full flex-col rounded-md border border-border bg-popover p-1 shadow-md"
                        >
                            {#each browser.authorMatches as match (match.accountId)}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    class="justify-start font-normal"
                                    onclick={() => browser.pickAuthor(match.accountId, apply, match.name)}
                                >
                                    {#if match.avatar}<img src={match.avatar} alt="" class="size-5 rounded-sm" />{/if}
                                    <span class="truncate">{match.name}</span>
                                </Button>
                            {:else}
                                <p class="px-2 py-1.5 text-xs text-muted-foreground">
                                    {t("builds.browser.author_none")}
                                </p>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
            {#if browser.filtered}
                <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => apply({ ...DEFAULT_FILTERS, sort: browser.filters.sort })}
                >
                    {t("builds.browser.clear_filters")}
                </Button>
            {/if}
        </div>
    </div>

    <div aria-busy={browser.status === "loading"}>
        {#if browser.status === "loading"}
            <EmptyState role="status">{t("builds.browser.loading")}</EmptyState>
        {:else if browser.status === "error"}
            <EmptyState role="status" tone="destructive">
                {browser.error}
                {#snippet action()}
                    <Button variant="outline" size="sm" onclick={() => browser.retry()}>
                        {t("builds.browser.retry")}
                    </Button>
                {/snippet}
            </EmptyState>
        {:else if browser.builds.length === 0}
            <EmptyState role="status">
                {browser.filtered ? t("builds.browser.empty_filtered") : t("builds.browser.empty", { hero: heroName })}
            </EmptyState>
        {:else}
            <ul class="grid grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] gap-3">
                {#each browser.builds as entry (entry.build.heroBuildId)}
                    <li>
                        <BuildCard
                            {entry}
                            author={browser.authors.get(entry.build.authorAccountId)}
                            resolve={browser.resolve}
                            winRate={browser.winRates.get(entry.build.heroBuildId)}
                        />
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
</div>
