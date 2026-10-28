<script lang="ts">
    import { onMount } from "svelte";
    import { Eraser, FolderOpen, RefreshCw, Trash2 } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import SupportButton from "$lib/components/support-button.svelte";
    import CleanupDialog from "$lib/features/demos/components/cleanup-dialog.svelte";
    import DeleteDialog from "$lib/features/demos/components/delete-dialog.svelte";
    import DemoRow from "$lib/features/demos/components/demo-row.svelte";
    import FilterBar from "$lib/features/demos/components/filter-bar.svelte";
    import ListError from "$lib/features/demos/components/list-error.svelte";
    import Pager from "$lib/features/demos/components/pager.svelte";
    import { DemoList } from "$lib/features/demos/demo-list.svelte";
    import { statlockerMatchUrl } from "$lib/features/demos/demos";
    import { openLink } from "$lib/core/open-link";

    const list = new DemoList();

    onMount(() => list.init());
</script>

{#snippet support()}
    <SupportButton />
{/snippet}

<Page>
    <PageHeader title={t("demos.title")} subtitle={t("demos.subtitle")}>
        {#snippet actions()}
            <Button variant="outline" size="sm" onclick={list.openFolder} disabled={!list.listing?.dir}>
                <FolderOpen />
                {t("demos.open_folder")}
            </Button>
            <Button variant="outline" size="sm" onclick={() => (list.cleanupOpen = true)} disabled={!list.listing?.dir}>
                <Eraser />
                {t("demos.clean_up")}
            </Button>
            <Button
                variant="outline"
                size="sm"
                disabled={list.selected.size === 0 || list.deleting}
                onclick={list.askDeleteSelected}
            >
                <Trash2 />
                {t("demos.delete_selected", { count: list.selected.size })}
            </Button>
            <Button variant="outline" size="sm" onclick={list.load} disabled={list.loading}>
                <RefreshCw class={list.loading ? "animate-spin" : ""} />
                {t("demos.refresh")}
            </Button>
        {/snippet}
    </PageHeader>

    {#if list.error}
        <ListError onretry={list.load} />
    {:else if list.loading && !list.listing}
        <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t("demos.reading")}</div>
    {:else if list.listing && !list.listing.dir}
        <EmptyState as="div" layout="fill">
            {t("demos.no_folder")}
        </EmptyState>
    {:else if list.listing}
        <FilterBar
            demos={list.demos}
            filtered={list.filtered}
            counts={list.counts}
            filter={list.filter}
            pinnedCount={list.pinnedTotal}
            onfilter={(next) => list.setFilter(next)}
        />

        <div class="flex items-center gap-3 px-4 text-xs font-medium text-muted-foreground">
            <input
                type="checkbox"
                aria-label={t("demos.select_page")}
                checked={list.allVisibleSelected}
                onchange={(e) => list.toggleVisible(e.currentTarget.checked)}
            />
            <span>{t("demos.select_page")}</span>
        </div>

        <ul class="flex flex-col gap-1.5">
            {#each list.visible as d (d.fileName)}
                <DemoRow
                    demo={d}
                    meta={list.meta[d.matchId]}
                    heroes={list.heroes}
                    accountIds={list.accountIds}
                    pinned={list.pinned.has(d.matchId)}
                    selected={list.selected.has(d.fileName)}
                    deleting={list.deleting}
                    onselect={(on) => list.toggle(d.fileName, on)}
                    onpin={(on) => list.pin(d, on)}
                    onstatlocker={() => void openLink(statlockerMatchUrl(d.matchId))}
                    onreveal={() => list.reveal(d)}
                    ondelete={() => list.askDelete([d.fileName])}
                />
            {:else}
                <EmptyState as="li" action={list.demos.length === 0 ? support : undefined}>
                    {list.demos.length === 0 ? t("demos.empty_none") : t("demos.empty_filtered")}
                </EmptyState>
            {/each}
        </ul>

        {#if list.pages > 1}
            <Pager bind:page={list.page} count={list.pages} />
        {/if}

        {#if list.listing.referenceBuild}
            <p class="text-xs text-muted-foreground">
                {t("demos.reference_build", { build: list.listing.referenceBuild })}
            </p>
        {/if}
    {/if}
</Page>

<CleanupDialog bind:open={list.cleanupOpen} onreview={list.askDelete} />

<DeleteDialog
    bind:open={list.deleteOpen}
    bind:mode={list.deleteMode}
    preview={list.preview}
    copy={list.copy}
    deleting={list.deleting}
    onconfirm={list.confirmDelete}
/>
