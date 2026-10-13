<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";

    let { lossStreak, suggest }: { lossStreak: number; suggest: boolean } = $props();
</script>

<Card as="section">
    <div class="flex items-center justify-between gap-4">
        <div class="flex flex-col gap-1">
            <label for="break-hint" class="font-heading text-sm font-semibold tracking-wide"
                >{t("sessions.break.label")}</label
            >
            <p class="text-sm text-muted-foreground">
                {t("sessions.break.description", { count: lossStreak })}
            </p>
        </div>
        <Switch id="break-hint" checked={settings.breakHint} onCheckedChange={(v) => settings.setBreakHint(v)} />
    </div>
    {#if suggest}
        <p role="status" class="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm">
            {t("sessions.break.suggestion", { count: lossStreak })}
        </p>
    {/if}
</Card>
