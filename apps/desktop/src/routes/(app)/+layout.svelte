<script lang="ts">
    import Frame from "$lib/shell/frame.svelte";
    import Sidebar from "$lib/shell/sidebar.svelte";
    import OfflineBanner from "$lib/features/connectivity/components/offline-banner.svelte";
    import UpdateBanner from "$lib/features/updates/components/update-banner.svelte";
    import CrashDialog from "$lib/features/crash/components/crash-dialog.svelte";

    let { children } = $props();
</script>

<Frame>
    {#snippet sidebar()}
        <Sidebar />
    {/snippet}
    <OfflineBanner />
    <UpdateBanner />
    {@render children?.()}
    <CrashDialog />
</Frame>
