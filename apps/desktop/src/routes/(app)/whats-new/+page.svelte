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
    import ReleasePage from "$lib/features/updates/components/release-page.svelte";
    import { parseChangelog, type ChangelogEntry } from "$lib/features/updates/changelog";
    import { getChangelog } from "$lib/features/updates/changelog-source";
    import { releaseStory } from "$lib/features/updates/release-story";
    import { isForcedExit, notesVisit, visibleReleases } from "$lib/features/updates/whats-new";
    import { previewVersion } from "$lib/features/updates/whats-new-preview";
    import { whatsNew } from "$lib/features/updates/whats-new.svelte";

    let sentinel = $state<HTMLElement | null>(null);
    let reachedEnd = $state(false);
    let showAll = $state(false);
    let preview = $state.raw<ChangelogEntry | null>(null);

    const previewAs = previewVersion(page.url.searchParams, !!import.meta.env.VITE_DEMO);
    const forced = $derived(isForcedExit(page.url.searchParams));
    const releases = $derived(
        visibleReleases({ forced, showAll, entries: whatsNew.entries, history: whatsNew.history }),
    );
    const shown = $derived(preview ? (showAll ? [preview, ...releases] : [preview]) : releases);
    const canShowAll = $derived(!showAll && (preview !== null || (forced && whatsNew.entries.length > 0)));

    onMount(() => {
        if (previewAs) void loadPreview(previewAs);
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

    async function loadPreview(version: string) {
        const now = new Date();
        const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
            .map((n) => String(n).padStart(2, "0"))
            .join("-");
        const [entry] = parseChangelog(await getChangelog(), { unreleasedAs: { version, date } });
        if (entry?.version === version) preview = entry;
    }
</script>

{#if shown.length === 0}
    <Page>
        <PageHeader title={t("whats_new.title")} subtitle={t("whats_new.subtitle")} />
        <Card as="section">
            <p class="text-sm text-muted-foreground">{t("whats_new.empty")}</p>
        </Card>
    </Page>
{:else}
    {#each shown as release, i (release.version)}
        <ReleasePage story={releaseStory(release)} featured={i === 0} />
    {/each}
{/if}

<div bind:this={sentinel} class="flex min-h-9 flex-wrap items-center gap-2 px-[clamp(16px,4vw,48px)] pb-10 pt-2">
    {#if canShowAll}
        <Button variant="outline" onclick={() => (showAll = true)}>{t("whats_new.show_all")}</Button>
    {/if}
    <SupportButton />
    {#if forced && reachedEnd}
        <Button class="ml-auto" onclick={() => goto("/")}>{t("whats_new.back_home")}</Button>
    {/if}
</div>
