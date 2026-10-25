import { untrack } from "svelte";
import { kvGet, kvSet } from "$lib/core/kv";
import { settings } from "$lib/features/settings/settings.svelte";
import { stats } from "$lib/features/stats/stats.svelte";
import { steamAccount } from "$lib/features/steam-account/account.svelte";
import type { Edition, EditionWindow } from "@deadlock-plus/stats/dispatch/types";
import { notifyDispatchEdition } from "./api";
import { defaultEnrichDeps, enrichEdition } from "./enrich";
import { alertWhen, createDispatchService, type DispatchHistory, type DispatchView, type ShelfEntry } from "./service";

export type { ShelfEntry, ShelfStatus } from "./service";

const STORE = "stats-cache";
const HOUR_MS = 60 * 60 * 1000;

const currentAccount = () => steamAccount.account?.steamId32 ?? null;

/** `stats.load` returns at once while another load runs, so wait for that one to land. */
function statsSettled(): Promise<void> {
    return new Promise((resolve) => {
        const stop = $effect.root(() => {
            $effect(() => {
                if (stats.status === "loading") return;
                resolve();
                queueMicrotask(() => stop());
            });
        });
    });
}

async function history(accountId: number): Promise<DispatchHistory> {
    await stats.load(accountId);
    if (stats.status === "loading") await statsSettled();
    if (stats.status !== "ready") throw new Error(stats.error ?? "match history unavailable");
    return { matches: stats.matches, live: stats.cachedAt === null };
}

const service = createDispatchService({
    nowS: () => Math.floor(Date.now() / 1000),
    tz: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    accountId: currentAccount,
    history,
    kv: { get: (key) => kvGet(STORE, key), set: (key, value) => kvSet(STORE, key, value) },
    enrich: (window, accountId, candidates) => enrichEdition(window, accountId, candidates, defaultEnrichDeps()),
    notify: alertWhen(
        () => settings.dispatchAlerts,
        (kind) => notifyDispatchEdition(kind),
    ),
});

export type DispatchStatus = "idle" | "loading" | "ready" | "error";

class DispatchStore {
    status = $state<DispatchStatus>("idle");
    /** Newest issued edition of each kind (frozen), loaded from kv. */
    latest = $state.raw<{ weekly: Edition | null; monthly: Edition | null }>({ weekly: null, monthly: null });
    /** "This week so far": rows only, no API calls; null under MIN_EDITION_MATCHES. */
    soFar = $state.raw<Edition | null>(null);
    soFarMatches = $state(0);
    /** Closed windows newest first, back to the first history row. */
    shelf = $state.raw<{ weekly: ShelfEntry[]; monthly: ShelfEntry[] }>({ weekly: [], monthly: [] });
    /** Automatic issues not opened yet (nav badge). */
    unseen = $state(0);
    private shownFor: number | null = null;
    private generation = 0;

    /** Started once from SERVICES (main window only). Issues due editions on start, on window focus and hourly. */
    start(): () => void {
        const sync = () => void this.sync();
        const stopEffects = $effect.root(() => {
            $effect(() => {
                const accountId = currentAccount();
                // New games keep "this week so far" current.
                void stats.matches;
                untrack(() => {
                    if (accountId !== null) sync();
                });
            });
        });
        window.addEventListener("focus", sync);
        const timer = setInterval(sync, HOUR_MS);
        return () => {
            stopEffects();
            window.removeEventListener("focus", sync);
            clearInterval(timer);
        };
    }

    /** A frozen edition from kv; marks it seen. */
    async open(editionId: string): Promise<Edition | null> {
        const edition = await service.open(editionId);
        if (edition) await this.refresh(this.generation).catch(() => {});
        return edition;
    }

    /** Builds, enriches and freezes a past window on request. Returns null under MIN_EDITION_MATCHES. */
    async print(window: EditionWindow): Promise<Edition | null> {
        const edition = await service.print(window);
        if (edition) await this.refresh(this.generation).catch(() => {});
        return edition;
    }

    private async sync() {
        const accountId = currentAccount();
        if (accountId === null) return;
        const run = ++this.generation;
        if (this.shownFor !== accountId) {
            this.apply(null);
            this.status = "loading";
        }
        try {
            await service.issueDue();
            await this.refresh(run);
        } catch {
            if (run === this.generation && this.shownFor !== accountId) this.status = "error";
        }
    }

    private async refresh(run: number) {
        const accountId = currentAccount();
        const view = await service.view();
        if (run !== this.generation || accountId !== currentAccount()) return;
        this.apply(view);
        this.shownFor = view ? accountId : null;
        this.status = view ? "ready" : "idle";
    }

    private apply(view: DispatchView | null) {
        this.latest = view?.latest ?? { weekly: null, monthly: null };
        this.soFar = view?.soFar ?? null;
        this.soFarMatches = view?.soFarMatches ?? 0;
        this.shelf = view?.shelf ?? { weekly: [], monthly: [] };
        this.unseen = view?.unseen ?? 0;
    }
}

export const dispatch = new DispatchStore();
