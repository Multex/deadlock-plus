<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import { platformName, type Platform } from "$lib/core/platform";
    import { adminAccess } from "$lib/features/admin-access/admin-access.svelte";
    import AdminAccessChoice from "./admin-access-choice.svelte";

    let { platform, elevated }: { platform: Platform; elevated: boolean } = $props();
</script>

{#if platform !== "windows"}
    <h1 class="font-heading text-2xl font-bold tracking-wide">
        {t("onboarding.permissions.other_title", { platform: platformName(platform) })}
    </h1>
    <p class="text-muted-foreground">
        {t("onboarding.permissions.other_body", { platform: platformName(platform) })}
    </p>
    <ul class="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
        <li>
            <span class="text-foreground">{t("onboarding.permissions.unavailable_label")}</span>
            {t("onboarding.permissions.unavailable")}
        </li>
        <li>
            <span class="text-foreground">{t("onboarding.permissions.untested_label")}</span>
            {t("onboarding.permissions.untested")}
        </li>
        <li>
            <span class="text-foreground">{t("onboarding.permissions.broken_label")}</span>
            {t("onboarding.permissions.broken")}
        </li>
    </ul>
{:else if adminAccess.buttons.kind !== "hidden"}
    <AdminAccessChoice />
{:else if elevated}
    <h1 class="font-heading text-2xl font-bold tracking-wide">{t("onboarding.permissions.windows_title")}</h1>
    <p class="text-muted-foreground">{t("onboarding.permissions.windows_body")}</p>
    <ul class="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
        <li>
            <span class="text-foreground">{t("onboarding.permissions.firewall_label")}</span>
            {t("onboarding.permissions.firewall", { rule: "deadlock_plus_*" })}
        </li>
        <li>
            <span class="text-foreground">{t("onboarding.permissions.monitor_label")}</span>
            {t("onboarding.permissions.monitor")}
        </li>
        <li>{t("onboarding.permissions.nothing_else")}</li>
    </ul>
{:else}
    <h1 class="font-heading text-2xl font-bold tracking-wide">{t("onboarding.permissions.admin_title")}</h1>
    <p class="text-muted-foreground">{t("onboarding.permissions.admin_body")}</p>
{/if}
