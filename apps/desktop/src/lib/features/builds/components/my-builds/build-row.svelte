<script lang="ts">
    import { CircleX, Copy, Ellipsis, ExternalLink, Star, StarOff, Trash2, TriangleAlert } from "@lucide/svelte";
    import { goto } from "$app/navigation";

    import { formatDate, t } from "$lib/core/i18n.svelte";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import { canDelete, copyRequest, favouriteAction, openHref, type MineRow } from "$lib/features/builds/my-builds";
    import StatusBadge from "./status-badge.svelte";

    let {
        row,
        busy,
        oncopy,
        ondelete,
        onfavourite,
        oncancel,
    }: {
        row: MineRow;
        busy: boolean;
        oncopy: () => void;
        ondelete: () => void;
        onfavourite: () => void;
        oncancel: () => void;
    } = $props();

    const href = $derived(openHref(row));
    const favourite = $derived(favouriteAction(row));
    const copyable = $derived(copyRequest(row, row.name) !== null);
    const updated = $derived(
        row.updatedAt === null
            ? null
            : t("builds.mine.updated", {
                  date: formatDate(row.updatedAt * 1000, { year: "numeric", month: "short", day: "numeric" }),
              }),
    );
</script>

<Card as="li" radius="md" padding="none" class="flex items-center gap-3 px-4 py-2">
    <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">
            {#if href}
                <a {href} class="hover:underline">{row.name}</a>
            {:else}
                {row.name}
            {/if}
        </p>
        {#if updated}
            <p class="text-xs text-muted-foreground">{updated}</p>
        {/if}
        {#if row.edited}
            <p class="mt-0.5 flex items-start gap-1.5 text-xs text-warning">
                <TriangleAlert class="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span>{t("builds.mine.edited")} {t("builds.mine.edited_hint")}</span>
            </p>
        {/if}
    </div>
    <StatusBadge status={row.status} />
    <DropdownMenu.Root>
        <DropdownMenu.Trigger
            class={buttonVariants({ variant: "ghost", size: "sm" })}
            aria-label={t("builds.mine.actions", { name: row.name })}
            disabled={busy}
        >
            <Ellipsis />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
            {#if href}
                <DropdownMenu.Item onSelect={() => void goto(href)}>
                    <ExternalLink />
                    {t("builds.mine.open")}
                </DropdownMenu.Item>
            {/if}
            {#if copyable}
                <DropdownMenu.Item onSelect={oncopy}>
                    <Copy />
                    {t("builds.mine.copy")}
                </DropdownMenu.Item>
            {/if}
            {#if favourite}
                <DropdownMenu.Item onSelect={onfavourite}>
                    {#if favourite.kind === "favourite"}
                        <Star />
                        {t("builds.mine.favourite")}
                    {:else}
                        <StarOff />
                        {t("builds.mine.unfavourite")}
                    {/if}
                </DropdownMenu.Item>
            {/if}
            {#if row.queue.length > 0}
                <DropdownMenu.Item onSelect={oncancel}>
                    <CircleX />
                    {t("builds.mine.cancel_queued")}
                </DropdownMenu.Item>
            {/if}
            {#if row.published}
                <DropdownMenu.Item disabled>
                    <Trash2 />
                    {t("builds.mine.delete_in_game")}
                </DropdownMenu.Item>
            {:else if canDelete(row)}
                <DropdownMenu.Item class="text-destructive data-[highlighted]:text-destructive" onSelect={ondelete}>
                    <Trash2 />
                    {t("builds.mine.delete")}
                </DropdownMenu.Item>
            {/if}
        </DropdownMenu.Content>
    </DropdownMenu.Root>
</Card>
