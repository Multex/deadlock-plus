<script lang="ts">
    import { ChevronDown } from "@lucide/svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import { cn } from "@deadlock-plus/ui/utils";
    import { t } from "$lib/core/i18n.svelte";
    import type { ProfileSite } from "$lib/core/player-links";
    import { DEFAULT_SITES, profileLinks, type LeadingItem } from "./links";

    let {
        name,
        accountId,
        sites = DEFAULT_SITES,
        leading = [],
        align = "start",
        class: className,
    }: {
        name: string;
        accountId: number | null | undefined;
        sites?: readonly ProfileSite[];
        /** Surface actions listed above the profile links, e.g. "Builds by {name}". */
        leading?: LeadingItem[];
        align?: "start" | "center" | "end";
        class?: string;
    } = $props();

    const links = $derived(profileLinks(name, accountId, sites));
</script>

{#if links.length === 0 && leading.length === 0}
    <span class={className} title={name}>{name}</span>
{:else}
    <DropdownMenu.Root>
        <DropdownMenu.Trigger
            class={cn(
                "group/pl inline-flex max-w-full min-w-0 cursor-pointer items-center gap-[3px] rounded-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                className,
            )}
            title={name}
            aria-label={t("player_links.menu", { name })}
            onclick={(e: MouseEvent) => e.stopPropagation()}
        >
            <span class="min-w-0 truncate group-hover/pl:underline group-data-[state=open]/pl:underline">{name}</span>
            <!-- The board image export drops it: the chevron is a control, not part of the scoreboard. -->
            <ChevronDown
                size={11}
                aria-hidden="true"
                data-export-ignore
                class="shrink-0 opacity-45 group-hover/pl:opacity-100 group-data-[state=open]/pl:opacity-100"
            />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content {align}>
            <DropdownMenu.Group>
                <DropdownMenu.GroupHeading>{name}</DropdownMenu.GroupHeading>
                {#each leading as item, i (i)}
                    <DropdownMenu.Item onSelect={item.onSelect}>
                        {#if item.icon}<item.icon />{/if}
                        {item.label}
                    </DropdownMenu.Item>
                {/each}
                {#if leading.length > 0 && links.length > 0}
                    <DropdownMenu.Separator />
                {/if}
                {#each links as link (link.site)}
                    <DropdownMenu.Item onSelect={() => void link.open()}>
                        <link.icon />
                        {link.text}
                    </DropdownMenu.Item>
                {/each}
            </DropdownMenu.Group>
        </DropdownMenu.Content>
    </DropdownMenu.Root>
{/if}
