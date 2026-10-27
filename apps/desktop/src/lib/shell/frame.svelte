<script lang="ts">
    import type { Snippet } from "svelte";
    import AppRegion from "$lib/shell/app-region.svelte";
    import ContentRegion from "./content-region.svelte";
    import Statusbar from "./statusbar.svelte";

    type Props = {
        sidebar?: Snippet;
        statusbar?: boolean;
        children?: Snippet;
    };

    let { sidebar, statusbar = true, children }: Props = $props();
</script>

<div class="flex min-h-0 flex-1 flex-col">
    <div class="flex min-h-0 flex-1">
        {#if sidebar}
            <AppRegion name="sidebar" size="sm">{@render sidebar()}</AppRegion>
        {/if}
        <ContentRegion flush={!sidebar}>{@render children?.()}</ContentRegion>
    </div>
    {#if statusbar}
        <AppRegion name="statusbar" size="sm"><Statusbar withSidebar={!!sidebar} /></AppRegion>
    {/if}
</div>
