<script lang="ts">
    import Card from "@deadlock-plus/ui/card.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import type { GameStatus } from "../../onboarding";

    let { returning, game }: { returning: boolean; game: GameStatus } = $props();
</script>

{#if returning}
    <h1 class="font-heading text-3xl font-bold tracking-wide">
        {t("onboarding.welcome.returning_title")}
    </h1>
    <p class="text-muted-foreground">{t("onboarding.welcome.returning_body")}</p>
{:else}
    <h1 class="font-heading text-3xl font-bold tracking-wide">{t("onboarding.welcome.new_title")}</h1>
    <p class="text-muted-foreground">
        {t("onboarding.welcome.new_body")}
    </p>
{/if}

<Card padding="sm" class="text-sm">
    {#if game.found}
        <p class="font-semibold">{t("onboarding.welcome.found")}</p>
        <p class="break-all text-muted-foreground">{game.path}</p>
    {:else}
        <p class="font-semibold">{t("onboarding.welcome.not_found")}</p>
        <p class="text-muted-foreground">
            {t("onboarding.welcome.not_found_body")}
        </p>
    {/if}
</Card>
