<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import { BellRing, CalendarDays } from "@lucide/svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { formatTime, LEAD_OPTIONS, parseTime, weekdays } from "$lib/features/settings/maintenance";
    import { leadItems, weekdayItems } from "./select-items";

    let { show }: { show: (id: string) => boolean } = $props();

    const dayItems = $derived(weekdayItems(weekdays()));
    const leadOptions = $derived(
        leadItems(LEAD_OPTIONS, {
            minutes: (minutes) => t("settings.notifications.lead_minutes", { minutes }),
            hours: (hours) => t("settings.notifications.lead_hours", { hours }),
        }),
    );

    let maintenanceTime = $state(formatTime(settings.maintenance.minuteOfDay));
    $effect(() => {
        maintenanceTime = formatTime(settings.maintenance.minuteOfDay);
    });

    function commitMaintenanceTime() {
        const minute = parseTime(maintenanceTime);
        if (minute === null) maintenanceTime = formatTime(settings.maintenance.minuteOfDay);
        else void settings.setMaintenance({ minuteOfDay: minute });
    }
</script>

{#if show("update-alerts")}
    <Card as="section">
        <SettingRow
            label={t("settings.items.update_alerts")}
            for="update-alerts"
            description={t("settings.notifications.alerts_description")}
        >
            <Switch
                id="update-alerts"
                checked={settings.updateAlerts}
                onCheckedChange={(v) => settings.setUpdateAlerts(v)}
            />
        </SettingRow>
    </Card>
{/if}

{#if show("maintenance")}
    <Card as="section">
        <SettingRow
            label={t("settings.items.maintenance")}
            for="maintenance"
            description={t("settings.notifications.maintenance_description")}
        >
            <Switch
                id="maintenance"
                checked={settings.maintenance.enabled}
                onCheckedChange={(v) => settings.setMaintenance({ enabled: v })}
            />
        </SettingRow>
        <div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <label class="flex items-center gap-2 text-muted-foreground">
                {t("settings.notifications.day")}
                <SelectMenu
                    items={dayItems}
                    value={String(settings.maintenance.weekday)}
                    onValueChange={(v) => settings.setMaintenance({ weekday: Number(v) })}
                    class="w-40"
                >
                    {#snippet icon()}<CalendarDays aria-hidden="true" />{/snippet}
                </SelectMenu>
            </label>
            <label class="flex items-center gap-2 text-muted-foreground">
                {t("settings.notifications.time")}
                <Input
                    class="w-24"
                    bind:value={maintenanceTime}
                    placeholder="21:00"
                    onblur={commitMaintenanceTime}
                    onkeydown={(e) => e.key === "Enter" && commitMaintenanceTime()}
                />
            </label>
            <label class="flex items-center gap-2 text-muted-foreground">
                {t("settings.notifications.remind")}
                <SelectMenu
                    items={leadOptions}
                    value={String(settings.maintenance.leadMinutes)}
                    onValueChange={(v) => settings.setMaintenance({ leadMinutes: Number(v) })}
                    class="w-44"
                >
                    {#snippet icon()}<BellRing aria-hidden="true" />{/snippet}
                </SelectMenu>
            </label>
        </div>
    </Card>
{/if}
