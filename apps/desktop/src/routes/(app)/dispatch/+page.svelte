<script lang="ts">
    import { onMount, tick, untrack } from "svelte";
    import { toast } from "svelte-sonner";
    import { ArrowLeft, LoaderCircle, RotateCcw, Share2 } from "@lucide/svelte";

    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import { failureText } from "$lib/core/errors";
    import { formatDate, t, tn } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import type { Edition } from "@deadlock-plus/stats/dispatch/types";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import { withParam } from "$lib/features/builds/build-list";
    import { dispatch } from "$lib/features/dispatch/dispatch.svelte";
    import { copyContext } from "$lib/features/dispatch/copy-chain";
    import { editionView } from "$lib/features/dispatch/edition-view";
    import ExportPanel from "$lib/features/dispatch/components/export-panel.svelte";
    import ReadingRoom from "$lib/features/dispatch/components/reading-room.svelte";
    import Table from "$lib/features/dispatch/components/table.svelte";
    import { tableCopies, tablePiles } from "$lib/features/dispatch/components/table";
    import VideoPanel from "$lib/features/dispatch/video/video-panel.svelte";
    import { dispatchViewDeps } from "$lib/features/dispatch/components/view-deps";
    import { miniCover, type MiniCopy } from "$lib/features/dispatch/kinds/minis";
    import { firstPaper } from "$lib/features/dispatch/page-state";
    import { escapeLeavesRoom, roomCopy, tableFocus, tableMode } from "$lib/features/dispatch/room";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import { loadApiRanks, loadRankTiers } from "$lib/features/ranks/ranks";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";

    const PARAM = "edition";

    let heroes = $state.raw<Record<number, Hero>>({});
    let ranks = $state.raw<RankTier[]>([]);
    /** The tiers with the game's own badge art, for the covers on the table. */
    let tiers = $state.raw<RankTier[]>([]);
    let opened = $state.raw<Edition | null>(null);
    let openFailed = $state<string | null>(null);
    let exporting = $state(false);
    let printing = $state(false);
    /** The edition whose arrival plays: an issue still unseen when the room opened it. */
    let revealId = $state<string | null>(null);
    /** The edition `revealId` was last decided for; the object waits for it so it never mounts at rest first. */
    let decidedFor = $state<string | null>(null);
    let replays = $state(0);
    /** The copy last picked up from the table, and where its cover lay. */
    let pickup = $state.raw<{ id: string; rect: DOMRect } | null>(null);
    let bundle = $state<string | null>(null);
    /** Older issues read from kv for their covers; the newest of each kind comes with the shelf. */
    let read = $state.raw<Record<string, Edition>>({});
    const reading = new Set<string>();
    let tableEl = $state<HTMLElement | null>(null);

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
    const query = $derived(page.url.searchParams.get(PARAM));
    const latest = $derived(Object.values(dispatch.latest).filter((e): e is Edition => e !== null));
    const soFarId = $derived(dispatch.soFar?.id ?? null);
    const issued = $derived(
        Object.values(dispatch.shelf)
            .flat()
            .filter((e) => e.status === "issued")
            .map((e) => e.window.id)
            .concat(latest.map((e) => e.id)),
    );
    const room = $derived(dispatch.status === "ready" ? roomCopy({ query, issued, soFar: soFarId }) : null);
    const editionId = $derived(room?.kind === "edition" ? room.id : null);

    const copies = $derived(
        tableCopies(
            dispatch.shelf,
            dispatch.soFar
                ? { id: dispatch.soFar.id, window: dispatch.soFar.window, matches: dispatch.soFarMatches }
                : null,
            dispatch.unseenIds,
        ),
    );
    const piles = $derived(tablePiles(copies));
    const count = $derived(
        (copies.soFar ? 1 : 0) + copies.weekly.length + copies.monthly.length + copies.specials.length,
    );
    const anyIssued = $derived(soFarId !== null || issued.length > 0);
    const mode = $derived(
        tableMode({ accountLoaded: steamAccount.loaded, accountId, status: dispatch.status, copies: count }),
    );

    const shown = $derived(
        room?.kind === "so_far"
            ? dispatch.soFar
            : opened?.id === editionId
              ? opened
              : (latest.find((e) => e.id === editionId) ?? null),
    );
    const deps = $derived(dispatchViewDeps(heroes, ranks));
    const known = $derived.by(() => {
        const out: Record<string, Edition> = { ...read };
        for (const e of latest) out[e.id] = e;
        if (dispatch.soFar) out[dispatch.soFar.id] = dispatch.soFar;
        if (opened) out[opened.id] = opened;
        return out;
    });
    const view = $derived(shown ? editionView(shown, deps, copyContext(shown, dispatch.shelf, known)) : null);
    const covers = $derived.by(() => {
        if (Object.keys(heroes).length === 0) return {};
        const coverDeps = { hero: (id: number) => heroes[id], tiers, t };
        return Object.fromEntries(
            Object.values(known).map((e) => [
                e.id,
                miniCover(e, editionView(e, deps, copyContext(e, dispatch.shelf, known)), coverDeps),
            ]),
        );
    });
    /** Issued copies whose cover is in view: the tops of the piles, the specials and a dealt-out bundle. */
    const inView = $derived.by(() => {
        const dealt = [...piles.weekly, ...piles.monthlyYears].find((b) => b.key === bundle)?.copies ?? [];
        return [piles.topWeekly, piles.topMonthly, ...piles.specials, ...dealt].filter(
            (c): c is MiniCopy => c !== null && c.state === "issued",
        );
    });

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const first = $derived(firstPaper(Math.floor(Date.now() / 1000), tz, dispatch.soFarMatches));

    onMount(() => {
        void loadHeroes().then((h) => (heroes = h));
        void loadApiRanks().then((r) => (ranks = r));
        void loadRankTiers().then((r) => (tiers = r));
        return onHeroesRefreshed((h) => (heroes = h));
    });

    $effect(() => {
        const id = editionId;
        openFailed = null;
        // Read before `open` marks it seen, and only here: a reload or a later visit finds it seen and shows it at rest.
        revealId = id !== null && untrack(() => dispatch.unseenIds.includes(id)) ? id : null;
        decidedFor = id;
        if (id === null) return;
        let live = true;
        const fromLatest = () => untrack(() => latest.some((e) => e.id === id));
        void dispatch
            .open(id)
            .then((edition) => {
                if (!live) return;
                if (edition) opened = edition;
                else if (!fromLatest()) openFailed = id;
            })
            .catch(() => {
                if (live && !fromLatest()) openFailed = id;
            });
        return () => (live = false);
    });

    // Reading an edition marks it seen: an unseen one keeps its NEW and its sealed cover until it is picked up.
    $effect(() => {
        if (dispatch.status !== "ready") return;
        const unseen = dispatch.unseenIds;
        for (const c of inView) {
            if (c.id in untrack(() => known) || reading.has(c.id) || unseen.includes(c.id)) continue;
            reading.add(c.id);
            void dispatch
                .open(c.id)
                .then((e) => {
                    if (e) read = { ...read, [e.id]: e };
                })
                .catch(() => {});
        }
    });

    function navigate(id: string | null) {
        const params = withParam(page.url.searchParams, PARAM, id).toString();
        return goto(params ? `${page.url.pathname}?${params}` : page.url.pathname, {
            replaceState: id === null,
            keepFocus: true,
            noScroll: true,
        });
    }

    function pick(copy: MiniCopy, rect: DOMRect) {
        pickup = { id: copy.id, rect };
        void navigate(copy.id);
    }

    async function print(copy: MiniCopy, rect: DOMRect) {
        if (printing) return;
        printing = true;
        try {
            const edition = await dispatch.print(copy.window);
            if (edition) {
                pickup = { id: edition.id, rect };
                void navigate(edition.id);
            } else toast.error(t("dispatch.shelf.print_not_enough"));
        } catch (e) {
            toast.error(failureText(e, t("dispatch.shelf.print_failed")));
        } finally {
            printing = false;
        }
    }

    /** Puts the copy back; focus returns to it, or to the bundle it lies in. */
    async function closeRoom() {
        const id = room?.id ?? null;
        await navigate(null);
        await tick();
        const target = id
            ? tableFocus(piles, id)
                  .map((sel) => tableEl?.querySelector<HTMLElement>(sel))
                  .find((el) => el)
            : null;
        (target ?? tableEl?.querySelector<HTMLElement>("[data-copy]"))?.focus({ preventScroll: true });
    }

    function onkeydown(e: KeyboardEvent) {
        if (e.key !== "Escape") return;
        const dialog = exporting || (e.target instanceof Element && e.target.closest("[role=dialog]") !== null);
        // An object that closes itself on Escape marks the event handled, maybe after this listener: look once it is done.
        setTimeout(() => {
            if (escapeLeavesRoom(e, { room: room !== null, dialog })) void closeRoom();
        });
    }

    function replay() {
        if (editionId === null) return;
        revealId = editionId;
        replays++;
    }
