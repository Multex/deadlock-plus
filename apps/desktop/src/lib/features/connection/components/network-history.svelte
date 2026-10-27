<script lang="ts">
    import Card from "@deadlock-plus/ui/card.svelte";
    import RegionError from "@deadlock-plus/ui/region-error.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { networkMonitor } from "../monitor.svelte";
    import HistoryCard from "./history-card.svelte";
</script>

{#if networkMonitor.failed}
    <Card as="section">
        <RegionError
            name="live-network-history"
            size="sm"
            title={t("connection.history.error_title")}
            body={t("connection.history.error_body")}
            retryLabel={t("region.retry")}
            onretry={() => void networkMonitor.retry()}
        />
    </Card>
{:else}
    <HistoryCard shown={networkMonitor.chart.shown} series={networkMonitor.chart.series} />
{/if}
