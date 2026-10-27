<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import SettingRow from "@deadlock-plus/ui/setting-row.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import { Bell, BellMinus, BellRing, CalendarDays, Inbox, Layers, MonitorPlay } from "@lucide/svelte";
    import type { Component } from "svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { formatTime, LEAD_OPTIONS, parseTime, weekdays } from "$lib/features/settings/maintenance";
    import { DELIVERIES, type Delivery, type NotificationTopic } from "$lib/features/settings/notification-topics";
    import { leadItems, weekdayItems } from "./select-items";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { FRONT_PAGE_MODES } from "$lib/features/settings/front-page-modes";
    import { hasOverlay } from "$lib/features/settings/catalog";
    import { platform } from "$lib/core/platform";

    let { show }: { show: (id: string) => boolean } = $props();

    const dayItems = $derived(weekdayItems(weekdays()));
    const leadOptions = $derived(
        leadItems(LEAD_OPTIONS, {
            minutes: (minutes) => t("settings.notifications.lead_minutes", { minutes }),
            hours: (hours) => t("settings.notifications.lead_hours", { hours }),
        }),
    );

    const DELIVERY_ICONS: Record<Delivery, Component<{ "aria-hidden"?: "true" }>> = {
        both: Layers,
        overlay: MonitorPlay,
        os: Bell,
        quiet: BellMinus,
        center: Inbox,
    };
    const deliveryItems = $derived(
        DELIVERIES.map((value) => ({
            value,
            label: t(`settings.notifications.delivery.${value}`),
            icon: DELIVERY_ICONS[value],
        })),
    );

    function overlayOffHint(delivery: Delivery): string | undefined {
        if (settings.overlay.enabled) return undefined;
        if (delivery === "both") return t("settings.notifications.overlay_off_fallback");
        if (delivery === "overlay") return t("settings.notifications.overlay_off_hidden");
        return undefined;
    }

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

