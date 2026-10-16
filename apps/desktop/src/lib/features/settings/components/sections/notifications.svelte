<script lang="ts">
    import { errorText } from "$lib/core/errors";
    import { t } from "$lib/core/i18n.svelte";
    import { toast } from "svelte-sonner";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import { BellRing, CalendarDays, MonitorPlay, TriangleAlert } from "@lucide/svelte";
    import PositionPicker from "@deadlock-plus/ui/position-picker.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import Slider from "@deadlock-plus/ui/slider.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { onOverlayStatus, overlayStatus, showOverlayTest } from "$lib/features/settings/api";
    import { formatTime, LEAD_OPTIONS, parseTime, weekdays } from "$lib/features/settings/maintenance";
    import {
        DURATION_RANGE,
        NO_GAME,
        OVERLAY_POSITIONS,
        type OverlayPosition,
        type OverlayStatus,
    } from "$lib/features/settings/overlay";
    import { leadItems, weekdayItems } from "./select-items";

    let { show }: { show: (id: string) => boolean } = $props();

    const OVERLAY_IDS = ["overlay", "overlay-position", "overlay-duration", "overlay-test"];

    const positionLabels = $derived<Record<OverlayPosition, string>>({
        topLeft: t("settings.notifications.position.top_left"),
        topCenter: t("settings.notifications.position.top_center"),
        topRight: t("settings.notifications.position.top_right"),
        left: t("settings.notifications.position.left"),
        right: t("settings.notifications.position.right"),
        bottomLeft: t("settings.notifications.position.bottom_left"),
        bottomCenter: t("settings.notifications.position.bottom_center"),
        bottomRight: t("settings.notifications.position.bottom_right"),
    });
    const positionOptions = $derived(OVERLAY_POSITIONS.map((value) => ({ value, label: positionLabels[value] })));
    const seconds = (value: number) => t("settings.notifications.overlay_seconds", { seconds: value });

    let status = $state<OverlayStatus>(NO_GAME);
    let testing = $state(false);

    $effect(() => {
        let alive = true;
        let unlisten: (() => void) | undefined;
        onOverlayStatus((next) => (status = next))
            .then((stop) => (alive ? (unlisten = stop) : stop()))
            .catch(() => {});
        overlayStatus()
            .then((next) => alive && (status = next))
            .catch(() => {});
        return () => {
            alive = false;
            unlisten?.();
        };
    });

    async function showTest() {
        testing = true;
        try {
            await showOverlayTest();
        } catch (e) {
            toast.error(errorText(e));
        } finally {
            testing = false;
        }
    }

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

{#if OVERLAY_IDS.some(show)}
    <Card as="section" class="flex flex-col gap-4">
        {#if show("overlay")}
            <SettingRow
                label={t("settings.items.overlay")}
                for="overlay"
                description={t("settings.notifications.overlay_description")}
            >
                {#snippet details()}
                    {#if status.exclusiveFullscreen}
                        <p class="flex items-start gap-1.5 text-xs text-warning">
                            <TriangleAlert class="mt-px size-3.5 shrink-0" aria-hidden="true" />
                            {t("settings.notifications.overlay_fullscreen")}
                        </p>
                    {/if}
                {/snippet}
                <Switch
                    id="overlay"
                    checked={settings.overlay.enabled}
                    onCheckedChange={(v) => settings.setOverlay({ enabled: v })}
                />
            </SettingRow>
        {/if}
        {#if show("overlay-position")}
            <SettingRow
                label={t("settings.items.overlay_position")}
                description={t("settings.notifications.overlay_position_description")}
                size="sub"
            >
                <PositionPicker
                    options={positionOptions}
                    value={settings.overlay.position}
                    centerLabel={t("settings.notifications.position.center")}
                    aria-label={t("settings.items.overlay_position")}
                    onValueChange={(v) => settings.setOverlay({ position: v })}
                />
            </SettingRow>
        {/if}
        {#if show("overlay-duration")}
            <SettingRow
                label={t("settings.items.overlay_duration")}
                description={t("settings.notifications.overlay_duration_description")}
                size="sub"
            >
                <div class="flex w-48 shrink-0 items-center gap-3">
                    <Slider
                        class="min-w-0 flex-1"
                        value={settings.overlay.durationSecs}
                        {...DURATION_RANGE}
                        ticks
                        formatValue={seconds}
                        bubble={false}
                        aria-label={t("settings.items.overlay_duration")}
                        onValueChange={(v) => settings.setOverlay({ durationSecs: v })}
                    />
                    <span class="w-8 text-right text-sm tabular-nums text-muted-foreground" aria-hidden="true">
                        {seconds(settings.overlay.durationSecs)}
                    </span>
                </div>
            </SettingRow>
        {/if}
        {#if show("overlay-test")}
            <SettingRow
                label={t("settings.items.overlay_test")}
                description={t("settings.notifications.overlay_test_description")}
                hint={status.gameOpen ? undefined : t("errors.overlay.game_not_running")}
                size="sub"
            >
                <Button
                    variant="outline"
                    size="sm"
                    class="shrink-0"
                    disabled={!status.gameOpen || testing}
                    onclick={showTest}
                >
                    <MonitorPlay aria-hidden="true" />
                    {t("settings.notifications.overlay_test_button")}
                </Button>
            </SettingRow>
        {/if}
    </Card>
{/if}
