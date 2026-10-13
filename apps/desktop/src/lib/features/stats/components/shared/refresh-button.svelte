<script lang="ts">
    import { RefreshCw } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import { stats } from "../../stats.svelte";

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
</script>

<Button
    variant="outline"
    size="sm"
    disabled={accountId === null || stats.status === "loading"}
    onclick={() => accountId !== null && stats.load(accountId, true)}
>
    <RefreshCw class={stats.status === "loading" ? "animate-spin" : ""} />
    {t("stats.refresh")}
</Button>
