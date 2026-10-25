<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { toast } from "svelte-sonner";
    import { BookOpen, LoaderCircle, Share2 } from "@lucide/svelte";

    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import { failureText } from "$lib/core/errors";
    import { formatDate, t, tn } from "$lib/core/i18n.svelte";
    import { kvGet } from "$lib/core/kv";
    import Button from "@deadlock-plus/ui/button.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import { indexKey, parseIndex } from "@deadlock-plus/stats/dispatch/archive";
    import type { Edition, EditionWindow } from "@deadlock-plus/stats/dispatch/types";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import { withParam } from "$lib/features/builds/build-list";
    import { dispatch } from "$lib/features/dispatch/dispatch.svelte";
    import { DISPATCH_PAPER, editionView } from "$lib/features/dispatch/edition-view";
    import EditionPaper from "$lib/features/dispatch/components/edition-paper.svelte";
    import ExportPanel from "$lib/features/dispatch/components/export-panel.svelte";
    import Shelf from "$lib/features/dispatch/components/shelf.svelte";
    import StoryMode from "$lib/features/dispatch/components/story-mode.svelte";
    import { dispatchViewDeps } from "$lib/features/dispatch/components/view-deps";
    import {
        firstPaper,
        pageMode,
        pinFor,
        selectEdition,
        switchOptions,
        switchTarget,
        switchValue,
        unseenIds,
        type SwitchKind,
    } from "$lib/features/dispatch/page-state";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import Segmented from "$lib/features/match-history/components/list/segmented.svelte";
    import { loadApiRanks } from "$lib/features/ranks/ranks";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";

    const PARAM = "edition";
    const TABLE_PAD = 40;
    const PAPER_ANGLE = -0.8;

    let heroes = $state.raw<Record<number, Hero>>({});
    let ranks = $state.raw<RankTier[]>([]);
    let unseen = $state.raw<string[] | null>(null);
    let opened = $state.raw<Edition | null>(null);
    let openFailed = $state<string | null>(null);
    let story = $state(false);
    let exporting = $state(false);
    let tableW = $state(0);

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
    const query = $derived(page.url.searchParams.get(PARAM));
    const latestIds = $derived({
        weekly: dispatch.latest.weekly?.id ?? null,
        monthly: dispatch.latest.monthly?.id ?? null,
    });
    const soFarId = $derived(dispatch.soFar?.id ?? null);
    const issued = $derived(
        [...dispatch.shelf.weekly, ...dispatch.shelf.monthly]
            .filter((e) => e.status === "issued")
            .map((e) => e.window.id)
            .concat([latestIds.weekly, latestIds.monthly].filter((id): id is string => id !== null)),
    );
    const selection = $derived(selectEdition({ query, issued, unseen, latest: latestIds, soFar: soFarId }));
    const mode = $derived(
        pageMode({ accountLoaded: steamAccount.loaded, accountId, status: dispatch.status, selection }),
    );
    const selectedId = $derived(selection.kind === "edition" ? selection.id : null);
    const pin = $derived(mode === "paper" ? pinFor(query, selection) : null);

    const fromLatest = $derived(
        [dispatch.latest.weekly, dispatch.latest.monthly].find((e) => e !== null && e.id === selectedId) ?? null,
    );
    const shown = $derived(
        selection.kind === "so_far" ? dispatch.soFar : opened?.id === selectedId ? opened : fromLatest,
    );
    const deps = $derived(dispatchViewDeps(heroes, ranks));
    const view = $derived(shown ? editionView(shown, deps) : null);

    const options = $derived(switchOptions(latestIds, soFarId));
    const switchItems = $derived(options.map((value) => ({ value, label: t(`dispatch.page.switch_${value}`) })));
    const current = $derived(switchValue(selection));
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const first = $derived(firstPaper(Math.floor(Date.now() / 1000), tz, dispatch.soFarMatches));
    const hasShelf = $derived(dispatch.shelf.weekly.length + dispatch.shelf.monthly.length > 0);
    const scale = $derived(
        tableW > 0 ? Math.max(0.1, Math.min(1, (tableW - TABLE_PAD * 2) / DISPATCH_PAPER.width)) : 0,
    );

    onMount(() => {
        void loadHeroes().then((h) => (heroes = h));
        void loadApiRanks().then((r) => (ranks = r));
        return onHeroesRefreshed((h) => (heroes = h));
    });

    // The store keeps only the unseen count; the index says which ones, and is read again whenever that count moves.
    $effect(() => {
        const id = accountId;
        const ready = dispatch.status === "ready";
        void dispatch.unseen;
        unseen = null;
        if (id === null || !ready) return;
        let live = true;
        void kvGet("stats-cache", indexKey(id))
            .then((raw) => unseenIds(parseIndex(raw)))
            .catch((): string[] => [])
            .then((ids) => {
                if (live) unseen = ids;
            });
        return () => (live = false);
    });

    $effect(() => {
        const id = selectedId;
        openFailed = null;
        if (id === null) return;
        let live = true;
        void dispatch
            .open(id)
            .then((edition) => {
                if (!live) return;
                if (edition) opened = edition;
                else if (untrack(() => fromLatest) === null) openFailed = id;
            })
            .catch(() => {
                if (live && untrack(() => fromLatest) === null) openFailed = id;
            });
        return () => (live = false);
    });

    $effect(() => {
        if (pin !== null) navigate(pin, true);
    });

    function navigate(id: string, replace = false) {
        const params = withParam(page.url.searchParams, PARAM, id).toString();
        void goto(`${page.url.pathname}?${params}`, { replaceState: replace, keepFocus: true, noScroll: true });
    }

    function pickKind(kind: SwitchKind) {
        const id = switchTarget(kind, latestIds, soFarId);
        if (id !== null) navigate(id);
    }

    async function print(window: EditionWindow) {
        try {
            const edition = await dispatch.print(window);
            if (edition) navigate(edition.id);
            else toast.error(t("dispatch.shelf.print_not_enough"));
        } catch (e) {
            toast.error(failureText(e, t("dispatch.shelf.print_failed")));
        }
    }

    const windowLabel = (w: EditionWindow) =>
        w.kind === "monthly" ? deps.month(w.startS, w.tz) : deps.dayRange(w.startS, w.endS - 1, w.tz);
