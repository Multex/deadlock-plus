<script lang="ts">
    import type { Snippet } from "svelte";
    import { LoaderCircle } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import ApiBusyNotice from "$lib/features/api-health/components/api-busy-notice.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import { stats } from "../../stats.svelte";

    let { children }: { children: Snippet } = $props();

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
</script>

{#if steamAccount.loaded && accountId === null}
    <EmptyState size="base" spacing="xl">{t("stats.gate.no_account")}</EmptyState>
{:else if stats.status !== "ready" && stats.busy.active}
    <ApiBusyNotice busy={stats.busy} />
{:else if stats.status === "error"}
    <EmptyState size="base" spacing="xl" tone="destructive" role="alert"
        >{t("stats.gate.error", { error: stats.error ?? "" })}</EmptyState
    >
{:else if stats.status !== "ready"}
    <EmptyState size="base" spacing="xl" role="status" class="flex items-center justify-center gap-2">
        <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
        {t("stats.gate.loading")}
    </EmptyState>
{:else}
    {@render children()}
{/if}
