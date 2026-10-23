<script lang="ts">
    import { untrack } from "svelte";
    import {
        CircleX,
        Clock,
        Copy,
        ExternalLink,
        Globe,
        HardDrive,
        ListFilter,
        Pencil,
        PencilLine,
        Plus,
        Star,
        Trash2,
        TriangleAlert,
        UserRound,
    } from "@lucide/svelte";
    import { toast } from "svelte-sonner";
    import { goto } from "$app/navigation";
    import { page } from "$app/state";

    import { failureText } from "$lib/core/errors";
    import { formatDate, t, tn } from "$lib/core/i18n.svelte";
    import Button, { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import ConfirmDialog from "$lib/components/confirm-dialog.svelte";
    import Segmented from "$lib/features/match-history/components/list/segmented.svelte";
    import { MyBuildsStore, type ActionOutcome } from "$lib/features/builds/my-builds.svelte";
    import {
        DEFAULT_MINE_FILTERS,
        FAVOURITE_SORTS,
        MINE_SORTS,
        MINE_STATUSES,
        canDelete,
        copyRequest,
        favouriteAction,
        favouriteViewHref,
        filterFavourites,
        filterMine,
        mineFiltered,
        mineFiltersFromParams,
        mineFiltersToParams,
        openHref,
        waitingCount,
        type FavouriteRow,
        type MineFilters,
        type MineRow,
        type MineSort,
        type MineStatusFilter,
        type MineView,
    } from "$lib/features/builds/my-builds";
    import { pickSelection, withParam } from "$lib/features/builds/build-list";
    import { editHref, editHrefFor } from "$lib/features/builds/editor/load";
    import { loadPlayableHeroes } from "$lib/features/builds/heroes";
    import type { BuildLookups } from "$lib/features/builds/lookups.svelte";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import type { ResolveChoice } from "@deadlock-plus/ipc-types/ResolveChoice";
    import BuildOverview from "../browser/build-overview.svelte";
    import BuildRow from "../browser/build-row.svelte";
    import HeroFilter from "../browser/filters/hero-filter.svelte";
    import LanguageFilter from "../browser/filters/language-filter.svelte";
    import SortFilter from "../browser/filters/sort-filter.svelte";
    import TagFilter from "../browser/filters/tag-filter.svelte";
    import ListDetail from "../browser/list-detail.svelte";
    import ConflictDialog from "./conflict-dialog.svelte";
    import StatusBadge from "./status-badge.svelte";

    let { lookups }: { lookups: BuildLookups } = $props();

    const SEARCH_DELAY_MS = 300;
    const ANY = "any";
    const SELECTION = "mbuild";

    const store = new MyBuildsStore();
    let heroes = $state<Record<number, Hero>>({});
    let playable = $state.raw<Hero[]>([]);
    let deleting = $state<MineRow | null>(null);
    let confirmOpen = $state(false);
    let discarding = $state<MineRow | null>(null);
    let discardOpen = $state(false);
    let detailOpen = $state(false);

    const filters = $derived(mineFiltersFromParams(page.url.searchParams));
    /** The name field as typed: the list follows it at once, the URL once typing pauses. */
    let search = $state("");
    const shown = $derived<MineFilters>({ ...filters, name: search });
    const view = $derived(filters.view);

    const own = $derived(
        filterMine(
            store.groups.flatMap((g) => g.rows),
            shown,
            store.winRates,
        ),
    );
    const favourites = $derived(filterFavourites(store.favourites, shown));
    const keys = $derived(view === "mine" ? own.map((r) => r.key) : favourites.map((r) => r.key));
    const selectedKey = $derived(pickSelection(keys, page.url.searchParams.get(SELECTION)));
    const selectedOwn = $derived(view === "mine" ? (own.find((r) => r.key === selectedKey) ?? null) : null);
    const selectedFavourite = $derived(
        view === "favourites" ? (favourites.find((r) => r.key === selectedKey) ?? null) : null,
    );
    const showHero = $derived(filters.hero === null);

    const heroIds = $derived([
        ...new Set([
            ...store.groups.flatMap((g) => (g.heroId === null ? [] : [g.heroId])),
            ...store.favourites.map((f) => f.heroId),
        ]),
    ]);
    const picked = $derived(filters.hero === null ? undefined : heroes[filters.hero]);
    const narrowed = $derived(mineFiltered({ ...shown, hero: null }));
    const newBuildHero = $derived(
        filters.hero ?? selectedOwn?.heroId ?? selectedFavourite?.heroId ?? playable[0]?.id ?? null,
    );
    const waiting = $derived(waitingCount(store.queue));
    const conflict = $derived(store.conflicts[0] ?? null);

    const views = $derived<{ value: MineView; label: string }[]>([
        { value: "mine", label: t("builds.mine.title") },
        { value: "favourites", label: t("builds.mine.favourites_title") },
    ]);
    const SORT_LABELS: Record<MineSort, string> = {
        updated: "builds.browser.sort_updated",
        name: "builds.mine.sort_name",
        favorites: "builds.browser.sort_favorites",
        win_rate: "builds.mine.sort_win_rate",
        versions: "builds.browser.sort_versions",
    };
    const sorts = $derived(
        (view === "mine" ? MINE_SORTS : FAVOURITE_SORTS).map((value) => ({ value, label: t(SORT_LABELS[value]) })),
    );
    const sort = $derived(view === "mine" || FAVOURITE_SORTS.includes(filters.sort) ? filters.sort : "updated");
    const statuses = $derived(
        MINE_STATUSES.map((value) => ({
            value,
            label: value === "all" ? t("builds.mine.status_all") : t(`builds.mine.status.${value}`),
        })),
    );
    const authorItems = $derived([
        { value: ANY, label: t("builds.mine.author_any") },
        ...[...new Set(store.favourites.map((f) => f.authorAccountId))]
            .map((id) => ({ value: String(id), label: store.authors.get(id) ?? String(id) }))
            .sort((a, b) => a.label.localeCompare(b.label)),
    ]);

    function navigate(params: URLSearchParams) {
        const query = params.toString();
        void goto(`${page.url.pathname}${query ? `?${query}` : ""}`, {
            replaceState: true,
            keepFocus: true,
            noScroll: true,
        });
    }

    const apply = (next: MineFilters) => navigate(mineFiltersToParams(next, page.url.searchParams));
    // Any other filter change also commits the name as typed, so a pending search is not undone.
    const patch = (change: Partial<MineFilters>) => apply({ ...filters, name: search.trim(), ...change });

    function select(key: string) {
        detailOpen = true;
        if (key !== selectedKey) navigate(withParam(page.url.searchParams, SELECTION, key));
    }

    $effect(() => {
        const name = filters.name;
        untrack(() => {
            if (search.trim() !== name) search = name;
        });
    });

    $effect(() => {
        const name = search.trim();
        if (name === untrack(() => filters.name)) return;
        const timer = setTimeout(() => apply({ ...untrack(() => filters), name }), SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    });

    $effect(() => store.start());
    $effect(() =>
        onHeroesRefreshed((fresh) => {
            heroes = fresh;
            void loadPlayableHeroes()
                .then((list) => (playable = list))
                .catch(() => {});
        }),
    );
    $effect(() => {
        void loadPlayableHeroes()
            .then((list) => (playable = list))
            .catch(() => {});
    });
    $effect(() => {
        const wanted = heroIds;
        void loadHeroes(wanted)
            .then((loaded) => (heroes = loaded))
            .catch(() => {});
    });
    $effect(() => lookups.loadKits(heroIds));

    $effect(() => {
        if (store.flushFailed) toast.error(failureText(store.flushFailed, t("builds.mine.flush_failed")));
    });

    function report(outcome: ActionOutcome, done: string) {
        if (outcome === "conflict") toast.error(t("builds.mine.changed_in_game"));
        else if (outcome === "queued") toast.success(t("builds.mine.queued"));
        else toast.success(done);
    }

    async function run(action: () => Promise<ActionOutcome>, done: string) {
        try {
            report(await action(), done);
        } catch (e) {
            toast.error(failureText(e, t("builds.mine.action_failed")));
        }
    }

    function askDelete(row: MineRow) {
        deleting = row;
        confirmOpen = true;
    }

    async function cancelQueued(row: MineRow) {
        try {
            await store.cancelQueued(row);
        } catch (e) {
            toast.error(failureText(e, t("builds.mine.action_failed")));
        }
    }

    function askDiscard(row: MineRow) {
        discarding = row;
        discardOpen = true;
    }

    async function discard(row: MineRow) {
        try {
            await store.discard(row);
            toast.success(t("builds.mine.draft_discarded"));
        } catch (e) {
            toast.error(failureText(e, t("builds.mine.action_failed")));
        }
    }

    async function resolve(choice: ResolveChoice) {
        if (conflict) await store.resolve(conflict, choice);
    }

    const updated = (at: number | null) =>
        at === null ? null : t("builds.mine.updated", { date: formatDate(at * 1000, { dateStyle: "medium" }) });

    function ownByline(row: MineRow): string[] {
        return [
            showHero ? heroName(row.heroId) : null,
            updated(row.updatedAt),
            row.version === null ? null : t("builds.mine.favourite_version", { version: row.version }),
        ].filter((part): part is string => part !== null);
    }

    function favouriteByline(row: FavouriteRow): string[] {
        const author = store.authors.get(row.authorAccountId);
        return [
            showHero ? heroName(row.heroId) : null,
            author ? t("builds.browser.by", { name: author }) : null,
            updated(row.updatedAt),
        ].filter((part): part is string => part !== null);
    }

    function heroName(heroId: number | null): string {
        if (heroId === null) return t("builds.mine.group_new");
        return heroes[heroId]?.name ?? t("builds.mine.unknown_hero");
    }

    const winRateOf = (row: MineRow) =>
        row.published && row.buildId !== null ? store.winRates.get(row.buildId) : undefined;

    const emptyText = $derived.by(() => {
        if (narrowed) return t("builds.browser.empty_filtered");
        if (view === "favourites") {
            return picked
                ? t("builds.mine.favourites_empty_hero", { hero: picked.name })
                : t("builds.mine.favourites_empty");
        }
        if (filters.hero !== null) {
            return t("builds.mine.empty_hero", { hero: picked?.name ?? t("builds.mine.unknown_hero") });
        }
        return t("builds.mine.empty");
    });
</script>

{#snippet openFull(href: string | null)}
    {#if href}
        <a class={buttonVariants({ size: "sm" })} {href} data-testid="open-full-view">
            <ExternalLink aria-hidden="true" />
            {t("builds.list.open_full")}
        </a>
    {/if}
{/snippet}

{#snippet ownActions(row: MineRow)}
    {@const edit = editHrefFor(row)}
    {@const favourite = favouriteAction(row)}
    <div class="flex flex-wrap items-center gap-2" data-testid="row-actions">
        {@render openFull(openHref(row))}
        {#if edit}
            <a class={buttonVariants({ variant: "outline", size: "sm" })} href={edit} data-testid="edit-build">
                <Pencil aria-hidden="true" />
                {t("builds.editor.edit")}
            </a>
        {/if}
        {#if copyRequest(row, row.name) !== null}
            <Button
                variant="outline"
                size="sm"
                disabled={store.busy}
                data-testid="copy-as-new"
                onclick={() =>
                    void run(
                        () => store.copy(row, t("builds.mine.copy_name", { name: row.name })),
                        t("builds.mine.copied"),
                    )}
            >
                <Copy aria-hidden="true" />
                {t("builds.mine.copy")}
            </Button>
        {/if}
        {#if favourite}
            <Button
                variant="toggle"
                size="sm"
                aria-pressed={row.favorited}
                disabled={store.busy}
                data-testid="favourite"
                onclick={() =>
                    void run(
                        () => store.toggleFavourite(row),
                        row.favorited ? t("builds.mine.unfavourited") : t("builds.mine.favourited"),
                    )}
            >
                <Star class={row.favorited ? "fill-current" : ""} aria-hidden="true" />
                {t("builds.mine.favourite")}
            </Button>
        {/if}
        {#if row.queue.length > 0}
            <Button
                variant="outline"
                size="sm"
                disabled={store.busy}
                data-testid="cancel-queued"
                onclick={() => void cancelQueued(row)}
            >
                <CircleX aria-hidden="true" />
                {t("builds.mine.cancel_queued")}
            </Button>
        {/if}
        {#if row.draft}
            <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive"
                disabled={store.busy}
                data-testid="discard-draft"
                onclick={() => askDiscard(row)}
            >
                <Trash2 aria-hidden="true" />
                {t("builds.mine.discard_draft")}
            </Button>
        {/if}
        {#if row.published}
            <Button variant="ghost" size="sm" disabled data-testid="delete-in-game">
                <Trash2 aria-hidden="true" />
                {t("builds.mine.delete_in_game")}
            </Button>
        {:else if canDelete(row)}
            <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive"
                disabled={store.busy}
                data-testid="delete-build"
                onclick={() => askDelete(row)}
            >
                <Trash2 aria-hidden="true" />
                {t("builds.mine.delete")}
            </Button>
        {/if}
    </div>
{/snippet}

{#snippet ownNotes(row: MineRow)}
    {#if row.draftOf}
        <p class="text-sm text-muted-foreground">{t("builds.mine.draft_of", { name: row.draftOf })}</p>
    {/if}
    {#if row.edited}
        <p
            class="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
            <TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t("builds.mine.edited")} {t("builds.mine.edited_hint")}</span>
        </p>
    {/if}
{/snippet}

{#snippet status(row: MineRow)}
    <span class="flex shrink-0 items-center gap-1.5" data-testid="status" data-status={row.status}>
        <StatusBadge status={row.status} waiting={row.waiting} />
    </span>
{/snippet}

<section class="flex min-h-0 flex-1 flex-col gap-3" aria-label={t("builds.mine.title")}>
    <div class="flex flex-col gap-2" role="group" aria-label={t("builds.browser.filters")}>
        <div class="flex flex-wrap items-center gap-2">
            <Segmented
                options={views}
                value={view}
                label={t("builds.mine.show")}
                onselect={(v) => patch({ view: v })}
            />
            <HeroFilter
                heroes={playable}
                value={filters.hero}
                onchange={(hero) => patch({ hero })}
                allLabel={t("builds.mine.all_heroes")}
            />
            <SortFilter options={sorts} value={sort} onchange={(next) => patch({ sort: next })} />
            <Input
                bind:value={search}
                type="search"
                placeholder={t("builds.browser.search")}
                aria-label={t("builds.browser.search_label")}
                class="min-w-48 flex-1"
            />
            {#if newBuildHero !== null}
                <a
                    class={buttonVariants({ variant: "outline" })}
                    href={editHref({ source: "new", heroId: newBuildHero })}
                    data-testid="new-build"
                >
                    {#if heroes[newBuildHero]?.icon}
                        <img src={heroes[newBuildHero]!.icon} alt="" class="size-5 rounded-sm object-cover" />
                    {:else}
                        <Plus aria-hidden="true" />
                    {/if}
                    {t("builds.editor.new_build")}
                </a>
            {/if}
        </div>
        <div class="flex flex-wrap items-center gap-2">
            {#if view === "mine"}
                <SelectMenu
                    items={statuses}
                    value={filters.status}
                    onValueChange={(v) => patch({ status: v as MineStatusFilter })}
                    aria-label={t("builds.mine.status_label")}
                    size="sm"
                    class="w-56"
                >
                    {#snippet leading(item)}
                        {#if item.value === "public"}<Globe />{:else if item.value === "local"}<HardDrive
                            />{:else if item.value === "draft"}<PencilLine />{:else if item.value === "waiting"}<Clock
                            />{:else}<ListFilter />{/if}
                    {/snippet}
                </SelectMenu>
            {:else}
                <SelectMenu
                    items={authorItems}
                    value={filters.author === null ? ANY : String(filters.author)}
                    onValueChange={(v) => patch({ author: v === ANY ? null : Number(v) })}
                    aria-label={t("builds.browser.author_label")}
                    size="sm"
                    class="w-56"
                >
                    {#snippet icon()}<UserRound />{/snippet}
                </SelectMenu>
            {/if}
            <TagFilter tags={lookups.gameTags} value={filters.tag} onchange={(tag) => patch({ tag })} />
            <LanguageFilter
                value={filters.language}
                onchange={(language) => patch({ language: language === "default" ? "any" : language })}
            />
            {#if mineFiltered(shown)}
                <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => apply({ ...DEFAULT_MINE_FILTERS, view: filters.view, sort: filters.sort })}
                >
                    {t("builds.browser.clear_filters")}
                </Button>
            {/if}
        </div>
    </div>

    {#if store.gameRunning && waiting > 0}
        <div
            class="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
            role="status"
        >
            <Clock class="size-4 shrink-0 text-warning" aria-hidden="true" />
            {tn("builds.mine.queue_banner", waiting)}
        </div>
    {/if}
    {#if view === "mine" && store.publishedFailed}
        <p class="flex items-center gap-2 text-xs text-muted-foreground">
            <TriangleAlert class="size-3.5 shrink-0 text-warning" aria-hidden="true" />
            {t("builds.mine.published_failed")}
        </p>
    {/if}

    {#if store.loading}
        <EmptyState>{t("builds.mine.loading")}</EmptyState>
    {:else if store.error}
        <EmptyState tone="destructive">
            {failureText(store.error, t("builds.mine.load_failed"))}
            {#snippet action()}
                <Button variant="outline" size="sm" onclick={() => void store.refresh()}>
                    {t("builds.mine.retry")}
                </Button>
            {/snippet}
        </EmptyState>
    {:else if keys.length === 0}
        <EmptyState role="status">{emptyText}</EmptyState>
    {:else}
        <ListDetail
            {keys}
            selected={selectedKey}
            onselect={select}
            label={view === "mine" ? t("builds.mine.title") : t("builds.mine.favourites_title")}
            bind:open={detailOpen}
        >
            {#snippet list()}
                {#if view === "mine"}
                    {#each own as row (row.key)}
                        <BuildRow
                            rowKey={row.key}
                            name={row.name}
                            href={openHref(row) ?? editHrefFor(row)}
                            selected={row.key === selectedKey}
                            onselect={() => select(row.key)}
                            hero={row.heroId === null ? undefined : heroes[row.heroId]}
                            {showHero}
                            byline={ownByline(row)}
                            tags={lookups.tags(row.build)}
                            items={lookups.core(row.build)}
                            favourites={row.favourites}
                            winRate={winRateOf(row)}
                            testid="mine-row"
                        >
                            {#snippet badges()}{@render status(row)}{/snippet}
                            {#snippet marks()}
                                {#if row.edited}
                                    <TriangleAlert
                                        class="size-3.5 text-warning"
                                        role="img"
                                        aria-label={t("builds.mine.edited")}
                                    />
                                {/if}
                                {#if row.favorited}
                                    <Star
                                        class="size-3.5 fill-current text-brass"
                                        role="img"
                                        aria-label={t("builds.view.favourited")}
                                        data-testid="favourited"
                                    />
                                {/if}
                            {/snippet}
                        </BuildRow>
                    {/each}
                {:else}
                    {#each favourites as row (row.key)}
                        <BuildRow
                            rowKey={row.key}
                            name={row.name}
                            href={favouriteViewHref(row)}
                            selected={row.key === selectedKey}
                            onselect={() => select(row.key)}
                            hero={heroes[row.heroId]}
                            {showHero}
                            byline={favouriteByline(row)}
                            tags={lookups.tags(row.build)}
                            items={lookups.core(row.build)}
                            testid="favourite-row"
                        />
                    {/each}
                {/if}
            {/snippet}
            {#snippet detail()}
                {#if selectedOwn}
                    {@const row = selectedOwn}
                    {#if row.build}
                        <BuildOverview
                            build={row.build}
                            hero={row.heroId === null ? undefined : heroes[row.heroId]}
                            author={t("builds.view.by_you")}
                            version={row.version}
                            favourites={row.favourites}
                            winRate={winRateOf(row)}
                            tags={lookups.tags(row.build)}
                            catalog={lookups.catalog}
                            catalogFailed={lookups.catalogFailed}
                            kit={row.heroId === null ? null : (lookups.kits.get(row.heroId) ?? null)}
                        >
                            {#snippet badges()}{@render status(row)}{/snippet}
                            {#snippet actions()}{@render ownActions(row)}{/snippet}
                            {#snippet notes()}{@render ownNotes(row)}{/snippet}
                        </BuildOverview>
                    {:else}
                        <div class="flex flex-col gap-4 p-5" data-testid="build-overview">
                            <div class="flex items-center gap-2.5">
                                <h2 class="truncate text-2xl leading-tight">{row.name}</h2>
                                {@render status(row)}
                            </div>
                            {@render ownActions(row)}
                        </div>
                    {/if}
                {:else if selectedFavourite}
                    {@const row = selectedFavourite}
                    {@const author = store.authors.get(row.authorAccountId)}
                    <BuildOverview
                        build={row.build}
                        hero={heroes[row.heroId]}
                        author={author ? t("builds.browser.by", { name: author }) : null}
                        version={row.version}
                        tags={lookups.tags(row.build)}
                        catalog={lookups.catalog}
                        catalogFailed={lookups.catalogFailed}
                        kit={lookups.kits.get(row.heroId) ?? null}
                    >
                        {#snippet actions()}
                            <div class="flex flex-wrap items-center gap-2" data-testid="row-actions">
                                {@render openFull(favouriteViewHref(row))}
                                <a
                                    class={buttonVariants({ variant: "outline", size: "sm" })}
                                    href={editHref({ source: "local", id: row.buildId })}
                                    data-testid="edit-copy"
                                >
                                    <Copy aria-hidden="true" />
                                    {t("builds.editor.edit_copy")}
                                </a>
                                <Button
                                    variant="toggle"
                                    size="sm"
                                    aria-pressed="true"
                                    disabled={store.busy}
                                    data-testid="favourite"
                                    onclick={() =>
                                        void run(() => store.unfavourite(row), t("builds.mine.unfavourited"))}
                                >
                                    <Star class="fill-current" aria-hidden="true" />
                                    {t("builds.mine.favourite")}
                                </Button>
                            </div>
                        {/snippet}
                    </BuildOverview>
                {/if}
            {/snippet}
        </ListDetail>
    {/if}
</section>

<ConfirmDialog
    bind:open={confirmOpen}
    class="max-w-md"
    title={t("builds.mine.delete_title", { name: deleting?.name ?? "" })}
    description={t("builds.mine.delete_description")}
    confirmLabel={t("builds.mine.delete")}
    destructive
    disabled={store.busy}
    onconfirm={async () => {
        if (deleting) await run(() => store.delete(deleting!), t("builds.mine.deleted"));
    }}
/>

<ConfirmDialog
    bind:open={discardOpen}
    class="max-w-md"
    title={t("builds.mine.discard_title", { name: discarding?.name ?? "" })}
    description={t("builds.mine.discard_description")}
    confirmLabel={t("builds.mine.discard_draft")}
    destructive
    disabled={store.busy}
    onconfirm={async () => {
        if (discarding) await discard(discarding);
    }}
/>

<ConflictDialog {conflict} busy={store.busy} onresolve={(choice) => void resolve(choice)} />
