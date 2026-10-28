import { goto } from "$app/navigation";
import { openLink } from "$lib/core/open-link";
import { aboutInfo } from "$lib/features/settings/about-info.svelte";
import { trackUpdateInstallClicked } from "$lib/features/telemetry/api";
import { parseUpdatePreview } from "./preview";
import { UpdateSurface, type UpdaterStore } from "./surface.svelte";
import { updater } from "./updater.svelte";

const store: UpdaterStore = updater;

/** The URL the window loaded with: the launch redirect and in-app navigation drop the query before this runs. */
function launchSearch(): string {
    const [entry] = performance.getEntriesByType("navigation");
    return entry ? new URL(entry.name).search : window.location.search;
}

const preview = import.meta.env.VITE_DEMO ? parseUpdatePreview(launchSearch()) : null;
if (preview?.state) void aboutInfo.load();

export const updateSurface = new UpdateSurface({
    updater: store,
    preview,
    currentVersion: () => aboutInfo.info?.appVersion ?? null,
    track: (version, source) => void trackUpdateInstallClicked(version, source).catch(() => {}),
    navigate: (href) => void goto(href),
    openUrl: (url) => void openLink(url),
});
