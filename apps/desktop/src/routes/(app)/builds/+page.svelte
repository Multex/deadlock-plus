<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import * as Tabs from "@deadlock-plus/ui/tabs";
    import { t } from "$lib/core/i18n.svelte";
    import { withParam } from "$lib/features/builds/build-list";
    import MyBuilds from "$lib/features/builds/components/my-builds/my-builds.svelte";
    import PublicBrowser from "$lib/features/builds/components/browser/public-browser.svelte";
    import { BuildLookups } from "$lib/features/builds/lookups.svelte";
    import { heroParam } from "$lib/features/builds/public-builds";

    const hero = $derived(heroParam(page.url.searchParams));
    // The tab lives in the URL so Back from a build's page returns to the same tab and selection.
    const tab = $derived(page.url.searchParams.get("tab") === "mine" ? "mine" : "public");

    const lookups = new BuildLookups();
    lookups.start();

    function pickTab(value: string) {
        const params = withParam(page.url.searchParams, "tab", value === "mine" ? "mine" : null);
        const query = params.toString();
        void goto(`${page.url.pathname}${query ? `?${query}` : ""}`, {
            replaceState: true,
            keepFocus: true,
            noScroll: true,
        });
    }
</script>

<Page class="h-full min-h-0 max-w-none gap-4 px-6 pt-6 pb-6">
    <PageHeader title={t("builds.browser.title")} subtitle={t("builds.browser.subtitle")} />

    <Tabs.Root value={tab} onValueChange={pickTab} class="flex min-h-0 flex-1 flex-col">
        <Tabs.List class="self-start">
            <Tabs.Trigger value="public">{t("builds.browser.tab_public")}</Tabs.Trigger>
            <Tabs.Trigger value="mine">{t("builds.browser.tab_mine")}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="public" class="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            {#if tab === "public"}<PublicBrowser {hero} {lookups} />{/if}
        </Tabs.Content>
        <Tabs.Content value="mine" class="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            {#if tab === "mine"}<MyBuilds {lookups} />{/if}
        </Tabs.Content>
    </Tabs.Root>
</Page>
