<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import { History } from "@lucide/svelte";
    import { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { gcStatus } from "$lib/features/gc/status.svelte";
    import { gcStatusLine, lastRunLine, ownRecoveryLine } from "$lib/features/gc/status-line";
    import { ingestStatus } from "$lib/features/ingest/status.svelte";
    import { recoveryPanel } from "$lib/features/match-history/recovery-panel.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import HowItWorks from "$lib/features/settings/components/how-it-works.svelte";
    import SharedMatches from "./shared-matches.svelte";

    let { show }: { show: (id: string) => boolean } = $props();

    const ingestLine = $derived.by(() => {
        if (settings.ingestPromptPending) return t("settings.privacy.ingest_waiting");
        if (!settings.matchIngest) return t("settings.privacy.ingest_off");
        const ingest = ingestStatus.status;
        if (!ingest) return "";
        if (!ingest.steamFound) return t("settings.privacy.ingest_no_cache");
        if (ingest.lastError) return ingest.lastError;
        return t("settings.privacy.ingest_watching", { count: ingest.submitted });
    });

    const gcLine = $derived(gcStatusLine(settings.gcRecovery, gcStatus.status));

    const recoveryHint = $derived.by(() => {
        const own = gcStatus.status?.ownRecovery ?? null;
        if (own?.running || own?.paused) return ownRecoveryLine(own);
        return lastRunLine(gcStatus.status?.lastRun ?? null);
    });
</script>

{#if show("match-ingest")}
    <Card as="section">
        <SettingRow
            label={t("settings.items.match_ingest")}
            for="match-ingest"
            description={t("settings.privacy.ingest_description")}
        >
            {#snippet details()}
                <HowItWorks points={[t("settings.privacy.ingest_how_find"), t("settings.privacy.ingest_how_send")]} />
                {#if ingestLine}<p class="mt-1 text-xs text-muted-foreground">{ingestLine}</p>{/if}
                <SharedMatches />
            {/snippet}
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
        >
            {#snippet details()}
                <HowItWorks
                    points={[
                        t("settings.privacy.gc_how_login"),
                        t("settings.privacy.gc_how_limit"),
                        t("settings.privacy.gc_how_game"),
                        t("settings.privacy.gc_how_send"),
                    ]}
                />
                {#if gcLine}<p class="mt-1 text-xs text-muted-foreground">{gcLine}</p>{/if}
            {/snippet}
            <Switch id="gc-recovery" checked={settings.gcRecovery} onCheckedChange={(v) => settings.setGcRecovery(v)} />
        </SettingRow>
        <SettingRow
            class="mt-4"
            size="sub"
            label={t("settings.privacy.gc_own_label")}
            description={t("settings.privacy.gc_own_description")}
            hint={recoveryHint}
        >
            <a
                href="/match-history"
                class={buttonVariants({ variant: "outline", size: "sm" })}
                onclick={() => (recoveryPanel.open = true)}
            >
                <History />
                {t("settings.privacy.gc_own_open")}
            </a>
        </SettingRow>
    </Card>
{/if}
