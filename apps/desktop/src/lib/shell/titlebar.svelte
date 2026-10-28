<script lang="ts">
    import { onMount } from "svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { currentWindow, type AppWindow } from "$lib/core/tauri";
    import { Copy, Minus, PanelLeftClose, PanelLeftOpen, Square, X } from "@lucide/svelte";
    import BrandMark from "@deadlock-plus/ui/brand-mark.svelte";
    import { sidebarState } from "./sidebar-state.svelte";
    import { NotificationCenter, UpdateIndicator } from "$lib/features/registry";

    // macOS keeps its native traffic lights (overlay title bar), so it only needs room on the left.
    const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent);

    let maximized = $state(false);

    function run(action: (w: AppWindow) => Promise<unknown>) {
        try {
            void action(currentWindow()).catch(() => {});
        } catch {
            // Not running inside Tauri (plain browser dev): window controls are inert.
        }
    }

    onMount(() => {
        if (isMac) return;
        try {
            const win = currentWindow();
            const sync = () =>
                void win
                    .isMaximized()
                    .then((m) => (maximized = m))
                    .catch(() => {});
            sync();
            const unlisten = win.onResized(sync);
            return () => void unlisten.then((fn) => fn());
        } catch {
            return;
        }
    });
</script>

<header
    data-tauri-drag-region
    class="pointer-events-auto relative flex h-10 shrink-0 items-center bg-chrome select-none"
>
    {#if isMac}
        <div data-tauri-drag-region class="h-full w-[78px] shrink-0"></div>
    {/if}

    <button
        type="button"
        onclick={() => sidebarState.toggle()}
        aria-label={sidebarState.collapsed ? t("shell.titlebar.expand_sidebar") : t("shell.titlebar.collapse_sidebar")}
        class="ml-2 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
    >
        {#if sidebarState.collapsed}
            <PanelLeftOpen class="size-4" />
        {:else}
            <PanelLeftClose class="size-4" />
        {/if}
    </button>

    <div
        data-tauri-drag-region
        class="pointer-events-none absolute inset-x-0 top-0 flex h-full items-center justify-center"
    >
        <BrandMark />
    </div>

    <div data-tauri-drag-region class="h-full flex-1"></div>

    <UpdateIndicator />

    <NotificationCenter />

    {#if !isMac}
        <div class="flex h-full">
            <button
                type="button"
                aria-label={t("shell.titlebar.minimize")}
                onclick={() => run((w) => w.minimize())}
                class="flex w-11.5 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
                <Minus class="size-4" />
            </button>
            <button
                type="button"
                aria-label={maximized ? t("shell.titlebar.restore") : t("shell.titlebar.maximize")}
                onclick={() => run((w) => w.toggleMaximize())}
                class="flex w-11.5 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
                {#if maximized}
                    <Copy class="size-3.5" />
                {:else}
                    <Square class="size-3.5" />
                {/if}
            </button>
            <button
                type="button"
                aria-label={t("shell.titlebar.close")}
                onclick={() => run((w) => w.close())}
                class="flex w-11.5 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
            >
                <X class="size-4" />
            </button>
        </div>
    {/if}
</header>
