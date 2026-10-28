<script lang="ts">
    import { page } from "$app/state";
    import { t } from "$lib/core/i18n.svelte";
    import AppRegion from "$lib/shell/app-region.svelte";
    import Frame from "$lib/shell/frame.svelte";

    let { children } = $props();
</script>

<Frame statusbar={false}>
    <AppRegion name="page" title={t("region.page_title")} resetKey={page.url.pathname}>
        {@render children?.()}
    </AppRegion>
</Frame>
