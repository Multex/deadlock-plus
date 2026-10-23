<script lang="ts">
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import { cn } from "@deadlock-plus/ui/utils";
    import type { ProfileSite } from "$lib/core/player-links";
    import { profileLinks } from "./links";

    let {
        name,
        accountId,
        sites,
        class: className,
    }: {
        name: string;
        accountId: number | null | undefined;
        sites: readonly ProfileSite[];
        class?: string;
    } = $props();

    const links = $derived(profileLinks(name, accountId, sites));
</script>

{#if links.length > 0}
    <span class={cn("inline-flex gap-0.5 rounded-md bg-card p-0.5", className)}>
        {#each links as link (link.site)}
            <IconButton
                label={link.label}
                tooltip={link.text}
                class="size-6 rounded-[calc(var(--radius)-2px)] text-muted-foreground hover:bg-foreground/12 hover:text-foreground focus-visible:bg-foreground/12 focus-visible:text-foreground active:bg-foreground/12 [&_svg]:size-3.5"
                onclick={(e: MouseEvent) => {
                    // Rows that hold the strip are clickable themselves.
                    e.stopPropagation();
                    void link.open();
                }}
            >
                <link.icon />
            </IconButton>
        {/each}
    </span>
{/if}
