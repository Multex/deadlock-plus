<script lang="ts">
    import DiscordIcon from "@deadlock-plus/ui/icons/discord.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { openDiscord } from "$lib/features/support/support";

    let { collapsed }: { collapsed: boolean } = $props();

    const label = $derived(t("shell.sidebar.discord"));
</script>

<Tooltip.Provider>
    <Tooltip.Root delayDuration={100} disabled={!collapsed}>
        <Tooltip.Trigger>
            {#snippet child({ props })}
                <button
                    {...props}
                    type="button"
                    aria-label={label}
                    onclick={openDiscord}
                    class="flex h-10 w-full items-center gap-3 overflow-hidden rounded-md px-3.5 text-left font-heading text-sm font-semibold tracking-wide text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                    <DiscordIcon class="size-5 shrink-0" />
                    {#if !collapsed}
                        <span class="truncate whitespace-nowrap">{label}</span>
                    {/if}
                </button>
            {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="right">{label}</Tooltip.Content>
    </Tooltip.Root>
</Tooltip.Provider>
