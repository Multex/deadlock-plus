import { onMount } from "svelte";
import { afterNavigate, beforeNavigate } from "$app/navigation";
import { initLanguage } from "$lib/core/i18n.svelte";
import { command, listen } from "$lib/core/tauri";
import { windowVisibility } from "$lib/core/window-visibility";
import {
    SERVICES,
    accentOf,
    accentStyle,
    resolveReducedMotion,
    setWindowTheme,
    settings,
    updater,
} from "$lib/features/registry";
import { useLastRoute } from "./last-route.svelte";
import { overlays } from "./overlays";

/** Call once from the root layout's script. Owns service start-up, document attributes and overlay lifecycle. */
export function useAppShell() {
    let osReducedMotion = $state(false);

    $effect(() => {
        document.documentElement.toggleAttribute("data-accessible-font", settings.accessibleFont);
    });

    $effect(() => {
        document.documentElement.dataset.theme = settings.theme;
        setWindowTheme(settings.theme).catch(() => {});
    });

    // A user's accent overrides the theme's trim on `<html>`, above the generated theme tokens.
    let accentVars: string[] = [];
    $effect(() => {
        const style = document.documentElement.style;
        for (const name of accentVars) style.removeProperty(name);
        const vars = accentStyle(settings.theme, accentOf(settings.themeOptions, settings.theme));
        for (const [name, value] of Object.entries(vars)) style.setProperty(name, value);
        accentVars = Object.keys(vars);
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

    const lastRoute = useLastRoute();

    onMount(() => {
        const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        osReducedMotion = motionQuery.matches;
        const onMotionChange = (e: MediaQueryListEvent) => (osReducedMotion = e.matches);
        motionQuery.addEventListener("change", onMotionChange);

        void initLanguage();

        const stops = SERVICES.map((start) => start());

        const unlistenHidden = listen("window-hidden", () => overlays.closeAll()).catch(() => () => {});

        // Theme decor stops whenever nobody is looking at the window: hidden, minimized, or behind the game.
        const markDecorPaused = () =>
            document.documentElement.toggleAttribute(
                "data-decor-paused",
                windowVisibility.isHidden() || !document.hasFocus(),
            );
        markDecorPaused();
        const stopVisibility = windowVisibility.onVisibilityChange(markDecorPaused);
        window.addEventListener("focus", markDecorPaused);
        window.addEventListener("blur", markDecorPaused);

        void lastRoute.start();

        return () => {
            motionQuery.removeEventListener("change", onMotionChange);
            for (const stop of stops) if (typeof stop === "function") stop();
            lastRoute.stop();
            void unlistenHidden.then((fn) => fn());
            stopVisibility();
            window.removeEventListener("focus", markDecorPaused);
            window.removeEventListener("blur", markDecorPaused);
        };
    });
}
