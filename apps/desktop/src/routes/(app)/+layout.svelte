<script lang="ts">
    import { page } from "$app/state";
    import { t } from "$lib/core/i18n.svelte";
    import AppRegion from "$lib/shell/app-region.svelte";
    import Frame from "$lib/shell/frame.svelte";
    import Sidebar from "$lib/shell/sidebar.svelte";
    import OfflineBanner from "$lib/features/connectivity/components/offline-banner.svelte";
    import GameAdminBanner from "$lib/features/admin-access/components/game-admin-banner.svelte";
    import UpdateBanner from "$lib/features/updates/components/update-banner.svelte";
    import CrashDialog from "$lib/features/crash/components/crash-dialog.svelte";

    let { children } = $props();
</script>

<Frame>
    {#snippet sidebar()}
        <Sidebar />
    {/snippet}
    <AppRegion name="offline-banner" size="sm"><OfflineBanner /></AppRegion>
    <AppRegion name="update-banner" size="sm"><UpdateBanner /></AppRegion>
    <AppRegion name="admin-banner" size="sm"><GameAdminBanner /></AppRegion>
    <AppRegion name="page" title={t("region.page_title")} resetKey={page.url.pathname}>
        {@render children?.()}
    </AppRegion>
    <AppRegion name="crash-dialog" quiet><CrashDialog /></AppRegion>
</Frame>
