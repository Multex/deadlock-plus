<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import { CalendarClock, ExternalLink, Star, UserRound, X } from "@lucide/svelte";
    import Button, { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import { formatDate, formatNumber, t } from "$lib/core/i18n.svelte";
    import Segmented from "$lib/features/match-history/components/list/segmented.svelte";
    import { stats } from "$lib/features/stats/stats.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import { BuildBrowser } from "../../browser.svelte";
    import { pickSelection, withParam } from "../../build-list";
    import type { BuildLookups } from "../../lookups.svelte";
    import {
        DEFAULT_FILTERS,
        filtersFromParams,
        filtersToParams,
        MIN_FAVORITES_STEPS,
        PUBLIC_SORTS,
        UPDATED_WITHIN,
        type BrowserFilters,
        type PublicBuild,
        type UpdatedWithin,
    } from "../../public-builds";
    import DetailActions from "../build-detail/detail-actions.svelte";
    import BuildOverview from "./build-overview.svelte";
    import BuildRow from "./build-row.svelte";
    import HeroFilter from "./filters/hero-filter.svelte";
    import LanguageFilter from "./filters/language-filter.svelte";
    import SortFilter from "./filters/sort-filter.svelte";
    import TagFilter from "./filters/tag-filter.svelte";
    import ListDetail from "./list-detail.svelte";

    let { hero = null, lookups }: { hero?: number | null; lookups: BuildLookups } = $props();

    const browser = new BuildBrowser();

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
    const heroName = $derived(browser.heroes.find((h) => h.id === browser.heroId)?.name ?? "");
    const sortItems = $derived(PUBLIC_SORTS.map((value) => ({ value, label: t(`builds.browser.sort_${value}`) })));
    const windows = $derived<{ value: UpdatedWithin; label: string }[]>(
        UPDATED_WITHIN.map((value) => ({ value, label: t(`builds.browser.updated_${value}`) })),
    );
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

    const heroInfo = $derived(browser.heroes.find((h) => h.id === browser.heroId));
    const keys = $derived(browser.builds.map((b) => String(b.build.heroBuildId)));
    const selectedKey = $derived(pickSelection(keys, page.url.searchParams.get("build")));
    const selected = $derived(browser.builds.find((b) => String(b.build.heroBuildId) === selectedKey) ?? null);
    const paneDetail = $derived(selected ? browser.detailFor(selected) : null);
    let detailOpen = $state(false);

    function navigate(params: URLSearchParams) {
        const query = params.toString();
        void goto(`${page.url.pathname}${query ? `?${query}` : ""}`, {
            replaceState: true,
            keepFocus: true,
            noScroll: true,
        });
    }

    /** The URL holds the filters, so they survive leaving the page and coming back. */
    function apply(filters: BrowserFilters, heroId: number | null = hero) {
        const params = filtersToParams(filters, page.url.searchParams);
        if (heroId === null) params.delete("hero");
        else params.set("hero", String(heroId));
        navigate(params);
    }

    function select(key: string) {
        detailOpen = true;
        if (key !== selectedKey) navigate(withParam(page.url.searchParams, "build", key));
    }

    const viewHref = (entry: PublicBuild) => `/builds/view?source=public&id=${entry.build.heroBuildId}`;

    function byline(entry: PublicBuild): string[] {
        const author = browser.authors.get(entry.build.authorAccountId);
        const at = entry.build.lastUpdatedTimestamp;
        return [
            author ? t("builds.browser.by", { name: author }) : null,
            at === null ? null : t("builds.browser.updated", { date: formatDate(at * 1000, { dateStyle: "medium" }) }),
        ].filter((part): part is string => part !== null);
    }

    // Any other filter change also commits the name as typed, so a pending search is not undone.
    const patch = (change: Partial<BrowserFilters>) =>
        apply({ ...browser.filters, name: browser.search.trim(), ...change });

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

    $effect(() => lookups.loadKits([browser.heroId]));

    onMount(() => browser.start());
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="flex flex-col gap-2" role="group" aria-label={t("builds.browser.filters")}>
        <div class="flex flex-wrap items-center gap-2">
            <HeroFilter heroes={browser.heroes} value={browser.heroId} onchange={(id) => id !== null && pickHero(id)} />
            <SortFilter options={sortItems} value={browser.filters.sort} onchange={(sort) => patch({ sort })} />
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
            <TagFilter tags={lookups.gameTags} value={browser.filters.tag} onchange={(tag) => patch({ tag })} />
            <LanguageFilter value={browser.filters.language} onchange={(language) => patch({ language })} withDefault />
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

    {#if browser.status === "loading"}
        <EmptyState role="status" aria-busy="true">{t("builds.browser.loading")}</EmptyState>
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
        <ListDetail
            {keys}
            selected={selectedKey}
            onselect={select}
            label={t("builds.list.label")}
            bind:open={detailOpen}
        >
            {#snippet list()}
                {#each browser.builds as entry (entry.build.heroBuildId)}
                    {@const key = String(entry.build.heroBuildId)}
                    <BuildRow
                        rowKey={key}
                        name={entry.build.name}
                        href={viewHref(entry)}
                        selected={key === selectedKey}
                        onselect={() => select(key)}
                        byline={byline(entry)}
                        tags={lookups.tags(entry.build)}
                        items={lookups.core(entry.build)}
                        favourites={entry.favorites}
                        weekly={entry.weeklyFavorites}
                        winRate={browser.winRates.get(entry.build.heroBuildId)}
                    />
                {/each}
            {/snippet}
            {#snippet detail()}
                {#if selected && paneDetail}
                    {@const author = browser.authors.get(selected.build.authorAccountId)}
                    <BuildOverview
                        build={selected.build}
                        hero={heroInfo}
                        author={selected.build.authorAccountId === accountId
                            ? t("builds.view.by_you")
                            : author
                              ? t("builds.browser.by", { name: author })
                              : null}
                        version={selected.build.version}
                        favourites={selected.favorites}
                        weekly={selected.weeklyFavorites}
                        winRate={browser.winRates.get(selected.build.heroBuildId)}
                        tags={lookups.tags(selected.build)}
                        catalog={lookups.catalog}
                        catalogFailed={lookups.catalogFailed}
                        kit={lookups.kits.get(selected.build.heroId) ?? null}
                    >
                        {#snippet actions()}
                            <DetailActions detail={paneDetail} ownAccountId={accountId} layout="row">
                                {#snippet leading()}
                                    <a
                                        class={buttonVariants({ size: "sm" })}
                                        href={viewHref(selected)}
                                        data-testid="open-full-view"
                                    >
                                        <ExternalLink aria-hidden="true" />
                                        {t("builds.list.open_full")}
                                    </a>
                                {/snippet}
                            </DetailActions>
                        {/snippet}
                    </BuildOverview>
                {/if}
            {/snippet}
        </ListDetail>
    {/if}
</div>
