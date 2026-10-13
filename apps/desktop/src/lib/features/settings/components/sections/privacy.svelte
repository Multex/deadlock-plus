<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import { toast } from "svelte-sonner";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { gcStatus } from "$lib/features/gc/status.svelte";
    import { gcStatusLine } from "$lib/features/gc/status-line";
    import { ingestStatus } from "$lib/features/ingest/status.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";

    let { show }: { show: (id: string) => boolean } = $props();

    const ingestLine = $derived.by(() => {
        if (settings.ingestPromptPending) return t("settings.privacy.ingest_waiting");
        if (!settings.matchIngest) return t("settings.privacy.ingest_off");
        const ingest = ingestStatus.status;
        if (!ingest) return "";
        if (!ingest.steamFound) return t("settings.privacy.ingest_no_cache");
        if (ingest.lastError) return t("settings.privacy.ingest_failed", { error: ingest.lastError });
        return t("settings.privacy.ingest_watching", { count: ingest.submitted });
    });
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
        <div class="mt-3">
            <Button
                variant="outline"
                size="sm"
                onclick={() =>
                    settings
                        .resetTelemetryId()
                        .then(() => toast.success(t("settings.privacy.telemetry_reset_done")))
                        .catch(() => {})}
            >
                {t("settings.privacy.telemetry_reset")}
            </Button>
        </div>
    </Card>
{/if}

{#if show("match-ingest")}
    <Card as="section">
        <SettingRow
            label={t("settings.items.match_ingest")}
            for="match-ingest"
            description={t("settings.privacy.ingest_description")}
            hint={ingestLine}
        >
            <Switch
                id="match-ingest"
                checked={settings.matchIngest}
                onCheckedChange={(v) => settings.setMatchIngest(v)}
            />
        </SettingRow>
    </Card>
{/if}

{#if show("gc-recovery")}
    <Card as="section">
        <SettingRow
            label={t("settings.items.gc_recovery")}
            for="gc-recovery"
            description={t("settings.privacy.gc_description")}
            hint={gcStatusLine(settings.gcRecovery, gcStatus.status)}
        >
            <Switch id="gc-recovery" checked={settings.gcRecovery} onCheckedChange={(v) => settings.setGcRecovery(v)} />
        </SettingRow>
    </Card>
{/if}
