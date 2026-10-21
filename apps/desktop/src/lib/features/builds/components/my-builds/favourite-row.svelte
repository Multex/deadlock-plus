<script lang="ts">
    import { CircleHelp, Copy, Ellipsis, ExternalLink, StarOff } from "@lucide/svelte";
    import { goto } from "$app/navigation";

    import { t } from "$lib/core/i18n.svelte";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import { favouriteViewHref, type FavouriteRow } from "$lib/features/builds/my-builds";
    import { editHref } from "$lib/features/builds/editor/load";
    import type { Hero } from "$lib/features/heroes/heroes";

    let {
        row,
        hero,
        author,
        busy,
        onunfavourite,
    }: {
        row: FavouriteRow;
        hero: Hero | undefined;
        author: string | undefined;
        busy: boolean;
        onunfavourite: () => void;
    } = $props();

    const href = $derived(favouriteViewHref(row));
    // Another player's build never edits in place: the editor opens it as a new local copy.
    const edit = $derived(editHref({ source: "local", id: row.buildId }));
</script>

<Card as="li" radius="md" padding="none" class="flex items-center gap-3 px-4 py-2" data-testid="favourite-row">
    <span class="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {#if hero?.icon}
            <img src={hero.icon} alt="" class="size-full object-cover" />
        {:else}
            <CircleHelp class="size-4 text-muted-foreground" aria-hidden="true" />
        {/if}
    </span>
    <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">
            <a {href} class="hover:underline">{row.name}</a>
        </p>
        <p class="truncate text-xs text-muted-foreground">
            <span>{hero?.name ?? t("builds.mine.unknown_hero")}</span>
            {#if author}<span aria-hidden="true"> · </span><span>{t("builds.browser.by", { name: author })}</span>{/if}
            <span aria-hidden="true"> · </span><span
                >{t("builds.mine.favourite_version", { version: row.version })}</span
            >
        </p>
    </div>
    <DropdownMenu.Root>
        <DropdownMenu.Trigger
            class={buttonVariants({ variant: "ghost", size: "sm" })}
            aria-label={t("builds.mine.actions", { name: row.name })}
            disabled={busy}
        >
            <Ellipsis />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
            <DropdownMenu.Item onSelect={() => void goto(href)}>
                <ExternalLink />
                {t("builds.mine.open")}
            </DropdownMenu.Item>
            <DropdownMenu.Item data-testid="edit-copy" onSelect={() => void goto(edit)}>
                <Copy />
                {t("builds.editor.edit_copy")}
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={onunfavourite}>
                <StarOff />
                {t("builds.mine.unfavourite")}
            </DropdownMenu.Item>
        </DropdownMenu.Content>
    </DropdownMenu.Root>
</Card>