{#snippet deliveryRow(topic: NotificationTopic, title: string)}
    {@const delivery = settings.notifications.deliveries[topic]}
    {@const SelectedIcon = DELIVERY_ICONS[delivery]}
    <SettingRow label={t("settings.notifications.delivery_label")} hint={overlayOffHint(delivery)} size="sub">
        <SelectMenu
            items={deliveryItems}
            value={delivery}
            onValueChange={(v) => settings.setDelivery(topic, v as Delivery)}
            aria-label={`${title} ${t("settings.notifications.delivery_label")}`}
            align="end"
            class="w-60 shrink-0"
        >
            {#snippet leading(item)}<item.icon aria-hidden="true" />{/snippet}
            {#snippet icon()}<SelectedIcon aria-hidden="true" />{/snippet}
        </SelectMenu>
    </SettingRow>
{/snippet}

{#if show("update-alerts")}
    <Card as="section" class="flex flex-col gap-4">
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
        {@render deliveryRow("updates", t("settings.items.update_alerts"))}
    </Card>
{/if}

{#if show("maintenance")}
    <Card as="section" class="flex flex-col gap-4">
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
        <div class="flex flex-wrap items-center gap-3 text-sm">
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
        {@render deliveryRow("maintenance", t("settings.items.maintenance"))}
    </Card>
{/if}

{#if show("server-blocks-updated")}
    <Card as="section" class="flex flex-col gap-4">
        <SettingRow
            label={t("settings.items.server_blocks_updated")}
            for="server-blocks-updated"
            description={t("settings.notifications.server_blocks_updated_description")}
        >
            <Switch
                id="server-blocks-updated"
                checked={settings.notifications.serverBlocksUpdated}
                onCheckedChange={(v) => settings.setNotifications({ serverBlocksUpdated: v })}
            />
        </SettingRow>
        {@render deliveryRow("serverBlocksUpdated", t("settings.items.server_blocks_updated"))}
    </Card>
{/if}

{#if show("server-blocks-stale")}
    <Card as="section" class="flex flex-col gap-4">
        <SettingRow
            label={t("settings.items.server_blocks_stale")}
            for="server-blocks-stale"
            description={t("settings.notifications.server_blocks_stale_description")}
        >
            <Switch
                id="server-blocks-stale"
                checked={settings.notifications.serverBlocksStale}
                onCheckedChange={(v) => settings.setNotifications({ serverBlocksStale: v })}
            />
        </SettingRow>
        {@render deliveryRow("serverBlocksStale", t("settings.items.server_blocks_stale"))}
    </Card>
{/if}

{#if show("break-reminder")}
    <Card as="section" class="flex flex-col gap-4">
        <SettingRow
            label={t("settings.items.break_reminder")}
            for="break-reminder"
            description={t("settings.notifications.break_reminder_description")}
        >
            <Switch
                id="break-reminder"
                checked={settings.breakHint}
                onCheckedChange={(v) => settings.setBreakHint(v)}
            />
        </SettingRow>
        {@render deliveryRow("breakReminder", t("settings.items.break_reminder"))}
    </Card>
{/if}

{#if show("dispatch-alerts")}
    <Card as="section" class="flex flex-col gap-4">
        <SettingRow
            label={t("settings.items.dispatch_alerts")}
            for="dispatch-alerts"
            description={t("settings.notifications.dispatch_alerts_description")}
        >
            <Switch
                id="dispatch-alerts"
                checked={settings.dispatchAlerts}
                onCheckedChange={(v) => settings.setDispatchAlerts(v)}
            />
        </SettingRow>
        {@render deliveryRow("dispatchEdition", t("settings.items.dispatch_alerts"))}
    </Card>
{/if}

{#if show("front-page-after-match") || (hasOverlay(platform) && show("front-page-overlay-alert"))}
    <Card as="section" class="flex flex-col gap-4">
        <SettingRow
            label={t("settings.items.front_page_after_match")}
            for="front-page-after-match"
            description={t("settings.notifications.front_page_after_match_description")}
        >
            <Switch
                id="front-page-after-match"
                checked={settings.frontPageAfterMatch}
                onCheckedChange={(v) => settings.setFrontPageAfterMatch(v)}
            />
        </SettingRow>
        <div class="flex flex-col gap-2" role="group" aria-labelledby="front-page-modes">
            <span id="front-page-modes" class="text-sm font-semibold">
                {t("settings.notifications.front_page_modes")}
            </span>
            <div class="flex flex-wrap gap-2">
                {#each FRONT_PAGE_MODES as mode (mode)}
                    {@const label = t(`match_history.detail.mode.${mode}`)}
                    <Button
                        variant="toggle"
                        size="sm"
                        aria-pressed={settings.frontPageModes[mode]}
                        aria-label={t("settings.notifications.front_page_mode_aria", { mode: label })}
                        disabled={!settings.frontPageAfterMatch}
                        onclick={() => settings.setFrontPageMode(mode, !settings.frontPageModes[mode])}
                    >
                        {label}
                    </Button>
                {/each}
            </div>
        </div>
        {#if hasOverlay(platform)}
            <SettingRow
                label={t("settings.items.front_page_overlay_alert")}
                for="front-page-overlay-alert"
                description={t("settings.notifications.front_page_overlay_alert_description")}
                hint={overlayOffHint("overlay")}
            >
                <Switch
                    id="front-page-overlay-alert"
                    checked={settings.frontPageOverlayAlert}
                    disabled={!settings.frontPageAfterMatch}
                    onCheckedChange={(v) => settings.setFrontPageOverlayAlert(v)}
                />
            </SettingRow>
        {/if}
    </Card>
{/if}

{#if hasOverlay(platform) && show("match-found")}
    <Card as="section" class="flex flex-col gap-4">
        <SettingRow
            label={t("settings.items.overlay_match_found")}
            for="match-found"
            description={t("settings.notifications.overlay_match_found_description")}
            hint={overlayOffHint("overlay")}
        >
            <Switch
                id="match-found"
                checked={settings.overlay.matchFound}
                onCheckedChange={(v) => settings.setOverlay({ matchFound: v })}
            />
        </SettingRow>
    </Card>
{/if}

{#if hasOverlay(platform) && show("queue-stopped")}
    <Card as="section" class="flex flex-col gap-4">
        <SettingRow
            label={t("settings.items.overlay_queue_stopped")}
            for="queue-stopped"
            description={t("settings.notifications.overlay_queue_stopped_description")}
            hint={overlayOffHint("overlay")}
        >
            <Switch
                id="queue-stopped"
                checked={settings.overlay.queueStopped}
                onCheckedChange={(v) => settings.setOverlay({ queueStopped: v })}
            />
        </SettingRow>
    </Card>
{/if}
