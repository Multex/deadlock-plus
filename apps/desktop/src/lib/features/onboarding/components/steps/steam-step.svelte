<script lang="ts">
    import Card from "@deadlock-plus/ui/card.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
</script>

<h1 class="font-heading text-2xl font-bold tracking-wide">{t("onboarding.steam.title")}</h1>
<p class="text-muted-foreground">{t("onboarding.steam.body")}</p>

<Card padding="sm" class="flex items-center gap-3 text-sm">
    {#if steamAccount.account}
        {#if steamAccount.account.avatarDataUrl}
            <img src={steamAccount.account.avatarDataUrl} alt="" class="size-10 rounded-md" />
        {/if}
        <div class="flex flex-col">
            <span class="font-semibold">{steamAccount.account.personaName}</span>
            <span class="text-muted-foreground">{t("onboarding.steam.signed_in")}</span>
        </div>
    {:else if steamAccount.loaded}
        <div class="flex flex-col">
            <span class="font-semibold">{t("onboarding.steam.none_title")}</span>
            <span class="text-muted-foreground">
                {t("onboarding.steam.none_body")}
            </span>
        </div>
    {:else}
        <span class="text-muted-foreground">{t("onboarding.steam.looking")}</span>
    {/if}
</Card>
