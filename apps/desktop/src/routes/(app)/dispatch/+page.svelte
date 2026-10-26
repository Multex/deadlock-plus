<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { toast } from "svelte-sonner";
    import { BookOpen, LoaderCircle, Share2 } from "@lucide/svelte";

    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import { failureText } from "$lib/core/errors";
    import { formatDate, i18n, t, tn } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import type { Edition, EditionWindow } from "@deadlock-plus/stats/dispatch/types";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import { withParam } from "$lib/features/builds/build-list";
    import { dispatch } from "$lib/features/dispatch/dispatch.svelte";
    import { DISPATCH_PAPER, editionView } from "$lib/features/dispatch/edition-view";
    import { fitScale, rotatedBox } from "$lib/features/dispatch/fit";
    import EditionObject from "$lib/features/dispatch/components/edition-object.svelte";
    import ExportPanel from "$lib/features/dispatch/components/export-panel.svelte";
    import Shelf from "$lib/features/dispatch/components/shelf.svelte";
    import StoryMode from "$lib/features/dispatch/components/story-mode.svelte";
    import { dispatchViewDeps } from "$lib/features/dispatch/components/view-deps";
    import { firstPaper, pageMode, pinFor, selectEdition, standGroups } from "$lib/features/dispatch/page-state";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import { loadApiRanks } from "$lib/features/ranks/ranks";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";

    const PARAM = "edition";
    const PAPER_ANGLE = -0.8;
    /** Room around the paper for its drop shadow. */
    const PAPER_PAD = 22;
    /** The stand takes whatever the paper, scaled to the window's height, leaves; within these bounds. */
    const STAND_MIN = 400;
    const STAND_MAX = 1000;

    let heroes = $state.raw<Record<number, Hero>>({});
    let ranks = $state.raw<RankTier[]>([]);
    let opened = $state.raw<Edition | null>(null);
    let openFailed = $state<string | null>(null);
    let story = $state(false);
    let exporting = $state(false);
    let rowW = $state(0);
    let stageW = $state(0);
    let stageH = $state(0);

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
    const query = $derived(page.url.searchParams.get(PARAM));
    const latestIds = $derived({
        weekly: dispatch.latest.weekly?.id ?? null,
        monthly: dispatch.latest.monthly?.id ?? null,
    });
    const soFarId = $derived(dispatch.soFar?.id ?? null);
    const issued = $derived(
        Object.values(dispatch.shelf)
            .flat()
            .filter((e) => e.status === "issued")
            .map((e) => e.window.id)
            .concat([latestIds.weekly, latestIds.monthly].filter((id): id is string => id !== null)),
    );
    const unseen = $derived(dispatch.status === "ready" ? dispatch.unseenIds : null);
    const selection = $derived(selectEdition({ query, issued, unseen, latest: latestIds, soFar: soFarId }));
    const mode = $derived(
        pageMode({ accountLoaded: steamAccount.loaded, accountId, status: dispatch.status, selection }),
    );
    const selectedId = $derived(selection.kind === "edition" ? selection.id : null);
    const shownId = $derived(selection.kind === "edition" || selection.kind === "so_far" ? selection.id : null);
    const pin = $derived(mode === "paper" ? pinFor(query, selection) : null);

    const fromLatest = $derived(
        [dispatch.latest.weekly, dispatch.latest.monthly].find((e) => e !== null && e.id === selectedId) ?? null,
    );
    const shown = $derived(
        selection.kind === "so_far" ? dispatch.soFar : opened?.id === selectedId ? opened : fromLatest,
    );
    const deps = $derived(dispatchViewDeps(heroes, ranks));
    const view = $derived(shown ? editionView(shown, deps) : null);

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const first = $derived(firstPaper(Math.floor(Date.now() / 1000), tz, dispatch.soFarMatches));
    const stand = $derived(
        standGroups(
            dispatch.shelf,
            dispatch.soFar ? { window: dispatch.soFar.window, matches: dispatch.soFarMatches } : null,
        ),
    );
    const newsstand = $derived(mode === "paper" || (mode === "first_paper" && stand.length > 0));
    const box = rotatedBox(DISPATCH_PAPER.width, DISPATCH_PAPER.height, PAPER_ANGLE);
    const standW = $derived.by(() => {
        const paper = fitScale(rowW - STAND_MIN, stageH, DISPATCH_PAPER, PAPER_ANGLE, PAPER_PAD);
        const room = rowW - box.w * paper - PAPER_PAD * 2;
        return Math.round(Math.min(STAND_MAX, Math.max(STAND_MIN, room)));
    });

    onMount(() => {
        void loadHeroes().then((h) => (heroes = h));
        void loadApiRanks().then((r) => (ranks = r));
        return onHeroesRefreshed((h) => (heroes = h));
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

    async function print(window: EditionWindow) {
        try {
            const edition = await dispatch.print(window);
            if (edition) navigate(edition.id);
            else toast.error(t("dispatch.shelf.print_not_enough"));
        } catch (e) {
            toast.error(failureText(e, t("dispatch.shelf.print_failed")));
        }
    }

    const dateIn = (s: number, tz: string, options: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(i18n.locale, { ...options, timeZone: tz }).format(s * 1000);

    const spineLabel = (w: EditionWindow) => {
        const kind: string = w.kind;
        if (kind === "weekly") return dateIn(w.startS, w.tz, { month: "short", day: "numeric" });
        if (kind === "monthly") return dateIn(w.startS, w.tz, { month: "short" });
        return dateIn(w.startS, w.tz, { year: "numeric" });
    };

    /** Pile keys are `2026` or `2026-09`, from `pileKeys`. */
    const pileLabel = (key: string) => {
        const [year, month] = key.split("-").map(Number);
        const s = Date.UTC(year, (month || 1) - 1, 1) / 1000;
        return dateIn(s, "UTC", month ? { month: "short", year: "numeric" } : { year: "numeric" });
    };

    const windowLabel = (w: EditionWindow) => {
        const kind: string = w.kind;
        if (kind === "monthly") return deps.month(w.startS, w.tz);
        if (kind === "year_end") return dateIn(w.startS, w.tz, { year: "numeric" });
        return deps.dayRange(w.startS, w.endS - 1, w.tz);
    };
</script>

{#snippet firstPaperNote()}
    {tn("dispatch.empty.first_paper", first.needed, {
        date: formatDate(first.dateS * 1000, { weekday: "long", month: "long", day: "numeric" }),
    })}
{/snippet}

{#if newsstand}
    <div class="flex h-full min-h-0" bind:clientWidth={rowW}>
        <div class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH}>
            {#if mode === "first_paper"}
                <EmptyState size="base">{@render firstPaperNote()}</EmptyState>
            {:else if view && shown && stageW > 0}
                <EditionObject edition={shown} {view} stage={{ width: stageW, height: stageH }} reveal={false} />
            {:else if openFailed !== null}
                <p class="text-sm text-muted-foreground" role="alert">{t("dispatch.page.open_failed")}</p>
            {:else}
                <p class="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                    <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
                    {t("dispatch.page.loading")}
                </p>
            {/if}
        </div>

        <aside class="flex flex-none flex-col gap-2 py-6 pr-8 pl-2" style="width: {standW}px;">
            <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between gap-3">
                    <h1 class="text-2xl">{t("dispatch.page.title")}</h1>
                    {#if mode === "paper"}
                        <div class="flex gap-2">
                            <Button variant="outline" size="sm" disabled={!view} onclick={() => (story = true)}>
                                <BookOpen aria-hidden="true" />
                                {t("dispatch.page.read_story")}
                            </Button>
                            <Button variant="outline" size="sm" disabled={!view} onclick={() => (exporting = true)}>
                                <Share2 aria-hidden="true" />
                                {t("dispatch.page.export")}
                            </Button>
                        </div>
                    {/if}
                </div>
                <p class="text-sm text-muted-foreground">{t("dispatch.page.subtitle")}</p>
            </div>
            {#if stand.length > 0}
                <Shelf
                    groups={stand}
                    selected={shownId}
                    unseen={unseen ?? []}
                    label={windowLabel}
                    spine={spineLabel}
                    {pileLabel}
                    onopen={(id) => navigate(id)}
                    onprint={print}
                />
            {/if}
        </aside>
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

{#if story && view}
    <StoryMode {view} onclose={() => (story = false)} />
{/if}

{#if view}
    <Dialog.Root bind:open={exporting}>
        <Dialog.Content class="max-w-5xl overflow-y-auto">
            <Dialog.Title>{t("dispatch.page.export")}</Dialog.Title>
            <ExportPanel {view} />
        </Dialog.Content>
    </Dialog.Root>
{/if}

<style>
    /* No table or card: the paper lies on the theme's backdrop, scaled to the room the window leaves it. */
    .stage {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
    }
</style>
