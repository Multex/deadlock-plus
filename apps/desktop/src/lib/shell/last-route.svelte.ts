import { afterNavigate, goto } from "$app/navigation";
import { kvGet, kvSet } from "$lib/core/kv";
import { command, listen } from "$lib/core/tauri";
import { needsOnboarding } from "$lib/features/registry";
import { firstCallOnly, isLaunch, knownPaths, launchRestoreTarget, routeToRestore, routeToSave } from "./last-route";

const STORE = "app-settings";
const ROUTE_KEY = "lastRoute";

// The first render waits on the saved route; a slow store must not hold it back longer than this.
const RESTORE_WAIT_MS = 1500;

const pages = knownPaths(Object.keys(import.meta.glob("/src/routes/**/+page.svelte")));

async function savedTarget(): Promise<string | null> {
    const [stored, onboardingVersion, launchRoute] = await Promise.all([
        kvGet<string>(STORE, ROUTE_KEY),
        kvGet<number>(STORE, "onboardingVersion"),
        command<string | null>("take_launch_route").catch(() => null),
    ]);
    return routeToRestore({
        stored,
        launchRoute,
        launchPath: location.pathname,
        onboardingPending: needsOnboarding(onboardingVersion),
        known: pages,
    });
}

/** For the root layout's `load`, so a shown launch renders the saved page first instead of switching to it. */
export const launchRedirect = firstCallOnly(() =>
    launchRestoreTarget({
        launch: isLaunch(),
        hidden: () => command<boolean>("launched_hidden"),
        target: savedTarget,
        waitMs: RESTORE_WAIT_MS,
    }),
);

/** Main window only. Saves where the user is; a hidden launch goes back to the saved route at its first showing. */
export function useLastRoute() {
    // A reload or an HMR re-run keeps the page it is on; only a real launch goes back to the saved route.
    const launch = isLaunch();
    // On a launch, saving starts after the restore decision, or the launch route would overwrite the saved one.
    let armed = !launch;

    afterNavigate(({ to }) => {
        if (!armed || !to) return;
        const route = routeToSave(to.url);
        if (route) kvSet(STORE, ROUTE_KEY, route).catch(() => {});
    });

    async function restoreHidden() {
        try {
            const target = await savedTarget();
            // Replacing the launch entry keeps Back from landing on the home page that was only a stand-in.
            if (target) await goto(target, { replaceState: true });
        } catch {
            // An unreadable route is the same as none: stay on the launch page.
        } finally {
            armed = true;
        }
    }

    let stopHidden: () => void = () => {};

    async function start(): Promise<void> {
        if (!launch) return;
        const hidden = await command<boolean>("launched_hidden").catch(() => false);
        if (!hidden) {
            armed = true;
            return;
        }
        let started = false;
        const run = () => {
            if (started) return;
            started = true;
            void restoreHidden();
        };
        const unlisten = listen("window-shown", run).catch(() => () => {});
        stopHidden = () => void unlisten.then((fn) => fn());
        command<boolean>("main_window_visible").then((visible) => visible && run(), run);
    }

    return { start, stop: () => stopHidden() };
}
