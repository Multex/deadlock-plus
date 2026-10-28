import type { Announcement } from "@deadlock-plus/ipc-types/Announcement";
import { kvGet, kvSet } from "$lib/core/kv";
import { createPoller } from "$lib/core/poller";
import { connectivity } from "$lib/features/connectivity/online.svelte";
import { canDismiss, parseDismissed, pruneDismissed, shownAnnouncements } from "./announcements";
import { getAnnouncements } from "./api";

export const REFRESH_MS = 6 * 60 * 60 * 1000;
/** Keeps the first fetch clear of the burst of work every page does as the app opens. */
const STARTUP_DELAY_MS = 3000;
const IDLE_TIMEOUT_MS = 5000;

const STORE = "app-settings";
const KEY = "announcementsDismissed";

export interface AnnouncementDeps {
    fetch(): Promise<Announcement[]>;
    online(): boolean;
    load(): Promise<unknown>;
    save(ids: string[]): Promise<void>;
    /** Returns a cancel. */
    afterStartup(run: () => void): () => void;
    /** Returns a stop. */
    every(run: () => void, ms: number): () => void;
    /** Returns a stop. */
    onOnline(run: () => void): () => void;
}

export class Announcements {
    private feed = $state.raw<Announcement[]>([]);
    private dismissed = $state.raw<string[]>([]);
    private loaded: Promise<void> = Promise.resolve();
    private inFlight: Promise<void> | null = null;
    private missedWhileOffline = false;
    private readonly deps: AnnouncementDeps;

    constructor(deps: AnnouncementDeps) {
        this.deps = deps;
    }

    get shown(): Announcement[] {
        return shownAnnouncements(this.feed, this.dismissed);
    }

    start(): () => void {
        this.loaded = this.deps.load().then(
            (stored) => {
                this.dismissed = [...new Set([...parseDismissed(stored), ...this.dismissed])];
            },
            () => {},
        );
        const refresh = () => void this.refresh();
        const stops = [
            this.deps.afterStartup(refresh),
            this.deps.every(refresh, REFRESH_MS),
            this.deps.onOnline(() => {
                if (this.missedWhileOffline) refresh();
            }),
        ];
        return () => stops.forEach((stop) => stop());
    }

    /** Never rejects: a feed that cannot be fetched or verified leaves the banner as it was. */
    refresh(): Promise<void> {
        if (!this.deps.online()) {
            this.missedWhileOffline = true;
            return Promise.resolve();
        }
        this.missedWhileOffline = false;
        this.inFlight ??= this.fetchFeed().finally(() => (this.inFlight = null));
        return this.inFlight;
    }

    async dismiss(id: string): Promise<void> {
        const announcement = this.feed.find((a) => a.id === id);
        if (!announcement || !canDismiss(announcement) || this.dismissed.includes(id)) return;
        this.dismissed = [...this.dismissed, id];
        await this.save();
    }

    private async fetchFeed() {
        let feed: Announcement[];
        try {
            feed = await this.deps.fetch();
        } catch {
            return;
        }
        await this.loaded;
        this.feed = feed;
        const kept = pruneDismissed(this.dismissed, feed);
        if (kept.length === this.dismissed.length) return;
        this.dismissed = kept;
        await this.save();
    }

    private save(): Promise<void> {
        return this.deps.save(this.dismissed).catch(() => {});
    }
}

function afterStartupIdle(run: () => void): () => void {
    let idle: number | undefined;
    const timer = setTimeout(() => {
        if ("requestIdleCallback" in window) idle = requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
        else run();
    }, STARTUP_DELAY_MS);
    return () => {
        clearTimeout(timer);
        if (idle !== undefined) cancelIdleCallback(idle);
    };
}

export const announcements = new Announcements({
    fetch: getAnnouncements,
    online: () => connectivity.online,
    load: () => kvGet<unknown>(STORE, KEY),
    save: (ids) => kvSet(STORE, KEY, ids),
    afterStartup: afterStartupIdle,
    every: (run, ms) => createPoller(run, { intervalMs: ms }).start(),
    onOnline: (run) => {
        window.addEventListener("online", run);
        return () => window.removeEventListener("online", run);
    },
});
