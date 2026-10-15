<script lang="ts">
    import type { Component } from "svelte";
    import { Search } from "@lucide/svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { CATEGORIES, matchingCategories, matchingItems, type CategoryId } from "../catalog";
    import { settingsUi } from "../ui.svelte";
    import Appearance from "./sections/appearance.svelte";
    import Language from "./sections/language.svelte";
    import Startup from "./sections/startup.svelte";
    import Notifications from "./sections/notifications.svelte";
    import Privacy from "./sections/privacy.svelte";
    import About from "./sections/about.svelte";
    import Sharing from "./sections/sharing.svelte";
    import Storage from "./sections/storage.svelte";
    import Diagnostics from "./sections/diagnostics.svelte";
    import Thanks from "./sections/thanks.svelte";
    import Licenses from "./sections/licenses.svelte";

    let { category, collapsed }: { category: CategoryId; collapsed: boolean } = $props();

    type Section = Component<{ show: (id: string) => boolean }>;

    const SECTIONS: Record<CategoryId, Section> = {
        appearance: Appearance,
        language: Language,
        startup: Startup,
        notifications: Notifications,
        privacy: Privacy,
        about: About,
        sharing: Sharing,
        storage: Storage,
        diagnostics: Diagnostics,
        thanks: Thanks,
        licenses: Licenses,
    };

    const hits = $derived(matchingItems(settingsUi.query));
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
