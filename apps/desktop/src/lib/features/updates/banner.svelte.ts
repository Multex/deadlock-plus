import { prefs } from "$lib/core/prefs";
import { trackUpdateShown } from "$lib/features/telemetry/api";
import { bannerDue, createShownTracker, firstSeenAt, type FirstSeenStore, type InstallSource } from "./nudge";
import { updateSurface } from "./update-surface.svelte";
import { updater, type UpdatePhase } from "./updater.svelte";

export const reportUpdateShown = createShownTracker((version) => {
    trackUpdateShown(version).catch(() => {});
});

export function installUpdate(source: InstallSource) {
    return updateSurface.startFrom(source);
}

export interface BannerDeps {
    updater: { readonly phase: UpdatePhase; readonly version: string | null };
    store: FirstSeenStore;
    now(): number;
    reportShown(version: string): void;
}

export class UpdateBanner {
    private due = $state(false);
    private dismissed = $state(false);
    private readonly deps: BannerDeps;

    constructor(deps: BannerDeps) {
        this.deps = deps;
    }

    get visible(): boolean {
        return this.deps.updater.phase === "available" && this.due && !this.dismissed;
    }

    /** Also stamps the version's first-seen time, so call it after every check. */
    refresh() {
        const { updater, store } = this.deps;
        const now = this.deps.now();
        const version = updater.phase === "available" ? updater.version : null;
        this.due = version !== null && bannerDue(firstSeenAt(store, version, now), now);
        if (this.visible && version) this.deps.reportShown(version);
    }

    /** A dismiss lasts until the window is shown again. */
    reveal() {
        this.dismissed = false;
        this.refresh();
    }

    dismiss() {
        this.dismissed = true;
    }
}

export const updateBanner = new UpdateBanner({
    updater,
    store: {
        get: () => prefs.getString("updateFirstSeen"),
        set: (value) => prefs.setString("updateFirstSeen", value),
    },
    now: () => Date.now(),
    reportShown: reportUpdateShown,
});
