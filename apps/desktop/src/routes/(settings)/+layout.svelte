<script lang="ts">
    import { afterNavigate, goto } from "$app/navigation";
    import { page } from "$app/state";
    import { t } from "$lib/core/i18n.svelte";
    import AppRegion from "$lib/shell/app-region.svelte";
    import Frame from "$lib/shell/frame.svelte";
    import { overlayHost } from "$lib/shell/overlay-host.svelte";
    import { sidebarState } from "$lib/shell/sidebar-state.svelte";
    import SettingsNav from "$lib/features/settings/components/settings-nav.svelte";
    import { returnTarget } from "$lib/features/settings/return-to";
    import { settingsUi } from "$lib/features/settings/ui.svelte";

    let { children } = $props();

    afterNavigate(({ from }) => {
        const target = returnTarget(from);
        if (target) settingsUi.returnTo = target;
    });

    function back() {
        void goto(settingsUi.returnTo ?? "/");
    }

    function onkeydown(e: KeyboardEvent) {
        if (e.key !== "Escape" || e.defaultPrevented || overlayHost.count > 0) return;
        if (e.target instanceof HTMLInputElement && settingsUi.query) {
            settingsUi.query = "";
            return;
        }
        back();
    }
</script>

<svelte:window {onkeydown} />

<Frame>
    {#snippet sidebar()}
        <SettingsNav collapsed={sidebarState.collapsed} onback={back} />
    {/snippet}
    <AppRegion name="page" title={t("region.page_title")} resetKey={page.url.pathname}>
        {@render children?.()}
    </AppRegion>
</Frame>
