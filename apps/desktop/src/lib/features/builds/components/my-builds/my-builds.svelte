<script lang="ts">
    import { CircleHelp, Clock, TriangleAlert } from "@lucide/svelte";
    import { toast } from "svelte-sonner";

    import { failureText } from "$lib/core/errors";
    import { t, tn } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import ConfirmDialog from "$lib/components/confirm-dialog.svelte";
    import { MyBuildsStore, type ActionOutcome } from "$lib/features/builds/my-builds.svelte";
    import { noDrafts, waitingCount, type DraftSource, type MineRow } from "$lib/features/builds/my-builds";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import type { ResolveChoice } from "@deadlock-plus/ipc-types/ResolveChoice";
    import BuildRow from "./build-row.svelte";
    import ConflictDialog from "./conflict-dialog.svelte";

    let { drafts = noDrafts }: { drafts?: DraftSource } = $props();

    // svelte-ignore state_referenced_locally
    const store = new MyBuildsStore(drafts);
    let heroes = $state<Record<number, Hero>>({});
    let deleting = $state<MineRow | null>(null);
    let confirmOpen = $state(false);

    const heroIds = $derived(store.groups.flatMap((g) => (g.heroId === null ? [] : [g.heroId])));
    const waiting = $derived(waitingCount(store.queue));
    const conflict = $derived(store.conflicts[0] ?? null);

    $effect(() => store.start());
    $effect(() => onHeroesRefreshed((fresh) => (heroes = fresh)));
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

    async function resolve(choice: ResolveChoice) {
        if (conflict) await store.resolve(conflict, choice);
    }
</script>

<section class="flex flex-col gap-4" aria-label={t("builds.mine.title")}>
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
    {:else}
        {#if store.publishedFailed}
            <p class="flex items-center gap-2 text-xs text-muted-foreground">
                <TriangleAlert class="size-3.5 shrink-0 text-warning" aria-hidden="true" />
                {t("builds.mine.published_failed")}
            </p>
        {/if}
        {#if store.groups.length === 0}
            <EmptyState>{t("builds.mine.empty")}</EmptyState>
        {:else}
            {#each store.groups as group (group.heroId)}
                {@const hero = group.heroId === null ? undefined : heroes[group.heroId]}
                <div class="flex flex-col gap-2">
                    <h3 class="flex items-center gap-2 text-sm font-semibold">
                        {#if group.heroId === null}
                            <span
                                class="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground"
                            >
                                <Clock class="size-4" aria-hidden="true" />
                            </span>
                            {t("builds.mine.group_new")}
                        {:else}
                            <span
                                class="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
                            >
                                {#if hero?.icon}
                                    <img src={hero.icon} alt="" class="size-full object-cover" />
                                {:else}
                                    <CircleHelp class="size-4 text-muted-foreground" aria-hidden="true" />
                                {/if}
                            </span>
                            {hero?.name ?? t("builds.mine.unknown_hero")}
                        {/if}
                    </h3>
                    <ul class="flex flex-col gap-1.5">
                        {#each group.rows as row (row.key)}
                            <BuildRow
                                {row}
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
                            />
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

<ConflictDialog {conflict} busy={store.busy} onresolve={(choice) => void resolve(choice)} />
