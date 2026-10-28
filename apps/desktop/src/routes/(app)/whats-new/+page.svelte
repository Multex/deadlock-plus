<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import SupportButton from "$lib/components/support-button.svelte";
    import ReleaseNotes from "$lib/features/updates/components/release-notes.svelte";
    import PatchLayout from "$lib/features/updates/components/whats-new/patch-layout.svelte";
    import RevealLayout from "$lib/features/updates/components/whats-new/reveal-layout.svelte";
    import SpreadLayout from "$lib/features/updates/components/whats-new/spread-layout.svelte";
    import { parseChangelog, type ChangelogEntry } from "$lib/features/updates/changelog";
    import { getChangelog } from "$lib/features/updates/changelog-source";
    import { releaseStory } from "$lib/features/updates/release-story";
    import { isForcedExit, notesVisit, visibleReleases } from "$lib/features/updates/whats-new";
    import { PREVIEW_VERSION, previewLayout } from "$lib/features/updates/whats-new-layout";
    import { whatsNew } from "$lib/features/updates/whats-new.svelte";

    let sentinel = $state<HTMLElement | null>(null);
    let reachedEnd = $state(false);
    let showAll = $state(false);
    let preview = $state.raw<ChangelogEntry | null>(null);

    const layout = previewLayout(page.url.searchParams, !!import.meta.env.VITE_DEMO);
    const forced = $derived(isForcedExit(page.url.searchParams));
    const releases = $derived(
        visibleReleases({ forced, showAll, entries: whatsNew.entries, history: whatsNew.history }),
    );
    const onlyNew = $derived(forced && !showAll && whatsNew.entries.length > 0);

    onMount(() => {
        if (layout) void loadPreview();
        const visit = notesVisit(() => void whatsNew.markSeen());
        visit.rendered();
        const observer = new IntersectionObserver((hits) => {
            if (!hits.some((h) => h.isIntersecting)) return;
            reachedEnd = true;
            observer.disconnect();
        });
        if (sentinel) observer.observe(sentinel);
        return () => {
            observer.disconnect();
            visit.left();
        };
    });

    async function loadPreview() {
        const now = new Date();
        const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
            .map((n) => String(n).padStart(2, "0"))
            .join("-");
        const [entry] = parseChangelog(await getChangelog(), { unreleasedAs: { version: PREVIEW_VERSION, date } });
        if (entry) preview = entry;
    }
</script>

{#snippet footer()}
    {#if !showAll}
        <Button variant="outline" onclick={() => (showAll = true)}>{t("whats_new.show_all")}</Button>
    {/if}
    {#if forced}
        <Button onclick={() => goto("/")}>{t("whats_new.back_home")}</Button>
    {/if}
{/snippet}

{#if layout}
    {#if preview}
        {@const story = releaseStory(preview)}
        {#if layout === "reveal"}
            <RevealLayout {story} actions={footer} />
        {:else if layout === "spread"}
            <SpreadLayout {story} actions={footer} />
        {:else}
            <PatchLayout {story} actions={footer} />
        {/if}
        {#if showAll}
            <Page class="pt-0">
                {#each releases as release (release.version)}
                    <Card as="section" padding="lg">
                        <ReleaseNotes entries={[release]} />
                    </Card>
                {/each}
            </Page>
        {/if}
    {/if}
{:else}
    <Page>
        <PageHeader title={t("whats_new.title")} subtitle={t("whats_new.subtitle")}>
            {#snippet actions()}
                <SupportButton />
            {/snippet}
        </PageHeader>

        {#if releases.length === 0}
            <Card as="section">
                <p class="text-sm text-muted-foreground">{t("whats_new.empty")}</p>
            </Card>
        {:else}
            {#each releases as release (release.version)}
                <Card as="section" padding="lg">
                    <ReleaseNotes entries={[release]} />
                </Card>
            {/each}
        {/if}

        <div bind:this={sentinel} class="flex min-h-9 items-center justify-between gap-2 pt-2">
            {#if onlyNew}
                <Button variant="ghost" onclick={() => (showAll = true)}>{t("whats_new.show_all")}</Button>
            {:else}
                <span></span>
            {/if}
            {#if forced && reachedEnd}
                <Button onclick={() => goto("/")}>{t("whats_new.back_home")}</Button>
            {/if}
        </div>
    </Page>
{/if}
