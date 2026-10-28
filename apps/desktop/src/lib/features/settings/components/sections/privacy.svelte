<script lang="ts">
    import { ChevronRight } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";

    let { show }: { show: (id: string) => boolean } = $props();
</script>

{#if show("telemetry")}
    <Card as="section">
        <SettingRow
            label={t("settings.items.telemetry")}
            for="telemetry"
            description={t("settings.privacy.telemetry_description")}
        >
            <Switch id="telemetry" checked={settings.telemetry} onCheckedChange={(v) => settings.setTelemetry(v)} />
        </SettingRow>
        <details class="group mt-3">
            <summary
                class="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
                <ChevronRight class="size-4 shrink-0 transition-transform group-open:rotate-90" />
                {t("settings.privacy.advanced")}
            </summary>
            <div class="mt-3">
                <Button variant="outline" size="sm" onclick={() => settings.resetTelemetryId()}>
                    {t("settings.privacy.telemetry_reset")}
                </Button>
            </div>
        </details>
    </Card>
{/if}
