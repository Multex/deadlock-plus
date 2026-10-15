<script lang="ts">
    import { Info } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { settings } from "$lib/features/settings/settings.svelte";

    let { lossStreak, suggest }: { lossStreak: number; suggest: boolean } = $props();
</script>

<div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2 class="flex items-center gap-2 text-xl">
            {t("sessions.title")}
            <Tooltip.Provider>
                <Tooltip.Root delayDuration={150}>
                    <Tooltip.Trigger aria-label={t("sessions.subtitle")}>
                        <Info class="size-4 text-muted-foreground" aria-hidden="true" />
                    </Tooltip.Trigger>
                    <Tooltip.Content>{t("sessions.subtitle")}</Tooltip.Content>
                </Tooltip.Root>
            </Tooltip.Provider>
        </h2>
        <div class="flex items-center gap-3">
            <label for="break-hint" class="text-sm font-medium">{t("sessions.break.label")}</label>
            <Switch id="break-hint" checked={settings.breakHint} onCheckedChange={(v) => settings.setBreakHint(v)} />
        </div>
    </div>
    {#if suggest}
        <p role="status" class="rounded-md border border-border bg-muted px-3 py-2 text-sm">
            {t("sessions.break.suggestion", { count: lossStreak })}
        </p>
    {/if}
</div>
