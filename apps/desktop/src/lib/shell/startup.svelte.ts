import { onMount } from "svelte";
import { afterNavigate, beforeNavigate } from "$app/navigation";
import { initLanguage } from "$lib/core/i18n.svelte";
import { command, listen } from "$lib/core/tauri";
import { SERVICES, resolveReducedMotion, settings, updater } from "$lib/features/registry";
import { useLastRoute } from "./last-route.svelte";
import { overlays } from "./overlays";

/** Call once from the root layout's script. Owns service start-up, document attributes and overlay lifecycle. */
export function useAppShell(options: { onboardingPending: () => Promise<boolean> }) {
    let osReducedMotion = $state(false);

    $effect(() => {
        document.documentElement.toggleAttribute("data-accessible-font", settings.accessibleFont);
    });

    $effect(() => {
        document.documentElement.dataset.theme = settings.theme;
    });

    $effect(() => {
        document.documentElement.toggleAttribute(
            "data-reduced-motion",
            resolveReducedMotion(settings.motion, osReducedMotion),
        );
    });

    $effect(() => {
        const available = updater.phase === "available" || updater.phase === "downloading";
        command("set_update_badge", { available }).catch(() => {});
    });

    // Closes only what was open when the switch began: the new page may mount a dialog already open, and
    // closing in `beforeNavigate` would run before other handlers can mark the close as a page switch.
    let closeLeftBehind: (() => void) | null = null;
    beforeNavigate(() => (closeLeftBehind = overlays.snapshot()));
    afterNavigate(() => {
        closeLeftBehind?.();
        closeLeftBehind = null;
    });

    const lastRoute = useLastRoute(options.onboardingPending);

    onMount(() => {
        const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        osReducedMotion = motionQuery.matches;
        const onMotionChange = (e: MediaQueryListEvent) => (osReducedMotion = e.matches);
        motionQuery.addEventListener("change", onMotionChange);

        void initLanguage();

        const stops = SERVICES.map((start) => start());

        const unlistenHidden = listen("window-hidden", () => overlays.closeAll()).catch(() => () => {});

        // Two rAFs: the first fires before the browser has painted this frame, the second
        // guarantees one already happened. The window is built hidden so it's only ever revealed
        // with a real frame already rendered behind it, not a flash of empty/background-colored space.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                void lastRoute
                    .beforeReveal()
                    .catch(() => {})
                    // A restored page needs its own painted frame before the reveal.
                    .then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
                    .then(() => command("frontend_ready"))
                    .catch((e) => console.error("frontend_ready failed:", e));
            });
        });

        return () => {
            motionQuery.removeEventListener("change", onMotionChange);
            for (const stop of stops) if (typeof stop === "function") stop();
            lastRoute.stop();
            void unlistenHidden.then((fn) => fn());
        };
    });
}
