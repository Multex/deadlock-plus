<script lang="ts">
    import type { Snippet } from "svelte";
    import ThemeDecor from "@deadlock-plus/ui/theme-decor.svelte";
    import { layersOf, settings } from "$lib/features/registry";
    import AppRegion from "$lib/shell/app-region.svelte";
    import { appliedAccent } from "./applied-accent.svelte";
    import { overlayHost } from "./overlay-host.svelte";

    let { flush = false, children }: { flush?: boolean; children?: Snippet } = $props();

    let host = $state<HTMLElement | null>(null);

    // Publish only non-null hosts. A page switch unmounts this region before the next one mounts; a null in
    // between makes an open dialog's portal throw.
    $effect(() => {
        if (host) overlayHost.el = host;
    });
</script>

<div class="relative flex min-w-0 flex-1">
    <!-- The panel paints under the page so theme decor can sit between the two without scrolling with it. -->
    <div class={["noir-panel absolute inset-0", !flush && "rounded-l-xl"]}>
        {#if settings.themeEffects}
            <AppRegion name="theme-decor" quiet resetKey={settings.theme}>
                {#key appliedAccent.key}
                    <ThemeDecor theme={settings.theme} layers={layersOf(settings.themeOptions, settings.theme)} />
                {/key}
            </AppRegion>
        {/if}
    </div>
    <main
        inert={overlayHost.count > 0}
        class={[
            "relative min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] border-border",
            flush ? "border-t" : "rounded-l-xl border-y border-l",
        ]}
    >
        {@render children?.()}
    </main>
    <div
        bind:this={host}
        class={[
            "pointer-events-none absolute inset-0 isolate z-(--z-content-overlay) overflow-hidden",
            !flush && "rounded-l-xl",
        ]}
    ></div>
</div>
