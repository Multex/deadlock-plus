<script lang="ts" module>
    import { error as logError } from "$lib/core/log";

    function describe(value: unknown): string {
        try {
            return typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
        } catch {
            return String(value);
        }
    }

    /** Logs a boundary-caught error. It never leaves a crash marker: the rest of the app kept running. */
    export function logRegionError(error: unknown, name: string): void {
        const detail = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : describe(error);
        logError(`Region "${name}" failed: ${detail}`).catch(() => {});
    }
</script>

<script lang="ts">
    import type { Snippet } from "svelte";
    import RegionBoundary from "@deadlock-plus/ui/region-boundary.svelte";
    import { t } from "$lib/core/i18n.svelte";

    type Props = {
        name: string;
        title?: string;
        body?: string;
        size?: "sm" | "md";
        onretry?: () => void;
        /** Renders nothing when the region fails, for pieces with no room for a message, like decor. */
        quiet?: boolean;
        /** A failed region starts over when this changes, e.g. the pathname for a page. */
        resetKey?: unknown;
        children: Snippet;
    };

    let { name, title, body, size, onretry, quiet = false, resetKey, children }: Props = $props();

    // Remounts only after a failure, so a working region keeps its state when `resetKey` changes.
    let failedAt = $state<{ key: unknown }>();
    let epoch = $state(0);

    $effect(() => {
        if (failedAt && failedAt.key !== resetKey) {
            failedAt = undefined;
            epoch++;
        }
    });

    function onerror(error: unknown) {
        logRegionError(error, name);
        failedAt = { key: resetKey };
    }
</script>

{#key epoch}
    {#if quiet}
        <svelte:boundary {onerror}>
            {@render children()}

            {#snippet failed()}{/snippet}
        </svelte:boundary>
    {:else}
        <RegionBoundary
            {name}
            title={title ?? t("region.error_title")}
            body={body ?? t("region.error_body")}
            retryLabel={t("region.retry")}
            {size}
            onretry={() => {
                failedAt = undefined;
                onretry?.();
            }}
            {onerror}
        >
            {@render children()}
        </RegionBoundary>
    {/if}
{/key}