</script>

{#snippet firstPaperNote()}
    {tn("dispatch.empty.first_paper", first.needed, {
        date: formatDate(first.dateS * 1000, { weekday: "long", month: "long", day: "numeric" }),
    })}
{/snippet}

<svelte:window {onkeydown} />

{#if mode === "table"}
    <div class="desk">
        <div class="table-room" class:away={room !== null} inert={room !== null} bind:this={tableEl}>
            <header class="flex flex-none items-start justify-between gap-4">
                <div>
                    <h1 class="text-2xl">{t("dispatch.page.title")}</h1>
                    <p class="mt-1 text-sm text-muted-foreground">
                        {#if anyIssued}{t("dispatch.page.subtitle")}{:else}{@render firstPaperNote()}{/if}
                    </p>
                </div>
                {#if printing}
                    <p class="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                        <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
                        {t("dispatch.shelf.printing")}
                    </p>
                {/if}
            </header>
            <div class="table-body">
                <Table {copies} {covers} bind:open={bundle} onpick={pick} onprint={print} />
            </div>
        </div>

        {#if room !== null}
            <ReadingRoom
                edition={shown && (room.kind === "so_far" || decidedFor === shown.id) ? shown : null}
                {view}
                from={pickup?.id === room.id ? pickup.rect : null}
                reveal={room.kind === "edition" && revealId === room.id}
                {replays}
                onrevealed={() => (revealId = null)}
            >
                {#snippet lead()}
                    <Button variant="outline" size="sm" onclick={closeRoom}>
                        <ArrowLeft aria-hidden="true" />{t("dispatch.page.table")}
                    </Button>
                {/snippet}
                {#snippet actions()}
                    {#if room?.kind === "edition"}
                        <IconButton
                            label={t("dispatch.page.replay")}
                            tooltip
                            variant="outline"
                            class="size-8"
                            disabled={!view}
                            onclick={replay}
                        >
                            <RotateCcw aria-hidden="true" />
                        </IconButton>
                    {/if}
                    <Button variant="outline" size="sm" disabled={!view} onclick={() => (exporting = true)}>
                        <Share2 aria-hidden="true" />
                        {t("dispatch.page.export")}
                    </Button>
                {/snippet}
                {#snippet status()}
                    {#if openFailed !== null}
                        <p class="text-sm text-muted-foreground" role="alert">{t("dispatch.page.open_failed")}</p>
                    {:else}
                        <p class="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                            <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
                            {t("dispatch.page.loading")}
                        </p>
                    {/if}
                {/snippet}
            </ReadingRoom>
        {/if}
    </div>
{:else}
    <Page>
        <PageHeader title={t("dispatch.page.title")} subtitle={t("dispatch.page.subtitle")} />
        {#if mode === "no_account"}
            <EmptyState size="base" spacing="xl">{t("dispatch.empty.no_account")}</EmptyState>
        {:else if mode === "offline"}
            <EmptyState size="base" spacing="xl" tone="destructive" role="alert">
                {t("dispatch.empty.offline")}
            </EmptyState>
        {:else if mode === "first_paper"}
            <EmptyState size="base" spacing="xl">{@render firstPaperNote()}</EmptyState>
        {:else}
            <EmptyState size="base" spacing="xl" role="status" class="flex items-center justify-center gap-2">
                <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
                {t("dispatch.page.loading")}
            </EmptyState>
        {/if}
    </Page>
{/if}

{#if view && shown}
    <Dialog.Root bind:open={exporting}>
        <Dialog.Content class="max-w-5xl overflow-y-auto">
            <Dialog.Title>{t("dispatch.page.export")}</Dialog.Title>
            <ExportPanel edition={shown} {view} />
            <VideoPanel {view} />
        </Dialog.Content>
    </Dialog.Root>
{/if}

<style>
    .desk {
        position: relative;
        height: 100%;
        min-height: 0;
        overflow: hidden;
    }

    .table-room {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 18px 28px 26px;
        transition:
            opacity 260ms,
            transform 260ms;
    }

    /* Leaving for the room, the table falls away under the copy that was picked up. */
    .table-room.away {
        opacity: 0;
        transform: scale(1.04);
        pointer-events: none;
    }

    .table-body {
        flex: 1;
        min-height: 0;
    }

    @media (prefers-reduced-motion: reduce) {
        .table-room {
            transition: none;
        }
    }
</style>
