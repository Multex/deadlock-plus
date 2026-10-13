<script lang="ts">
    import "../app.css";
    import { afterNavigate } from "$app/navigation";
    import { Toaster } from "svelte-sonner";
    import { setOverlayHost } from "@deadlock-plus/ui/overlay-host";
    import { overlayHost } from "$lib/shell/overlay-host.svelte";
    import Titlebar from "$lib/shell/titlebar.svelte";
    import { useAppShell } from "$lib/shell/startup.svelte";
    import CommandPalette from "$lib/features/keyboard/components/command-palette.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { isLightTheme } from "$lib/features/settings/themes";
    import { trackFeature } from "$lib/features/telemetry/api";
    import { trackRoute } from "$lib/features/telemetry/track";

    let { children } = $props();

    useAppShell();
    setOverlayHost(overlayHost);

    afterNavigate(({ to }) => {
        if (to) trackRoute(to.url.pathname, trackFeature);
    });
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden bg-chrome text-foreground">
    <Titlebar />
    {@render children?.()}
</div>

<CommandPalette />

<Toaster richColors position="bottom-right" theme={isLightTheme(settings.theme) ? "light" : "dark"} />
