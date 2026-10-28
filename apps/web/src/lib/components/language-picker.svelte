<script lang="ts">
    import { tick, type Component, type ComponentProps } from "svelte";
    import { ChevronDown, Languages } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { useI18n } from "$lib/i18n";
    import { languageName } from "$lib/i18n/languages";
    import type LanguageMenu from "./language-menu.svelte";

    const i18n = useI18n();
    const { t } = i18n;

    // The menu and its dropdown load on first use, so they stay out of every page's first download.
    let Menu = $state<Component<ComponentProps<typeof LanguageMenu>> | null>(null);
    let open = $state(false);
    let loading: Promise<void> | null = null;
    let picker: HTMLElement;

    function load(): Promise<void> {
        loading ??= import("./language-menu.svelte").then(async (module) => {
            // Swapping in the menu removes the focused stand-in, which would drop a keyboard user back to the page.
            const focused = picker.contains(document.activeElement);
            Menu = module.default;
            if (!focused) return;
            await tick();
            picker.querySelector<HTMLElement>("button")?.focus();
        });
        return loading;
    }

    async function openMenu() {
        await load();
        open = true;
    }
</script>

<div bind:this={picker} class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <p class="font-heading text-sm font-semibold tracking-widest text-brass uppercase" aria-hidden="true">
        {t("language.label")}
    </p>
    {#if Menu}
        <Menu bind:open />
    {:else}
        <!-- Looks and reads like the menu's own trigger, which replaces it once loaded. -->
        <Button
            variant="outline"
            aria-label={t("language.current", { language: languageName(i18n.locale) })}
            aria-haspopup="menu"
            onpointerenter={load}
            onfocus={load}
            onclick={openMenu}
        >
            <Languages />
            {languageName(i18n.locale)}
            <ChevronDown />
        </Button>
    {/if}
</div>
