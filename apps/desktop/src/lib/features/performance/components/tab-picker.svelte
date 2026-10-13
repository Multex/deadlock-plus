<script lang="ts">
    import { Activity, FileSearch, GitCompare } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import * as Tabs from "@deadlock-plus/ui/tabs";

    const tabs = $derived([
        {
            value: "frametimes",
            title: t("performance.tabs.frametimes.title"),
            blurb: t("performance.tabs.frametimes.blurb"),
            icon: Activity,
        },
        {
            value: "scripts",
            title: t("performance.tabs.scripts.title"),
            blurb: t("performance.tabs.scripts.blurb"),
            icon: FileSearch,
        },
        {
            value: "compare",
            title: t("performance.tabs.compare.title"),
            blurb: t("performance.tabs.compare.blurb"),
            icon: GitCompare,
        },
    ]);

    let { value = $bindable() }: { value: string } = $props();
</script>

<Tabs.Root bind:value>
    <Tabs.List class="grid h-auto w-full grid-cols-3 gap-3 bg-transparent p-0">
        {#each tabs as tab (tab.value)}
            <Tabs.Trigger
                value={tab.value}
                class="h-auto flex-col items-start gap-1 whitespace-normal rounded-lg border border-border bg-card px-4 py-3 text-left text-foreground hover:border-brass/60 data-[state=active]:border-brass data-[state=active]:bg-brass/10 data-[state=active]:shadow-none"
            >
                <span class="flex items-center gap-2 text-base font-semibold">
                    <tab.icon class="size-5 text-brass" aria-hidden="true" />
                    {tab.title}
                </span>
                <span class="text-xs font-normal text-muted-foreground">{tab.blurb}</span>
            </Tabs.Trigger>
        {/each}
    </Tabs.List>
</Tabs.Root>
