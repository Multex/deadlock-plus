<script lang="ts">
    import { CircleHelp, Clock, Plus, TriangleAlert, Users } from "@lucide/svelte";
    import { toast } from "svelte-sonner";

    import { failureText } from "$lib/core/errors";
    import { t, tn } from "$lib/core/i18n.svelte";
    import Button, { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import ConfirmDialog from "$lib/components/confirm-dialog.svelte";
    import Segmented from "$lib/features/match-history/components/list/segmented.svelte";
    import { MyBuildsStore, type ActionOutcome } from "$lib/features/builds/my-builds.svelte";
    import { filterGroups, waitingCount, type MineRow } from "$lib/features/builds/my-builds";
    import { editHref } from "$lib/features/builds/editor/load";
    import { loadPlayableHeroes } from "$lib/features/builds/heroes";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import type { ResolveChoice } from "@deadlock-plus/ipc-types/ResolveChoice";
    import ConflictDialog from "./conflict-dialog.svelte";
    import FavouriteCard from "./favourite-card.svelte";
    import OwnCard from "./own-card.svelte";

    type View = "mine" | "favourites";

    const ALL = "all";

    const store = new MyBuildsStore();
    let heroes = $state<Record<number, Hero>>({});
    let playable = $state.raw<Hero[]>([]);
    let view = $state<View>("mine");
    let heroId = $state<number | null>(null);
    let deleting = $state<MineRow | null>(null);
    let confirmOpen = $state(false);
    let discarding = $state<MineRow | null>(null);
    let discardOpen = $state(false);

    const heroIds = $derived([
        ...new Set([
            ...store.groups.flatMap((g) => (g.heroId === null ? [] : [g.heroId])),
            ...store.favourites.map((f) => f.heroId),
        ]),
    ]);
    const heroItems = $derived([
        { value: ALL, label: t("builds.mine.all_heroes"), icon: null },
        ...playable.map((h) => ({ value: String(h.id), label: h.name, icon: h.icon })),
    ]);
    const views = $derived<{ value: View; label: string }[]>([
        { value: "mine", label: t("builds.mine.title") },
        { value: "favourites", label: t("builds.mine.favourites_title") },
    ]);
    const picked = $derived(heroId === null ? undefined : heroes[heroId]);
    const groups = $derived(filterGroups(store.groups, heroId));
    const favourites = $derived(
        heroId === null ? store.favourites : store.favourites.filter((f) => f.heroId === heroId),
    );
    const waiting = $derived(waitingCount(store.queue));
    const conflict = $derived(store.conflicts[0] ?? null);

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
</script>

{#snippet portrait(hero: Hero | undefined)}
    <span class="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {#if hero?.icon}
            <img src={hero.icon} alt="" class="size-full object-cover" />
        {:else}
            <CircleHelp class="size-4 text-muted-foreground" aria-hidden="true" />
        {/if}
    </span>
{/snippet}

{#snippet newBuild(id: number)}
    <a
        class={buttonVariants({ variant: "outline", size: "sm" })}
        href={editHref({ source: "new", heroId: id })}
        data-testid="new-build"
    >
        <Plus aria-hidden="true" />
        {t("builds.editor.new_build")}
    </a>
{/snippet}

<section class="flex flex-col gap-4" aria-label={t("builds.mine.title")}>
    <div class="flex flex-wrap items-center gap-2">
        <Segmented options={views} value={view} label={t("builds.mine.show")} onselect={(v) => (view = v)} />
        <SelectMenu
            items={heroItems}
            value={heroId === null ? ALL : String(heroId)}
            onValueChange={(v) => (heroId = v === ALL ? null : Number(v))}
            aria-label={t("builds.browser.hero")}
            class="w-52"
        >
            {#snippet leading(item)}
                {#if item.icon}<img src={item.icon} alt="" />{:else}<Users aria-hidden="true" />{/if}
            {/snippet}
        </SelectMenu>
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
    {:else if view === "favourites"}
        {#if favourites.length === 0}
            <EmptyState>
                {picked
                    ? t("builds.mine.favourites_empty_hero", { hero: picked.name })
                    : t("builds.mine.favourites_empty")}
            </EmptyState>
        {:else}
            <ul class="grid grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] gap-3" data-testid="favourites">
                {#each favourites as row (row.key)}
                    <li>
                        <FavouriteCard
                            {row}
                            hero={heroes[row.heroId]}
                            author={store.authors.get(row.authorAccountId)}
                            resolve={store.resolveItem}
                            busy={store.busy}
                            onunfavourite={() => void run(() => store.unfavourite(row), t("builds.mine.unfavourited"))}
                        />
                    </li>
                {/each}
            </ul>
        {/if}
    {:else}
        {#if store.publishedFailed}
            <p class="flex items-center gap-2 text-xs text-muted-foreground">
                <TriangleAlert class="size-3.5 shrink-0 text-warning" aria-hidden="true" />
                {t("builds.mine.published_failed")}
            </p>
        {/if}
        {#if groups.length === 0 && heroId !== null}
            {@const id = heroId}
            <EmptyState>
                {t("builds.mine.empty_hero", { hero: picked?.name ?? t("builds.mine.unknown_hero") })}
                {#snippet action()}
                    {@render newBuild(id)}
                {/snippet}
            </EmptyState>
        {:else if groups.length === 0}
            <EmptyState>{t("builds.mine.empty")}</EmptyState>
        {:else}
            {#each groups as group (group.heroId)}
                {@const hero = group.heroId === null ? undefined : heroes[group.heroId]}
                <div class="flex flex-col gap-2">
                    <div class="flex items-center gap-2">
                        <h3 class="flex items-center gap-2 text-sm font-semibold">
                            {#if group.heroId === null}
                                <span
                                    class="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground"
                                >
                                    <Clock class="size-4" aria-hidden="true" />
                                </span>
                                {t("builds.mine.group_new")}
                            {:else}
                                {@render portrait(hero)}
                                {hero?.name ?? t("builds.mine.unknown_hero")}
                            {/if}
                        </h3>
                        {#if group.heroId !== null}
                            <span class="ml-auto">{@render newBuild(group.heroId)}</span>
                        {/if}
                    </div>
                    <ul class="grid grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] gap-3">
                        {#each group.rows as row (row.key)}
                            <li>
                                <OwnCard
                                    {row}
                                    winRate={row.published && row.buildId !== null
                                        ? store.winRates.get(row.buildId)
                                        : undefined}
                                    resolve={store.resolveItem}
                                    busy={store.busy}
                                    oncopy={() =>
                                        void run(
                                            () => store.copy(row, t("builds.mine.copy_name", { name: row.name })),
                                            t("builds.mine.copied"),
                                        )}
                                    ondelete={() => askDelete(row)}
                                    onfavourite={() =>
                                        void run(
                                            () => store.toggleFavourite(row),
                                            row.favorited ? t("builds.mine.unfavourited") : t("builds.mine.favourited"),
                                        )}
                                    oncancel={() => void cancelQueued(row)}
                                    ondiscard={() => askDiscard(row)}
                                />
                            </li>
                        {/each}
                    </ul>
                </div>
            {/each}
        {/if}
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
