<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import RegionError from "@deadlock-plus/ui/region-error.svelte";

    let { onretry }: { onretry: () => void } = $props();
</script>

<RegionError
    name="voice-bans-list"
    title={t("voice_bans.list_error")}
    body={t("region.error_body")}
    retryLabel={t("region.retry")}
    {onretry}
/>
