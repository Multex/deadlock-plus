import { goto } from "$app/navigation";
import { kvGet, kvSet } from "$lib/core/kv";
import { getAppInfo } from "$lib/features/settings/about";
import { settings } from "$lib/features/settings/settings.svelte";
import { getChangelog } from "./changelog-source";
import { needsOnboarding } from "$lib/features/onboarding/onboarding";
import { isLaunch } from "$lib/shell/last-route";
import { seenFlagTiming, shouldOpenNotes, WHATS_NEW_UPDATE_ROUTE } from "./whats-new";
import { notesSince, parseChangelog, releasedUpTo, type ChangelogEntry } from "./changelog";

const STORE = "app-settings";
const ONBOARDING_KEY = "onboardingVersion";
const LAST_SEEN_KEY = "lastSeenVersion";

class WhatsNew {
    entries = $state<ChangelogEntry[]>([]);
    history = $state<ChangelogEntry[]>([]);
    private lastSeen: string | null = null;
    private appVersion: string | null = null;

    async init() {
        await settings.ready;
        try {
            const { appVersion } = await getAppInfo();
            const lastSeen = await kvGet<string>(STORE, LAST_SEEN_KEY);
            const released = releasedUpTo(parseChangelog(await getChangelog()), appVersion);
            this.history = released;
            this.entries = notesSince(released, lastSeen, appVersion);
            this.lastSeen = lastSeen;
            this.appVersion = appVersion;
            const timing = seenFlagTiming({ lastSeen, appVersion, noteCount: this.entries.length });
            if (timing === "now") await kvSet(STORE, LAST_SEEN_KEY, appVersion);
            if (timing === "on-seen") {
                const onboardingPending = needsOnboarding(await kvGet<number>(STORE, ONBOARDING_KEY));
                if (
                    shouldOpenNotes({
                        noteCount: this.entries.length,
                        onboardingPending,
                        pathname: location.pathname,
                        launch: isLaunch(),
                    })
                ) {
                    await goto(WHATS_NEW_UPDATE_ROUTE);
                }
            }
        } catch {
            // Not running inside Tauri, or the store is unavailable: skip the notes.
        }
    }

    async markSeen() {
        const version = this.appVersion;
        if (version === null || this.lastSeen === version) return;
        this.lastSeen = version;
        try {
            await kvSet(STORE, LAST_SEEN_KEY, version);
        } catch {
            // Store unavailable: the notes show again next launch.
        }
    }
}

export const whatsNew = new WhatsNew();
