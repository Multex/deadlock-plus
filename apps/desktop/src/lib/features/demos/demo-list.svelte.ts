import { toast } from "svelte-sonner";

import {
    deleteDemos,
    fetchDemoMetadata,
    listDemos,
    listPinned,
    localAccountIds,
    openReplaysDir,
    previewDelete,
    revealDemo,
    setPinned,
} from "./api";
import {
    countByStatus,
    deleteCopy,
    unpinnedNames,
    type Demo,
    type DemoListing,
    type DeleteMode,
    type DeletePreview,
    type MetaResult,
} from "./demos";
import {
    META_CONCURRENCY,
    PAGE_SIZE,
    filterDemos,
    pageCount,
    pageSlice,
    pinnedCount,
    runPool,
    type DemoFilter,
} from "./list";
import { errorText, failureText } from "$lib/core/errors";
import { tn } from "$lib/core/i18n.svelte";
import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";

export class DemoList {
    listing = $state<DemoListing | null>(null);
    error = $state<string | null>(null);
    loading = $state(true);
    filter = $state<DemoFilter>("all");
    pinned = $state<Set<number>>(new Set());
    page = $state(0);
    heroes = $state<Record<number, Hero>>({});
    meta = $state<Record<number, MetaResult>>({});
    accountIds = $state<number[]>([]);
    selected = $state<Set<string>>(new Set());
    cleanupOpen = $state(false);
    deleteOpen = $state(false);
    deleteNames = $state<string[]>([]);
    preview = $state<DeletePreview | null>(null);
    deleteMode = $state<DeleteMode>("recycle");
    deleting = $state(false);

    private requested = new Set<number>();

    demos = $derived(this.listing?.demos ?? []);
    counts = $derived(countByStatus(this.demos));
    filtered = $derived(filterDemos(this.demos, this.filter, this.pinned));
    pinnedTotal = $derived(pinnedCount(this.demos, this.pinned));
    pages = $derived(pageCount(this.filtered.length, PAGE_SIZE));
    visible = $derived(pageSlice(this.filtered, this.page, PAGE_SIZE));
    copy = $derived(this.preview ? deleteCopy(this.preview) : null);
    selectable = $derived(this.visible.filter((d) => !this.pinned.has(d.matchId)));
    allVisibleSelected = $derived(
        this.selectable.length > 0 && this.selectable.every((d) => this.selected.has(d.fileName)),
    );

    constructor() {
        // Partial files are never in the API, so they are not requested.
        $effect(() => {
            const ids = this.visible
                .filter((d) => d.status !== "partial" && !this.requested.has(d.matchId))
                .map((d) => d.matchId);
            for (const id of ids) this.requested.add(id);
            void this.fetchMetadata(ids);
        });
    }

    init() {
        void this.load();
        void listPinned()
            .then((ids) => (this.pinned = new Set(ids)))
            .catch(() => {});
        void loadHeroes().then((h) => (this.heroes = h));
        $effect(() => onHeroesRefreshed((h) => (this.heroes = h)));
        void localAccountIds()
            .then((ids) => (this.accountIds = ids))
            .catch(() => {});
    }

    private fetchMetadata(ids: number[]) {
        return runPool(ids, META_CONCURRENCY, async (id) => {
            try {
                this.meta[id] = await fetchDemoMetadata(id);
            } catch (e) {
                this.meta[id] = { state: "error", message: errorText(e) };
            }
            if (this.meta[id].state === "error") this.requested.delete(id);
        });
    }

    load = async () => {
        this.loading = true;
        this.error = null;
        try {
            this.listing = await listDemos();
        } catch (e) {
            this.error = errorText(e);
        } finally {
            this.loading = false;
        }
    };

    toggle(name: string, on: boolean) {
        const next = new Set(this.selected);
        if (on) next.add(name);
        else next.delete(name);
        this.selected = next;
    }

    toggleVisible(on: boolean) {
        const next = new Set(this.selected);
        for (const d of this.selectable) {
            if (on) next.add(d.fileName);
            else next.delete(d.fileName);
        }
        this.selected = next;
    }

    async pin(d: Demo, on: boolean) {
        try {
            this.pinned = new Set(await setPinned(d.matchId, on));
            if (on) this.toggle(d.fileName, false);
        } catch (e) {
            toast.error(errorText(e));
        }
    }

    askDelete = async (names: string[]) => {
        try {
            this.preview = await previewDelete(names);
        } catch (e) {
            toast.error(errorText(e));
            return;
        }
        this.deleteNames = names;
        this.deleteMode = deleteCopy(this.preview).canRecycle ? "recycle" : "permanent";
        this.deleteOpen = true;
    };

    askDeleteSelected = () =>
        this.askDelete(
            unpinnedNames(
                this.demos.filter((d) => this.selected.has(d.fileName)),
                this.pinned,
            ),
        );

    confirmDelete = async () => {
        this.deleting = true;
        try {
            const report = await deleteDemos(this.deleteNames, this.deleteMode);
            const done = report.deleted.length;
            if (done > 0) toast.success(tn("demos.toast.deleted", done));
            if (report.failed.length > 0)
                toast.error(failureText(report.failed[0].error, tn("demos.toast.delete_failed", report.failed.length)));
            const gone = new Set(report.deleted);
            this.selected = new Set([...this.selected].filter((n) => !gone.has(n)));
        } catch (e) {
            toast.error(errorText(e));
        } finally {
            this.deleting = false;
            this.deleteOpen = false;
            await this.load();
        }
    };

    async reveal(d: Demo) {
        try {
            await revealDemo(d);
        } catch (e) {
            toast.error(errorText(e));
        }
    }

    openFolder = async () => {
        try {
            await openReplaysDir();
        } catch (e) {
            toast.error(errorText(e));
        }
    };

    setFilter(next: DemoFilter) {
        this.filter = next;
        this.page = 0;
    }
}
