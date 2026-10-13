<script lang="ts">
    import { page } from "$app/state";
    import AccountChip from "$lib/components/account-chip.svelte";
    import DiscordLink from "$lib/components/discord-link.svelte";
    import SupportLink from "$lib/components/support-link.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { Settings } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { navLabel } from "./nav-labels";
    import { sidebarState } from "./sidebar-state.svelte";
    import { isActivePath, NAV_ENTRIES, type FeatureNavEntry } from "$lib/features/registry";

    const collapsed = $derived(sidebarState.collapsed);
</script>

{#snippet navLink(feature: FeatureNavEntry)}
    {@const active = isActivePath(page.url.pathname, feature.href)}
    {@const Icon = feature.icon}
    {@const badge = feature.badge?.() ?? 0}
    {@const label = navLabel(feature.id, feature.label)}
    <Tooltip.Provider>
        <Tooltip.Root delayDuration={100} disabled={!collapsed}>
            <Tooltip.Trigger>
                {#snippet child({ props })}
                    <a
                        {...props}
                        href={feature.href}
                        aria-label={label}
                        aria-current={active ? "page" : undefined}
                        class="group relative flex h-10 items-center gap-3 overflow-hidden rounded-md px-3.5 font-heading text-sm font-semibold tracking-wide transition-colors {active
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
                    >
                        <span
                            class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brass transition-opacity {active
                                ? 'opacity-100'
                                : 'opacity-0'}"
                        ></span>
                        <Icon class="size-5 shrink-0 {active ? 'text-brass' : ''}" />
                        <span
                            class="truncate whitespace-nowrap transition-opacity duration-200 {collapsed
                                ? 'opacity-0'
                                : 'opacity-100'}">{label}</span
                        >
                        {#if badge > 0}
                            <span
                                class="absolute right-3 top-1/2 size-2 -translate-y-1/2 rounded-full bg-brass"
                                role="status"
                                aria-label={t("shell.sidebar.unread", { count: badge })}
                            ></span>
                        {/if}
                    </a>
                {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="right">{label}</Tooltip.Content>
        </Tooltip.Root>
    </Tooltip.Provider>
{/snippet}

<aside
    class="flex shrink-0 flex-col bg-chrome pb-1 select-none transition-[width] duration-200 {collapsed
        ? 'w-16'
        : 'w-56'}"
>
    <nav class="flex flex-col gap-1 px-2 pt-2">
        {#each NAV_ENTRIES as feature (feature.id)}
            {@render navLink(feature)}
        {/each}
    </nav>

    <div class="mt-auto flex flex-col gap-1 px-2 pb-1">
        <SupportLink {collapsed} />
        <DiscordLink {collapsed} />
    </div>

    <div class="flex gap-1 px-2 {collapsed ? 'flex-col' : 'items-center'}">
        <div class="min-w-0 {collapsed ? '' : 'flex-1'}">
            <AccountChip {collapsed} />
        </div>
        <Tooltip.Provider>
            <Tooltip.Root delayDuration={100}>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <a
                            {...props}
                            href="/settings"
                            aria-label={t("shell.sidebar.settings")}
                            class="flex h-10 shrink-0 items-center justify-center rounded-md text-muted-foreground {collapsed
                                ? 'w-full'
                                : 'w-10'} transition-colors hover:bg-accent/50 hover:text-foreground"
                        >
                            <Settings class="size-5" />
                        </a>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right">{t("shell.sidebar.settings")}</Tooltip.Content>
            </Tooltip.Root>
        </Tooltip.Provider>
    </div>
</aside>