</script>

<Page>
    <PageHeader title={t("dispatch.page.title")} subtitle={t("dispatch.page.subtitle")} />

    {#if mode === "paper"}
        <div class="flex flex-wrap items-center justify-between gap-3">
            {#if options.length > 1 && current !== null}
                <Segmented
                    label={t("dispatch.page.switch")}
                    options={switchItems}
                    value={current}
                    onselect={pickKind}
                />
            {:else}
                <span></span>
            {/if}
            <div class="flex items-center gap-2">
                <Button variant="outline" disabled={!view} onclick={() => (story = true)}>
                    <BookOpen aria-hidden="true" />
                    {t("dispatch.page.read_story")}
                </Button>
                <Button
                    variant="toggle"
                    aria-pressed={exporting}
                    disabled={!view}
                    onclick={() => (exporting = !exporting)}
                >
                    <Share2 aria-hidden="true" />
                    {t("dispatch.page.export")}
                </Button>
            </div>
        </div>

        {#if exporting && view}
            <ExportPanel {view} />
        {:else}
            <div class="table" bind:clientWidth={tableW} style="padding: {TABLE_PAD}px;">
                {#if view && scale > 0}
                    <div
                        class="spot"
                        style="width: {DISPATCH_PAPER.width * scale}px; height: {DISPATCH_PAPER.height * scale}px;"
                    >
                        <div class="sheet" style="transform: scale({scale});">
                            <EditionPaper {view} angle={PAPER_ANGLE} />
                        </div>
                    </div>
                {:else if openFailed !== null}
                    <p class="text-sm text-muted-foreground" role="alert">{t("dispatch.page.open_failed")}</p>
                {:else}
                    <p class="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                        <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
                        {t("dispatch.page.loading")}
                    </p>
                {/if}
            </div>
        {/if}
    {:else if mode === "no_account"}
        <EmptyState size="base" spacing="xl">{t("dispatch.empty.no_account")}</EmptyState>
    {:else if mode === "offline"}
        <EmptyState size="base" spacing="xl" tone="destructive" role="alert">{t("dispatch.empty.offline")}</EmptyState>
    {:else if mode === "first_paper"}
        <EmptyState size="base" spacing="xl">
            {tn("dispatch.empty.first_paper", first.needed, {
                date: formatDate(first.dateS * 1000, { weekday: "long", month: "long", day: "numeric" }),
            })}
        </EmptyState>
    {:else}
        <EmptyState size="base" spacing="xl" role="status" class="flex items-center justify-center gap-2">
            <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
            {t("dispatch.page.loading")}
        </EmptyState>
    {/if}

    {#if hasShelf && (mode === "paper" || mode === "first_paper")}
        <section class="mt-4 border-t border-border pt-8" aria-label={t("dispatch.shelf.title")}>
            <Shelf
                shelf={dispatch.shelf}
                selected={selectedId}
                unseen={unseen ?? []}
                label={windowLabel}
                onopen={(id) => navigate(id)}
                onprint={print}
            />
        </section>
    {/if}
</Page>

{#if story && view}
    <StoryMode {view} onclose={() => (story = false)} />
{/if}

<style>
    .table {
        display: flex;
        justify-content: center;
        border-radius: 10px;
        background:
            radial-gradient(ellipse at 50% 35%, transparent 25%, rgb(0 0 0 / 0.35) 100%),
            color-mix(in oklch, var(--background) 45%, rgb(38 30 22));
        box-shadow: inset 0 1px 3px rgb(0 0 0 / 0.45);
    }

    .spot {
        position: relative;
        flex: none;
    }

    .sheet {
        position: absolute;
        top: 0;
        left: 0;
        transform-origin: 0 0;
    }
</style>
