<script lang="ts">
    import "../app.css";
    import { afterNavigate } from "$app/navigation";
    import { Toaster } from "svelte-sonner";
    import { setOverlayHost } from "@deadlock-plus/ui/overlay-host";
    import { windowLabel } from "$lib/core/window-label";
    import { overlayHost } from "$lib/shell/overlay-host.svelte";
    import Titlebar from "$lib/shell/titlebar.svelte";
    import { useAppShell } from "$lib/shell/startup.svelte";
    import CommandPalette from "$lib/features/keyboard/components/command-palette.svelte";
    import AfterMatchFrontPage from "$lib/features/front-page/after-match-front-page.svelte";
    import { OVERLAY_WINDOW } from "$lib/features/overlay/api";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { DEFAULT_THEME, isLightTheme } from "$lib/features/settings/themes";
    import { variantOf } from "$lib/features/settings/theme-options";
    import { trackFeature } from "$lib/features/telemetry/api";
    import { trackRoute } from "$lib/features/telemetry/track";

    let { children } = $props();

    // The game overlay window loads this layout too. It has no KV or commands, so it gets only its page:
    // no services, onboarding, telemetry or window chrome, and the default theme.
    const isOverlay = windowLabel() === OVERLAY_WINDOW;

    if (isOverlay) {
        const root = document.documentElement;
        root.dataset.window = OVERLAY_WINDOW;
        root.dataset.theme = DEFAULT_THEME;
        root.toggleAttribute("data-reduced-motion", window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } else {
        useAppShell();
        setOverlayHost(overlayHost);

        afterNavigate(({ to }) => {
            if (to) trackRoute(to.url.pathname, trackFeature);
        });
    }
</script>

{#if isOverlay}
    {@render children?.()}
{:else}
    <div class="flex h-screen w-screen flex-col overflow-hidden bg-chrome text-foreground">
        <Titlebar />
        {@render children?.()}
    </div>

    <CommandPalette />
    <AfterMatchFrontPage />

    <Toaster
        richColors
        pauseWhenPageIsHidden
        position="bottom-right"
        theme={isLightTheme(settings.theme, variantOf(settings.themeOptions, settings.theme)) ? "light" : "dark"}
    />
{/if}

<style>
    :global(:root[data-window="overlay"]),
    :global(:root[data-window="overlay"] body) {
        background: transparent;
    }

    :global(:root[data-window="overlay"] body::after) {
        display: none;
    }
</style>
