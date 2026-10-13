<script lang="ts">
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";

    import { errorText } from "$lib/core/errors";
    import Page from "@deadlock-plus/ui/page.svelte";
    import { alerts } from "$lib/features/alerts/alerts.svelte";
    import type { Alert } from "$lib/features/alerts/alerts";
    import { PatchSearch } from "$lib/features/alerts/patch-search.svelte";
    import AlertList from "$lib/features/alerts/components/alert-list.svelte";
    import SearchBar from "$lib/features/alerts/components/search-bar.svelte";
    import SearchResults from "$lib/features/alerts/components/search-results.svelte";
    import PatchViewerDialog from "$lib/features/patch-notes/components/patch-viewer-dialog.svelte";
    import { searchPatchNotes } from "$lib/features/patch-notes/api";
    import type { PatchSearchResult } from "$lib/features/patch-notes/patch-notes";
    import { jobs } from "$lib/features/jobs/jobs.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";

    const search = new PatchSearch<PatchSearchResult>(searchPatchNotes, (e) => toast.error(errorText(e)));

    let viewerOpen = $state(false);
    let viewer = $state<{ patchId: string; title: string; published: string; origin: string; link: string } | null>(
        null,
    );

    const isIndexing = $derived(jobs.isActive("patch-notes-index"));

    // Rows keep their unread marker while the page is open; they clear when you leave.
    onMount(() => {
        void alerts.fetchNow();
        return () => void alerts.markAllRead();
    });

    function viewResult(r: PatchSearchResult) {
        viewer = { patchId: r.patchId, title: r.title, published: r.published, origin: r.origin, link: r.link };
        viewerOpen = true;
    }

    function viewAlert(item: Alert) {
        viewer = {
            patchId: item.id,
            title: item.title,
            published: item.published,
            origin: item.source,
            link: item.link,
        };
        viewerOpen = true;
    }
</script>

<Page>
    <SearchBar bind:query={search.query} oninput={() => search.input()} onclear={() => search.clear()} />

    {#if search.query}
        <SearchResults
            query={search.query}
            indexing={isIndexing}
            searching={search.searching}
            results={search.results}
            onview={viewResult}
        />
    {:else}
        <AlertList items={alerts.items} updateAlerts={settings.updateAlerts} onview={viewAlert} />
    {/if}
</Page>

<PatchViewerDialog
    bind:open={viewerOpen}
    patchId={viewer?.patchId ?? null}
    title={viewer?.title ?? ""}
    published={viewer?.published ?? ""}
    origin={viewer?.origin ?? "forum"}
    link={viewer?.link ?? ""}
/>
