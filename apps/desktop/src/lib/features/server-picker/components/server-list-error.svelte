<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import RegionError from "@deadlock-plus/ui/region-error.svelte";

    let { onretry }: { onretry: () => void } = $props();
</script>

<RegionError
    name="server-picker-list"
    title={t("server_picker.load_failed")}
    body={t("region.error_body")}
    retryLabel={t("region.retry")}
    {onretry}
/>
