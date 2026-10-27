<script lang="ts">
    import { page } from "$app/state";
    import { ArrowLeft, Search } from "@lucide/svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import Input from "@deadlock-plus/ui/input.svelte";
    import SupportLink from "$lib/components/support-link.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { CATEGORIES, matchingCategories, matchingItems } from "../catalog";
    import { hiddenNow } from "../hidden";
    import { settingsUi } from "../ui.svelte";

    let { collapsed, onback }: { collapsed: boolean; onback: () => void } = $props();

    const hits = $derived(matchingItems(settingsUi.query, hiddenNow));
    const visible = $derived(matchingCategories(hits));
    const current = $derived(page.params.category);
</script>

<nav
    class="flex shrink-0 flex-col gap-3 px-2 pb-1 pt-2 select-none transition-[width] duration-200 {collapsed
        ? 'w-16'
        : 'w-56'}"
    aria-label={t("settings.nav.label")}
>
    {#if !collapsed}
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

    <ul class="flex flex-col gap-1">
        {#each CATEGORIES as category (category.id)}
            {#if visible.includes(category.id)}
                {@const Icon = category.icon}
                {@const active = hits === null && current === category.id}
                <li>
                    <Tooltip.Provider>
                        <Tooltip.Root delayDuration={100} disabled={!collapsed}>
                            <Tooltip.Trigger>
                                {#snippet child({ props })}
                                    <a
                                        {...props}
                                        href="/settings/{category.id}"
                                        aria-current={active ? "page" : undefined}
                                        aria-label={category.label}
                                        onclick={() => (settingsUi.query = "")}
                                        class="group relative flex h-10 w-full items-center gap-3 overflow-hidden rounded-md px-3.5 text-left font-heading text-sm font-semibold tracking-wide transition-colors {active
                                            ? 'bg-accent text-foreground'
                                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
                                    >
                                        <span
                                            class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brass transition-opacity {active
                                                ? 'opacity-100'
                                                : 'opacity-0'}"
                                        ></span>
                                        <Icon class="size-5 shrink-0 {active ? 'text-brass' : ''}" />
                                        <span class="truncate whitespace-nowrap">{category.label}</span>
                                    </a>
                                {/snippet}
                            </Tooltip.Trigger>
                            <Tooltip.Content side="right">{category.label}</Tooltip.Content>
                        </Tooltip.Root>
                    </Tooltip.Provider>
                </li>
            {/if}
        {/each}
    </ul>

    <div class="mt-auto flex flex-col gap-1">
        <SupportLink {collapsed} />
        <button
            type="button"
            aria-label={t("settings.nav.back")}
            onclick={onback}
            class="flex h-10 w-full items-center gap-3 rounded-md px-3.5 text-left font-heading text-sm font-semibold tracking-wide text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
            <ArrowLeft class="size-5 shrink-0" />
            {#if !collapsed}
                <span class="flex-1">{t("settings.nav.back")}</span>
                <kbd class="text-xs font-normal text-muted-foreground">Esc</kbd>
            {/if}
        </button>
    </div>
</nav>
