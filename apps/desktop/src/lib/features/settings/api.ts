import { restartAfterSaves } from "$lib/core/exit";
import { command, listen, type Unlisten } from "$lib/core/tauri";
import type { AppInfo } from "@deadlock-plus/ipc-types/AppInfo";
import type { AutostartStatus } from "@deadlock-plus/ipc-types/AutostartStatus";
import type { NotificationSettings } from "@deadlock-plus/ipc-types/NotificationSettings";
import type { OverlaySettings } from "@deadlock-plus/ipc-types/OverlaySettings";
import type { OverlayStatus } from "@deadlock-plus/ipc-types/OverlayStatus";
import type { MaintenanceSchedule } from "./maintenance";

export function getAppInfo() {
    return command<AppInfo>("app_info");
}

export function getAutostart() {
    return command<AutostartStatus>("autostart_status");
}

export function setAutostart(enabled: boolean) {
    return command<AutostartStatus>("set_autostart", { enabled });
}

export function nextMaintenance() {
    return command<number>("next_maintenance");
}

export function setAlertsEnabled(enabled: boolean) {
    return command("set_alerts_enabled", { enabled });
}

export function setMaintenanceSchedule(schedule: MaintenanceSchedule) {
    return command("set_maintenance_schedule", { schedule });
}

export function setOverlaySettings(settings: OverlaySettings) {
    return command("set_overlay_settings", { settings });
}

export function setNotificationSettings(settings: NotificationSettings) {
    return command("set_notification_settings", { settings });
}

export function setUiScale(percent: number) {
    return command("set_ui_scale", { percent });
}

export function setWindowTheme(theme: string, variant?: string) {
    return command("set_window_theme", { theme, variant: variant ?? null });
}

export function showOverlayTest() {
    return command("show_overlay_test");
}

export function overlayStatus() {
    return command<OverlayStatus>("overlay_status");
}

export const onOverlayStatus = (handler: (status: OverlayStatus) => void): Promise<Unlisten> =>
    listen<OverlayStatus>("overlay://status", handler);

export function setCloseToTray(enabled: boolean) {
    return command("set_close_to_tray", { enabled });
}

export function setOpenOnGameStart(enabled: boolean) {
    return command("set_open_on_game_start", { enabled });
}

export function restartApp() {
    return restartAfterSaves();
}

export function setIngestEnabled(enabled: boolean) {
    return command("set_ingest_enabled", { enabled });
}

export function setGcRecoveryEnabled(enabled: boolean) {
    return command("set_gc_recovery_enabled", { enabled });
}
