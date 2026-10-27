<script lang="ts">
    import type { Snippet } from "svelte";
    import { LoaderCircle } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import RegionError from "@deadlock-plus/ui/region-error.svelte";
    import ApiBusyNotice from "$lib/features/api-health/components/api-busy-notice.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import { stats } from "../../stats.svelte";

    let {
        name,
        title,
        size = "md",
        loading,
    }: { name: string; title: string; size?: "sm" | "md"; loading?: Snippet } = $props();

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
    const retry = () => {
        if (accountId !== null) void stats.load(accountId, true);
    };
</script>

{#if stats.busy.active}
    <div data-region={name} data-region-state="busy">
        <ApiBusyNotice busy={stats.busy} />
    </div>
{:else if stats.status === "error"}
    <RegionError
        {name}
        {title}
        {size}
        body={size === "md" ? t("region.error_body") : undefined}
        retryLabel={t("region.retry")}
        onretry={retry}
    />
{:else if loading}
    {@render loading()}
{:else}
    <EmptyState size="base" spacing="xl" role="status" class="flex items-center justify-center gap-2">
        <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
        {t("stats.gate.loading")}
    </EmptyState>
{/if}
