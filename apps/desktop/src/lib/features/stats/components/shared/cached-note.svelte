<script lang="ts">
    import { formatDate, t } from "$lib/core/i18n.svelte";
    import { stats } from "../../stats.svelte";
    import HistoryState from "./history-state.svelte";

    const capturedOnly = $derived(
        stats.status !== "ready" && stats.matches.length > 0 && (stats.status === "error" || stats.busy.active),
    );
</script>

{#if stats.cachedAt !== null}
    <p class="text-sm text-muted-foreground">
        {t("stats.cached_note", {
            time: formatDate(stats.cachedAt, {
                year: "numeric",
                month: "numeric",
                day: "numeric",
                hour: "numeric",
                minute: "numeric",
                second: "numeric",
            }),
        })}
    </p>
{:else if capturedOnly}
    <HistoryState name="history-captured-only" title={t("stats.captured_only")} size="sm" />
{/if}
