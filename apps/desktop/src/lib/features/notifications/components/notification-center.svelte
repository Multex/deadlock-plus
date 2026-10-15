<script lang="ts">
    import { goto } from "$app/navigation";
    import { Bell, CalendarClock, Check, Coffee, Megaphone, Server } from "@lucide/svelte";
    import { t, tn } from "$lib/core/i18n.svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import { notifications } from "$lib/features/notifications/notifications.svelte";
    import { formatRelative, notificationText, type AppNotification } from "$lib/features/notifications/notifications";

    let open = $state(false);

    function openItem(item: AppNotification) {
        open = false;
        if (item.link) void goto(item.link);
        else if (item.kind === "maintenance") void goto("/settings/notifications");
    }
</script>

<DropdownMenu.Root bind:open>
    <DropdownMenu.Trigger
        aria-label={notifications.unread > 0
            ? tn("notification_list.unread_count", notifications.unread)
            : t("notification_list.title")}
        title={t("notification_list.title")}
        class="relative flex h-full w-11.5 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
    >
        <Bell class="size-4" aria-hidden="true" />
        {#if notifications.unread > 0}
            <span class="absolute top-2.5 right-3 size-1.5 rounded-full bg-destructive" aria-hidden="true"></span>
        {/if}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content class="w-80 p-0" align="end">
        <div class="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span class="font-heading text-sm font-semibold tracking-wide">{t("notification_list.title")}</span>
            <DropdownMenu.Item
                closeOnSelect={false}
                disabled={notifications.unread === 0}
                onSelect={() => notifications.markAllRead()}
                class="w-auto px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
                {t("notification_list.mark_all_read")}
            </DropdownMenu.Item>
        </div>
        <div class="max-h-96 overflow-y-auto p-1">
            {#if notifications.items.length === 0}
                <EmptyState spacing="sm" class="px-3">{t("notification_list.empty")}</EmptyState>
            {:else}
                {#each notifications.items as item (item.id)}
                    {@const text = notificationText(item)}
                    <div class="group flex items-start gap-1 rounded-sm px-1 py-1 transition-colors hover:bg-accent/60">
                        <DropdownMenu.Item
                            onSelect={() => openItem(item)}
                            class="flex min-w-0 flex-1 items-start gap-2.5 px-1.5 py-1 text-left"
                        >
                            {#if item.kind === "maintenance"}
                                <CalendarClock class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            {:else if item.kind === "servers"}
                                <Server class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            {:else if item.kind === "session"}
                                <Coffee class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            {:else}
                                <Megaphone class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            {/if}
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-1.5">
                                    {#if !item.read}
                                        <span class="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden="true"
                                        ></span><span class="sr-only">{t("notification_list.unread")}</span>
                                    {/if}
                                    <span class="truncate text-sm font-medium text-foreground">{text.title}</span>
                                </div>
                                <p class="line-clamp-2 text-xs text-muted-foreground">{text.body}</p>
                                <span class="text-[0.7rem] text-muted-foreground/70"
                                    >{formatRelative(item.timestamp)}</span
                                >
                            </div>
                        </DropdownMenu.Item>
                        {#if !item.read}
                            <DropdownMenu.Item
                                closeOnSelect={false}
                                onSelect={() => notifications.markRead(item.id)}
                                aria-label={t("notification_list.mark_read")}
                                title={t("notification_list.mark_read")}
                                class="mt-1 shrink-0 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 data-[highlighted]:opacity-100 group-hover:opacity-100"
                            >
                                <Check class="size-3.5" aria-hidden="true" />
                            </DropdownMenu.Item>
                        {/if}
                    </div>
                {/each}
            {/if}
        </div>
    </DropdownMenu.Content>
</DropdownMenu.Root>
