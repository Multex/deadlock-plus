<script lang="ts">
    import { onMount } from "svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";

    import Compare from "$lib/features/performance/components/compare.svelte";
    import Frametimes from "$lib/features/performance/components/frametimes.svelte";
    import ScriptsScan from "$lib/features/performance/components/scripts-scan.svelte";
    import TabPicker from "$lib/features/performance/components/tab-picker.svelte";
    import { performanceScan } from "$lib/features/performance/scan.svelte";

    let tab = $state("frametimes");

    onMount(() => {
        if (!performanceScan.hasRun) void performanceScan.run();
    });
</script>

<Page>
    <PageHeader title={t("performance.title")} />

    <TabPicker bind:value={tab} />

    {#if tab === "frametimes"}
        <Frametimes />
    {:else if tab === "compare"}
        <Compare />
    {:else}
        <ScriptsScan />
    {/if}
</Page>
