<script lang="ts">
    import { ExternalLink, Megaphone, OctagonAlert, TriangleAlert, X } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import type { Announcement } from "@deadlock-plus/ipc-types/Announcement";
    import { t } from "$lib/core/i18n.svelte";
    import { canDismiss } from "../announcements";

    type Props = {
        items: Announcement[];
        ondismiss: (id: string) => void;
        onopen: (url: string) => void;
    };

    let { items, ondismiss, onopen }: Props = $props();

    const ICONS = {
        info: { icon: Megaphone, tone: "text-brass" },
        warning: { icon: TriangleAlert, tone: "text-warning" },
        critical: { icon: OctagonAlert, tone: "text-destructive" },
    } as const;
</script>

{#each items as item (item.id)}
    {@const { icon: Icon, tone } = ICONS[item.severity]}
    <div
        data-announcement={item.id}
        role={item.severity === "critical" ? "alert" : "status"}
        class="flex items-start gap-3 border-b border-border bg-muted px-4 py-2"
    >
        <Icon class="mt-0.5 size-4 shrink-0 {tone}" aria-hidden="true" />
        <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold break-words">{item.title}</p>
            <p class="text-xs break-words whitespace-pre-line text-muted-foreground">{item.body}</p>
        </div>
        {#if item.link}
            {@const url = item.link.url}
            <Button size="sm" variant="outline" onclick={() => onopen(url)}>
                <ExternalLink />
                {item.link.label}
            </Button>
        {/if}
        {#if canDismiss(item)}
            <IconButton label={t("announcements.dismiss")} tooltip size="sm" onclick={() => ondismiss(item.id)}>
                <X />
            </IconButton>
        {/if}
    </div>
{/each}
