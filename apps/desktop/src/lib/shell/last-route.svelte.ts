import { afterNavigate, goto } from "$app/navigation";
import { kvGet, kvSet } from "$lib/core/kv";
import { command, listen } from "$lib/core/tauri";
import { settings } from "$lib/features/registry";
import { knownPaths, routeToRestore, routeToSave } from "./last-route";

const STORE = "app-settings";
const ROUTE_KEY = "lastRoute";

// Upper bound on how long the reveal waits for the saved route; a slow store must not hold the window back.
const REVEAL_WAIT_MS = 1500;

const pages = knownPaths(Object.keys(import.meta.glob("/src/routes/**/+page.svelte")));

/** Main window only. Saves where the user is and goes back there before the window is revealed (or at its first showing, for a hidden launch). */
export function useLastRoute(onboardingPending: () => Promise<boolean>) {
    // Saving starts after the restore decision, or the launch route would overwrite the saved one.
    let armed = false;

    afterNavigate(({ to }) => {
        if (!armed || !to) return;
        const route = routeToSave(to.url);
        if (route) kvSet(STORE, ROUTE_KEY, route).catch(() => {});
    });

    async function restore() {
        try {
            await settings.ready;
            const [stored, pending] = await Promise.all([kvGet<string>(STORE, ROUTE_KEY), onboardingPending()]);
            const target = routeToRestore({
                stored,
                launchPath: location.pathname,
                onboardingPending: pending,
                known: pages,
            });
            // Replacing the launch entry keeps Back from landing on the home page that was only a stand-in.
            if (target) await goto(target, { replaceState: true });
        } catch {
            // An unreadable route is the same as none: stay on the launch page.
        } finally {
            armed = true;
        }
    }

    let stopHidden: () => void = () => {};

    /**
     * Resolves once the window may be revealed. A normal launch restores first, so the first visible frame is the
     * saved page. A hidden launch (autostart) has no one watching, so it restores at the first `window-shown`.
     */
    async function beforeReveal(): Promise<void> {
        const hidden = await command<boolean>("launched_hidden").catch(() => false);
        if (!hidden) {
            await Promise.race([restore(), new Promise<void>((resolve) => setTimeout(resolve, REVEAL_WAIT_MS))]);
            return;
        }
        let started = false;
        const run = () => {
            if (started) return;
            started = true;
            void restore();
        };
        const unlisten = listen("window-shown", run).catch(() => () => {});
        stopHidden = () => void unlisten.then((fn) => fn());
        command<boolean>("main_window_visible").then((visible) => visible && run(), run);
    }

    return { beforeReveal, stop: () => stopHidden() };
}
