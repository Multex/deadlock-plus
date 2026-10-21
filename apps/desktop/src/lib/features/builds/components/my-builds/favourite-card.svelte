<script lang="ts">
    import { CircleHelp, Copy, Ellipsis, ExternalLink, StarOff } from "@lucide/svelte";
    import { goto } from "$app/navigation";

    import { t } from "$lib/core/i18n.svelte";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import { favouriteViewHref, type FavouriteRow } from "$lib/features/builds/my-builds";
    import { editHref } from "$lib/features/builds/editor/load";
    import type { ChipItem } from "$lib/features/builds/shop-view";
    import type { Hero } from "$lib/features/heroes/heroes";
    import MineCard from "./mine-card.svelte";

    let {
        row,
        hero,
        author,
        resolve,
        busy,
        onunfavourite,
    }: {
        row: FavouriteRow;
        hero: Hero | undefined;
        author: string | undefined;
        resolve: ((abilityId: number) => ChipItem | undefined) | null;
        busy: boolean;
        onunfavourite: () => void;
    } = $props();

    const href = $derived(favouriteViewHref(row));
    // Another player's build never edits in place: the editor opens it as a new local copy.
    const edit = $derived(editHref({ source: "local", id: row.buildId }));
</script>

<MineCard name={row.name} {href} build={row.build} {resolve} testid="favourite-card">
    {#snippet lead()}
        <span class="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
            {#if hero?.icon}
                <img src={hero.icon} alt="" class="size-full object-cover" />
            {:else}
                <CircleHelp class="size-3.5 text-muted-foreground" aria-hidden="true" />
            {/if}
        </span>
    {/snippet}
    {#snippet trailing()}
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
    {/snippet}
    {#snippet meta()}
        <p class="truncate text-xs text-muted-foreground">
            <span>{hero?.name ?? t("builds.mine.unknown_hero")}</span>
            {#if author}<span aria-hidden="true"> · </span><span>{t("builds.browser.by", { name: author })}</span>{/if}
            <span aria-hidden="true"> · </span><span
                >{t("builds.mine.favourite_version", { version: row.version })}</span
            >
        </p>
    {/snippet}
</MineCard>
