<script lang="ts">
    import {
        CircleX,
        Copy,
        Ellipsis,
        ExternalLink,
        Pencil,
        Star,
        StarOff,
        Trash2,
        TriangleAlert,
        Trophy,
    } from "@lucide/svelte";
    import { goto } from "$app/navigation";

    import { formatDate, formatNumber, t, tn } from "$lib/core/i18n.svelte";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import { canDelete, copyRequest, favouriteAction, openHref, type MineRow } from "$lib/features/builds/my-builds";
    import type { WinRate } from "$lib/features/builds/public-builds";
    import { editHrefFor } from "$lib/features/builds/editor/load";
    import type { ChipItem } from "$lib/features/builds/shop-view";
    import MineCard from "./mine-card.svelte";
    import StatusBadge from "./status-badge.svelte";

    let {
        row,
        winRate,
        resolve,
        busy,
        oncopy,
        ondelete,
        onfavourite,
        oncancel,
        ondiscard,
    }: {
        row: MineRow;
        winRate: WinRate | undefined;
        resolve: ((abilityId: number) => ChipItem | undefined) | null;
        busy: boolean;
        oncopy: () => void;
        ondelete: () => void;
        onfavourite: () => void;
        oncancel: () => void;
        ondiscard: () => void;
    } = $props();

    const href = $derived(openHref(row));
    const edit = $derived(editHrefFor(row));
    const link = $derived(row.draft ? edit : href);
    const favourite = $derived(favouriteAction(row));
    const copyable = $derived(copyRequest(row, row.name) !== null);
    const updated = $derived(
        row.updatedAt === null
            ? null
            : t("builds.mine.updated", {
                  date: formatDate(row.updatedAt * 1000, { year: "numeric", month: "short", day: "numeric" }),
              }),
    );
    const won = $derived(
        winRate && {
            short: t("builds.browser.win_rate", {
                rate: formatNumber(winRate.wins / winRate.matches, { style: "percent", maximumFractionDigits: 0 }),
            }),
            long: t("builds.browser.win_rate_detail", {
                wins: formatNumber(winRate.wins),
                matches: formatNumber(winRate.matches),
            }),
        },
    );
    const favourites = $derived(row.favourites === null ? null : tn("builds.browser.favorites", row.favourites));
</script>

<MineCard name={row.name} href={link} build={row.build} {resolve}>
    {#snippet trailing()}
        {#if row.favorited}
            <Star
                class="size-4 shrink-0 fill-current text-brass"
                role="img"
                aria-label={t("builds.view.favourited")}
                data-testid="favourited"
            />
        {/if}
        <DropdownMenu.Root>
            <DropdownMenu.Trigger
                class={buttonVariants({ variant: "ghost", size: "sm" })}
                aria-label={t("builds.mine.actions", { name: row.name })}
                disabled={busy}
            >
                <Ellipsis />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content>
                {#if edit}
                    <DropdownMenu.Item data-testid="edit-build" onSelect={() => void goto(edit)}>
                        <Pencil />
                        {t("builds.editor.edit")}
                    </DropdownMenu.Item>
                {/if}
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
                {#if row.draft}
                    <DropdownMenu.Item
                        class="text-destructive data-[highlighted]:text-destructive"
                        onSelect={ondiscard}
                    >
                        <Trash2 />
                        {t("builds.mine.discard_draft")}
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
    {/snippet}
    {#snippet meta()}
        <div class="flex flex-wrap items-center gap-1.5" data-testid="status">
            <StatusBadge status={row.status} waiting={row.waiting} />
        </div>
        {#if row.draftOf}
            <p class="truncate text-xs text-muted-foreground">{t("builds.mine.draft_of", { name: row.draftOf })}</p>
        {/if}
        <div class="flex items-center gap-3 text-xs text-muted-foreground">
            <span class="min-w-0 truncate">
                {#if updated}{updated}{/if}
                {#if updated && row.version !== null}<span aria-hidden="true"> · </span>{/if}
                {#if row.version !== null}{t("builds.mine.favourite_version", { version: row.version })}{/if}
                {#if won}
                    <span aria-hidden="true"> · </span><span
                        class="inline-flex items-center gap-1"
                        title={won.long}
                        data-testid="win-rate"
                        ><Trophy class="size-3 text-brass" aria-hidden="true" />{won.short}<span class="sr-only"
                            >{won.long}</span
                        ></span
                    >
                {/if}
            </span>
            {#if favourites !== null && row.favourites !== null}
                <span
                    class="ml-auto inline-flex shrink-0 items-center gap-1 text-sm text-foreground"
                    title={favourites}
                    data-testid="favourite-count"
                >
                    <Star class="size-3.5 text-brass" aria-hidden="true" />
                    <span aria-hidden="true">{formatNumber(row.favourites)}</span>
                    <span class="sr-only">{favourites}</span>
                </span>
            {/if}
        </div>
        {#if row.edited}
            <p class="flex items-start gap-1.5 text-xs text-warning">
                <TriangleAlert class="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span>{t("builds.mine.edited")} {t("builds.mine.edited_hint")}</span>
            </p>
        {/if}
    {/snippet}
</MineCard>
