<script lang="ts">
    import { onMount } from "svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import type { IngestChoice } from "../../onboarding";

    let { choice, onAnswer }: { choice: IngestChoice | null; onAnswer: (choice: IngestChoice) => void } = $props();

    onMount(() => {
        void settings.markTelemetryNoticeShown();
    });
</script>

<h1 class="font-heading text-2xl font-bold tracking-wide">{t("onboarding.sharing.title")}</h1>
<p class="text-muted-foreground">
    {t("onboarding.sharing.intro")}
</p>
<p class="text-sm text-muted-foreground">
    {t("onboarding.sharing.consent")}
</p>
<p class="text-sm text-muted-foreground">{t("onboarding.sharing.optional")}</p>
<div class="flex gap-2">
    <Button
        variant={choice === "share" ? "default" : "outline"}
        aria-pressed={choice === "share"}
        onclick={() => onAnswer("share")}
    >
        {t("onboarding.sharing.share")}
    </Button>
    <Button
        variant={choice === "decline" ? "default" : "outline"}
        aria-pressed={choice === "decline"}
        onclick={() => onAnswer("decline")}
    >
        {t("onboarding.sharing.decline")}
    </Button>
</div>
<p class="text-sm text-muted-foreground" role="status">
    {#if choice}
        {choice === "share" ? t("onboarding.sharing.saved_on") : t("onboarding.sharing.saved_off")}
    {:else}
        {t("onboarding.sharing.skipped")}
    {/if}
</p>
<div class="mt-2 flex flex-col gap-2 border-t border-border pt-4">
    <h2 class="font-heading text-lg font-bold tracking-wide">{t("onboarding.sharing.telemetry_title")}</h2>
    <p class="text-sm text-muted-foreground">{t("onboarding.sharing.telemetry_body")}</p>
    <label class="flex items-center gap-3 text-sm" for="onboarding-telemetry">
        <Switch
            id="onboarding-telemetry"
            checked={settings.telemetry}
            onCheckedChange={(v) => settings.setTelemetry(v)}
        />
        {t("onboarding.sharing.telemetry_toggle")}
    </label>
</div>
