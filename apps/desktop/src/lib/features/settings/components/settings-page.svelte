<script lang="ts">
    import type { Component } from "svelte";
    import { Search } from "@lucide/svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { CATEGORIES, matchingCategories, matchingItems, type CategoryId } from "../catalog";
    import { hiddenNow } from "../hidden";
    import { tick } from "svelte";
    import { settingsUi } from "../ui.svelte";
    import { highlightStep } from "../jump";
    import Appearance from "./sections/appearance.svelte";
    import Language from "./sections/language.svelte";
    import Startup from "./sections/startup.svelte";
    import Notifications from "./sections/notifications.svelte";
    import Overlay from "./sections/overlay.svelte";
    import Privacy from "./sections/privacy.svelte";
    import Sharing from "./sections/sharing.svelte";
    import Storage from "./sections/storage.svelte";
    import Diagnostics from "./sections/diagnostics.svelte";
    import About from "./sections/about.svelte";

    let { category, collapsed }: { category: CategoryId; collapsed: boolean } = $props();

    type Section = Component<{ show: (id: string) => boolean }>;

    const SECTIONS: Record<CategoryId, Section> = {
        appearance: Appearance,
        language: Language,
        startup: Startup,
        notifications: Notifications,
        overlay: Overlay,
        privacy: Privacy,
        sharing: Sharing,
        storage: Storage,
        diagnostics: Diagnostics,
        about: About,
    };

    const hits = $derived(matchingItems(settingsUi.query, hiddenNow));
    const visible = $derived(matchingCategories(hits));
    const shown = $derived(hits === null ? [category] : visible);
    const show = (id: string) => hits === null || hits.has(id);
    const logsFill = $derived(settingsUi.logsExpanded && shown.length === 1 && shown[0] === "diagnostics");

    let root = $state<HTMLElement | null>(null);

    $effect(() => {
        category;
        settingsUi.query;
        root?.closest("main")?.scrollTo({ top: 0 });
    });

    const HIGHLIGHT_MS = 1800;
    let highlighted: HTMLElement | null = null;
    let highlightTimer: ReturnType<typeof setTimeout> | undefined;

    function clearHighlight() {
        clearTimeout(highlightTimer);
        highlighted?.removeAttribute("data-jump-highlight");
        highlighted = null;
    }

    $effect(() => {
        const id = settingsUi.highlightId;
        if (!id) return;
        category;
        void tick().then(() => {
            if (settingsUi.highlightId !== id) return;
            const step = highlightStep(id, category);
            if (step === "wait") return;
            settingsUi.takeHighlight();
            if (step === "drop") return;
            requestAnimationFrame(() => {
                const control = root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
                const row = control?.closest<HTMLElement>("section") ?? control;
                if (!row) return;
                clearHighlight();
                const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
                row.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
                row.setAttribute("data-jump-highlight", "");
                highlighted = row;
                highlightTimer = setTimeout(clearHighlight, HIGHLIGHT_MS);
            });
        });
        return clearHighlight;
    });
</script>

<div bind:this={root} class={logsFill ? "h-full p-6" : "mx-auto flex max-w-2xl flex-col gap-6 p-6 pb-10"}>
    {#if logsFill}
        <Diagnostics {show} />
    {:else}
        {#if collapsed}
            <div class="relative">
                <Search
                    class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                    type="search"
                    class="pl-8"
                    placeholder={t("settings.nav.search")}
                    aria-label={t("settings.nav.search")}
                    bind:value={settingsUi.query}
                />
            </div>
        {/if}
        {#if shown.length === 0}
            <p role="status" class="py-16 text-center text-sm text-muted-foreground">
                {t("settings.nav.no_matches", { query: settingsUi.query.trim() })}
            </p>
        {/if}
        {#each shown as id (id)}
            {@const Body = SECTIONS[id]}
            {@const label = CATEGORIES.find((c) => c.id === id)?.label}
            <div class="flex flex-col gap-3">
                {#if hits === null}
                    <h1 class="text-2xl">{label}</h1>
                {:else}
                    <h2 class="font-heading text-xs uppercase tracking-widest text-muted-foreground/70">
                        {label}
                    </h2>
                {/if}
                <Body {show} />
            </div>
        {/each}
    {/if}
</div>

<style>
    :global([data-jump-highlight]) {
        animation: jump-highlight 1.8s ease-out;
    }

    @keyframes jump-highlight {
        0%,
        60% {
            box-shadow: 0 0 0 2px var(--primary);
        }
        100% {
            box-shadow: 0 0 0 2px transparent;
        }
    }
</style>
