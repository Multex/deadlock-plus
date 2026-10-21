<script lang="ts">
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import * as Tabs from "@deadlock-plus/ui/tabs";
    import { t } from "$lib/core/i18n.svelte";
    import MyBuilds from "$lib/features/builds/components/my-builds/my-builds.svelte";
    import PublicBrowser from "$lib/features/builds/components/browser/public-browser.svelte";

    let tab = $state("public");
</script>

<Page>
    <PageHeader title={t("builds.browser.title")} subtitle={t("builds.browser.subtitle")} />

    <Tabs.Root bind:value={tab} class="mt-6">
        <Tabs.List>
            <Tabs.Trigger value="public">{t("builds.browser.tab_public")}</Tabs.Trigger>
            <Tabs.Trigger value="mine">{t("builds.browser.tab_mine")}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="public" class="mt-4">
            <PublicBrowser />
        </Tabs.Content>
        <Tabs.Content value="mine" class="mt-4">
            <MyBuilds />
        </Tabs.Content>
    </Tabs.Root>
</Page>
