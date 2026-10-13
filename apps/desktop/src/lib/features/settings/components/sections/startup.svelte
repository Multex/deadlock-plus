<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import { onMount, type Component } from "svelte";
    import { Gauge, Pause, Play } from "@lucide/svelte";
    import { errorText } from "$lib/core/errors";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { jobDescription, jobTitle, POLICY_OPTIONS, type Policy } from "$lib/features/jobs/jobs";
    import { jobs } from "$lib/features/jobs/jobs.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import {
        autostartDescription,
        autostartLine,
        autostartTitle,
        getAutostart,
        setAutostart,
        type AutostartStatus,
    } from "$lib/features/settings/autostart";

    let { show }: { show: (id: string) => boolean } = $props();

    const POLICY_ICONS: Record<Policy, Component> = { always: Play, pauseInGame: Pause, slowInGame: Gauge };
    const policyItems = $derived(POLICY_OPTIONS.map((o) => ({ value: o.value, label: o.label, policy: o.value })));

    let autostart = $state<AutostartStatus | null>(null);
    let autostartError = $state<string | null>(null);
    let autostartBusy = $state(false);

    onMount(() => {
        getAutostart()
            .then((a) => (autostart = a))
            .catch(() => {});
    });

    async function toggleAutostart(enabled: boolean) {
        autostartBusy = true;
        autostartError = null;
        try {
            autostart = await setAutostart(enabled);
        } catch (e) {
            autostartError = errorText(e);
        } finally {
            autostartBusy = false;
        }
    }
</script>

{#if show("autostart") && autostart?.supported !== false}
    <Card as="section">
        <SettingRow
            label={autostartTitle()}
            for="autostart"
            description={autostartDescription()}
            hint={autostartLine(autostart, autostartError)}
        >
            <Switch
                id="autostart"
                checked={autostart?.enabled ?? false}
                disabled={!autostart || autostartBusy}
                onCheckedChange={toggleAutostart}
            />
        </SettingRow>
    </Card>
{/if}

{#if show("close-to-tray")}
    <Card as="section">
        <SettingRow
            label={t("settings.items.close_to_tray")}
            for="close-to-tray"
            description={t("settings.startup.tray_description")}
        >
            <Switch
                id="close-to-tray"
                checked={settings.closeToTray}
                onCheckedChange={(v) => settings.setCloseToTray(v)}
            />
        </SettingRow>
    </Card>
{/if}

{#if show("background-jobs")}
    <Card as="section">
        <div class="flex flex-col gap-1">
            <h3 class="font-heading text-sm font-semibold tracking-wide">{t("settings.items.background_jobs")}</h3>
            <p class="text-sm text-muted-foreground">
                {t("settings.startup.jobs_description")}
            </p>
        </div>

        <SettingRow
            size="sub"
            class="mt-4"
            label={t("settings.startup.all_jobs_label")}
            for="all-jobs"
            description={t("settings.startup.all_jobs_description")}
        >
            <Switch id="all-jobs" checked={jobs.allEnabled} onCheckedChange={(v) => void jobs.setAllEnabled(v)} />
        </SettingRow>

        <SettingRow
            size="sub"
            class="mt-4"
            label={t("settings.startup.pause_label")}
            for="pause-in-game"
            description={t("settings.startup.pause_description")}
        >
            <Switch
                id="pause-in-game"
                checked={jobs.pauseInGame}
                disabled={!jobs.allEnabled}
                onCheckedChange={(v) => void jobs.setPauseInGame(v)}
            />
        </SettingRow>

        {#if jobs.catalog.length > 0}
            <div class="my-4 border-t" role="separator"></div>

            <div class="flex flex-col gap-1">
                <h4 class="text-sm font-medium">{t("settings.startup.tasks_title")}</h4>
                <p class="text-xs text-muted-foreground">
                    {t("settings.startup.tasks_description")}
                </p>
            </div>

            <ul class="mt-4 flex flex-col gap-5">
                {#each jobs.catalog as job (job.id)}
                    <li class="flex flex-col gap-2">
                        <div class="flex flex-col gap-0.5">
                            <span id="job-{job.id}-title" class="text-sm font-medium">{jobTitle(job)}</span>
                            <p class="text-xs text-muted-foreground">{jobDescription(job)}</p>
                        </div>
                        <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
                            <div class="flex items-center gap-2">
                                <Switch
                                    id="job-{job.id}"
                                    aria-labelledby="job-{job.id}-title job-{job.id}-run"
                                    checked={job.enabled}
                                    disabled={!jobs.allEnabled}
                                    onCheckedChange={(v) => void jobs.setEnabled(job.id, v)}
                                />
                                <label id="job-{job.id}-run" for="job-{job.id}" class="text-xs text-muted-foreground"
                                    >{t("settings.startup.run_by_itself")}</label
                                >
                            </div>
                            {#if job.policyConfigurable}
                                <div class="flex items-center gap-2">
                                    <label
                                        id="job-{job.id}-policy-label"
                                        for="job-{job.id}-policy"
                                        class="text-xs text-muted-foreground"
                                        >{t("settings.startup.while_running")}</label
                                    >
                                    <SelectMenu
                                        id="job-{job.id}-policy"
                                        aria-labelledby="job-{job.id}-title job-{job.id}-policy-label"
                                        items={policyItems}
                                        value={job.policy}
                                        disabled={!jobs.allEnabled || !job.enabled}
                                        onValueChange={(v) => void jobs.setPolicy(job.id, v as Policy)}
                                        class="w-44"
                                    >
                                        {#snippet leading(item)}
                                            {@const Icon = POLICY_ICONS[item.policy]}
                                            <Icon aria-hidden="true" />
                                        {/snippet}
                                    </SelectMenu>
                                </div>
                            {/if}
                        </div>
                        {#if job.policyConfigurable && !jobs.pauseInGame && job.policy === "pauseInGame"}
                            <p class="text-xs text-muted-foreground/80">
                                {t("settings.startup.pause_ignored")}
                            </p>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}
    </Card>
{/if}
