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
    import { isForcedExit, visibleReleases } from "$lib/features/updates/whats-new";
    import { whatsNew } from "$lib/features/updates/whats-new.svelte";

    let sentinel = $state<HTMLElement | null>(null);
    let reachedEnd = $state(false);
    let showAll = $state(false);

    const forced = $derived(isForcedExit(page.url.searchParams));
    const releases = $derived(
        visibleReleases({ forced, showAll, entries: whatsNew.entries, history: whatsNew.history }),
    );
    const onlyNew = $derived(forced && !showAll && whatsNew.entries.length > 0);

    onMount(() => {
        if (!sentinel) return;
        const observer = new IntersectionObserver((hits) => {
            if (!hits.some((h) => h.isIntersecting)) return;
            reachedEnd = true;
            void whatsNew.markSeen();
            observer.disconnect();
        });
        observer.observe(sentinel);
        return () => observer.disconnect();
    });
</script>

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
