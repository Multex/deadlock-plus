import {
    setAlertsEnabled,
    setCloseToTray,
    setGcRecoveryEnabled,
    setIngestEnabled,
    setMaintenanceSchedule,
    setNotificationSettings,
    setOpenOnGameStart,
    setOverlaySettings,
    setUiScale,
} from "./api";
import { kvGet, kvSet } from "$lib/core/kv";
import { setPresenceArt, setPresenceSettings } from "$lib/features/presence/api";
import { loadHeroes, onHeroesRefreshed } from "$lib/features/heroes/heroes";
import { DEFAULT_PRESENCE, heroArtMap, patchPresence, resolvePresence } from "$lib/features/presence/presence";
import { loadRankNames } from "$lib/features/ranks/ranks";
import type { PresenceSettings } from "@deadlock-plus/ipc-types/PresenceSettings";
import { i18n } from "$lib/core/i18n.svelte";
import { resolveTelemetry, shouldSend } from "$lib/features/telemetry/consent";
import { resetTelemetryId, setTelemetrySettings } from "$lib/features/telemetry/api";
import { resolveIngestConsent } from "./ingest-consent";
import { DEFAULT_SCHEDULE, type MaintenanceSchedule } from "./maintenance";
import {
    DEFAULT_NOTIFICATIONS,
    resolveNotifications,
    type Delivery,
    type NotificationSettings,
    type NotificationTopic,
} from "./notification-topics";
import {
    DEFAULT_FRONT_PAGE_MODES,
    frontPageModeChanges,
    resolveFrontPageModes,
    type FrontPageModes,
} from "./front-page-modes";
import type { RowMode } from "@deadlock-plus/match/list";
import { DEFAULT_UI_SCALE, resolveHardwareAcceleration, resolveUiScale } from "./app-window";
import { DEFAULT_OVERLAY, resolveOverlay, type OverlaySettings } from "./overlay";
import { initialTheme, resolveMotionPreference, resolveTheme, type MotionPreference, type ThemeId } from "./themes";
import {
    initialThemeOptions,
    resolveThemeOptions,
    withAccent,
    withLayer,
    withNamedAccent,
    withVariant,
    type Accent,
    type ThemeOptions,
} from "./theme-options";

const STORE = "app-settings";
const ACCESSIBLE_FONT_KEY = "accessibleFont";
const THEME_EFFECTS_KEY = "themeEffects";
const THEME_OPTIONS_KEY = "themeOptions";
const INGEST_KEY = "matchIngest";
const GC_RECOVERY_KEY = "gcRecovery";
const CLOSE_TO_TRAY_KEY = "closeToTray";
const OPEN_ON_GAME_START_KEY = "openOnGameStart";
const MAINTENANCE_KEY = "maintenanceSchedule";
const ALERTS_KEY = "updateAlerts";
const OVERLAY_KEY = "overlay";
const NOTIFICATIONS_KEY = "notifications";
const BREAK_HINT_KEY = "breakHint";
const FRONT_PAGE_KEY = "frontPageAfterMatch";
const FRONT_PAGE_MODES_KEY = "frontPageModes";
const FRONT_PAGE_ALERT_KEY = "frontPageOverlayAlert";
const DISPATCH_ALERTS_KEY = "dispatchAlerts";
const THEME_KEY = "theme";
const MOTION_KEY = "motion";
const AUTO_UPDATE_KEY = "autoUpdateCheck";
const PRESENCE_KEY = "discordPresence";
const TELEMETRY_KEY = "telemetry";
const TELEMETRY_NOTICE_KEY = "telemetryNoticeShown";
// The backend reads these two from the store itself at startup, before the window exists.
const UI_SCALE_KEY = "uiScale";
const HARDWARE_ACCELERATION_KEY = "hardwareAcceleration";

// Each key is read on its own so one unreadable value keeps its default without discarding the rest.
async function stored<T>(key: string): Promise<T | undefined> {
    try {
        return (await kvGet<T>(STORE, key)) ?? undefined;
    } catch {
        return undefined;
    }
}

class Settings {
    accessibleFont = $state(false);
    themeEffects = $state(true);
    themeOptions = $state<ThemeOptions>(initialThemeOptions(globalThis.document?.documentElement));
    theme = $state<ThemeId>(initialTheme(globalThis.document?.documentElement));
    motion = $state<MotionPreference>("system");
    matchIngest = $state(false);
    ingestPromptPending = $state(false);
    telemetry = $state(true);
    telemetryNoticeShown = $state(false);
    gcRecovery = $state(false);
    closeToTray = $state(false);
    openOnGameStart = $state(false);
    maintenance = $state<MaintenanceSchedule>({ ...DEFAULT_SCHEDULE });
    updateAlerts = $state(false);
    overlay = $state<OverlaySettings>({ ...DEFAULT_OVERLAY });
    notifications = $state(resolveNotifications(DEFAULT_NOTIFICATIONS));
    breakHint = $state(false);
    frontPageAfterMatch = $state(true);
    frontPageModes = $state<FrontPageModes>({ ...DEFAULT_FRONT_PAGE_MODES });
    frontPageOverlayAlert = $state(true);
    dispatchAlerts = $state(true);
    autoUpdateCheck = $state(true);
    presence = $state<PresenceSettings>(resolvePresence(DEFAULT_PRESENCE));
    uiScale = $state(DEFAULT_UI_SCALE);
    hardwareAcceleration = $state(true);
    /** What the running webview was built with; a change only takes effect after a restart. */
    hardwareAccelerationAtLaunch = $state(true);

    private resolveReady: () => void = () => {};
    ready = new Promise<void>((resolve) => (this.resolveReady = resolve));

    async init() {
        onHeroesRefreshed(() => void this.applyPresence());
        this.accessibleFont = (await stored<boolean>(ACCESSIBLE_FONT_KEY)) ?? false;
        this.themeEffects = (await stored<boolean>(THEME_EFFECTS_KEY)) ?? true;
        this.themeOptions = resolveThemeOptions(await stored<unknown>(THEME_OPTIONS_KEY));
        try {
            const consent = resolveIngestConsent(await kvGet<boolean>(STORE, INGEST_KEY));
            this.matchIngest = consent.enabled;
            this.ingestPromptPending = consent.needsPrompt;
        } catch {
            // An unreadable answer must not re-ask the question: stay off and silent.
        }
        const telemetry = resolveTelemetry(
            await stored<boolean>(TELEMETRY_KEY),
            await stored<boolean>(TELEMETRY_NOTICE_KEY),
        );
        this.telemetry = telemetry.enabled;
        this.telemetryNoticeShown = telemetry.noticeShown;
        this.gcRecovery = (await stored<boolean>(GC_RECOVERY_KEY)) ?? false;
        this.closeToTray = (await stored<boolean>(CLOSE_TO_TRAY_KEY)) ?? false;
        this.openOnGameStart = (await stored<boolean>(OPEN_ON_GAME_START_KEY)) ?? false;
        const schedule = await stored<Partial<MaintenanceSchedule>>(MAINTENANCE_KEY);
        this.maintenance = { ...DEFAULT_SCHEDULE, ...schedule };
        this.updateAlerts = (await stored<boolean>(ALERTS_KEY)) ?? false;
        this.overlay = resolveOverlay(await stored<unknown>(OVERLAY_KEY));
        this.notifications = resolveNotifications(await stored<unknown>(NOTIFICATIONS_KEY));
        this.breakHint = (await stored<boolean>(BREAK_HINT_KEY)) ?? false;
        const frontPage = await stored<unknown>(FRONT_PAGE_KEY);
        this.frontPageAfterMatch = typeof frontPage === "boolean" ? frontPage : true;
        this.frontPageModes = resolveFrontPageModes(await stored<unknown>(FRONT_PAGE_MODES_KEY));
        this.frontPageOverlayAlert = (await stored<boolean>(FRONT_PAGE_ALERT_KEY)) ?? true;
        const dispatchAlerts = await stored<unknown>(DISPATCH_ALERTS_KEY);
        this.dispatchAlerts = typeof dispatchAlerts === "boolean" ? dispatchAlerts : true;
        this.theme = resolveTheme(await stored<string>(THEME_KEY));
        this.motion = resolveMotionPreference(await stored<string>(MOTION_KEY));
        this.autoUpdateCheck = (await stored<boolean>(AUTO_UPDATE_KEY)) ?? true;
        this.presence = resolvePresence(await stored<unknown>(PRESENCE_KEY));
        this.uiScale = resolveUiScale(await stored<unknown>(UI_SCALE_KEY));
        this.hardwareAcceleration = resolveHardwareAcceleration(await stored<unknown>(HARDWARE_ACCELERATION_KEY));
        this.hardwareAccelerationAtLaunch = this.hardwareAcceleration;
        await this.applyIngest();
        await this.applyTelemetry();
        await this.applyGcRecovery();
        await this.applyCloseToTray();
        await this.applyOpenOnGameStart();
        await this.applyMaintenance();
        await this.applyUpdateAlerts();
        await this.applyOverlay();
        await this.applyNotifications();
        await this.applyPresence();
        this.resolveReady();
    }

    private async applyPresence() {
        try {
            await setPresenceSettings($state.snapshot(this.presence));
            if (this.presence.level === "detailed") {
                const [heroes, ranks] = await Promise.all([loadHeroes(), loadRankNames()]);
                await setPresenceArt(heroArtMap(heroes), ranks);
            }
        } catch {
            // Not running inside Tauri.
        }
    }

    async setPresence(patch: Partial<PresenceSettings>) {
        this.presence = patchPresence(this.presence, patch);
        await this.applyPresence();
        try {
            await kvSet(STORE, PRESENCE_KEY, $state.snapshot(this.presence));
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    private async applyUpdateAlerts() {
        try {
            await setAlertsEnabled(this.updateAlerts);
        } catch {
            // Not running inside Tauri.
        }
    }

    async setUpdateAlerts(value: boolean) {
        this.updateAlerts = value;
        await this.applyUpdateAlerts();
        try {
            await kvSet(STORE, ALERTS_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    private async applyOverlay() {
        try {
            await setOverlaySettings($state.snapshot(this.overlay));
        } catch {
            // Not running inside Tauri.
        }
    }

    async setOverlay(patch: Partial<OverlaySettings>) {
        this.overlay = { ...this.overlay, ...patch };
        await this.applyOverlay();
        try {
            await kvSet(STORE, OVERLAY_KEY, $state.snapshot(this.overlay));
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    private async applyNotifications() {
        try {
            await setNotificationSettings($state.snapshot(this.notifications));
        } catch {
            // Not running inside Tauri.
        }
    }

    async setNotifications(patch: Partial<Omit<NotificationSettings, "deliveries">>) {
        this.notifications = { ...this.notifications, ...patch };
        await this.applyNotifications();
        try {
            await kvSet(STORE, NOTIFICATIONS_KEY, $state.snapshot(this.notifications));
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setDelivery(topic: NotificationTopic, delivery: Delivery) {
        this.notifications = {
            ...this.notifications,
            deliveries: { ...this.notifications.deliveries, [topic]: delivery },
        };
        await this.applyNotifications();
        try {
            await kvSet(STORE, NOTIFICATIONS_KEY, $state.snapshot(this.notifications));
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setTheme(value: ThemeId) {
        this.theme = value;
        try {
            await kvSet(STORE, THEME_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setMotion(value: MotionPreference) {
        this.motion = value;
        try {
            await kvSet(STORE, MOTION_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setAutoUpdateCheck(value: boolean) {
        this.autoUpdateCheck = value;
        try {
            await kvSet(STORE, AUTO_UPDATE_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setBreakHint(value: boolean) {
        this.breakHint = value;
        try {
            await kvSet(STORE, BREAK_HINT_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setFrontPageAfterMatch(value: boolean) {
        this.frontPageAfterMatch = value;
        try {
            await kvSet(STORE, FRONT_PAGE_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setFrontPageMode(mode: RowMode, on: boolean) {
        this.frontPageModes = { ...this.frontPageModes, [mode]: on };
        try {
            await kvSet(STORE, FRONT_PAGE_MODES_KEY, frontPageModeChanges(this.frontPageModes));
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setFrontPageOverlayAlert(value: boolean) {
        this.frontPageOverlayAlert = value;
        try {
            await kvSet(STORE, FRONT_PAGE_ALERT_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setDispatchAlerts(value: boolean) {
        this.dispatchAlerts = value;
        try {
            await kvSet(STORE, DISPATCH_ALERTS_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    private async applyMaintenance() {
        try {
            await setMaintenanceSchedule($state.snapshot(this.maintenance));
        } catch {
            // Not running inside Tauri.
        }
    }

    async setMaintenance(patch: Partial<MaintenanceSchedule>) {
        this.maintenance = { ...this.maintenance, ...patch };
        await this.applyMaintenance();
        try {
            await kvSet(STORE, MAINTENANCE_KEY, $state.snapshot(this.maintenance));
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    private async applyCloseToTray() {
        try {
            await setCloseToTray(this.closeToTray);
        } catch {
            // Not running inside Tauri.
        }
    }

    async setCloseToTray(value: boolean) {
        this.closeToTray = value;
        await this.applyCloseToTray();
        try {
            await kvSet(STORE, CLOSE_TO_TRAY_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    private async applyOpenOnGameStart() {
        try {
            await setOpenOnGameStart(this.openOnGameStart);
        } catch {
            // Not running inside Tauri.
        }
    }

    async setOpenOnGameStart(value: boolean) {
        this.openOnGameStart = value;
        await this.applyOpenOnGameStart();
        try {
            await kvSet(STORE, OPEN_ON_GAME_START_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    private async applyIngest() {
        try {
            await setIngestEnabled(this.matchIngest);
        } catch {
            // Not running inside Tauri.
        }
    }

    private async applyTelemetry() {
        try {
            const send = shouldSend({ enabled: this.telemetry, noticeShown: this.telemetryNoticeShown });
            await setTelemetrySettings(send, i18n.locale);
        } catch {
            // Not running inside Tauri.
        }
    }

    async setTelemetry(value: boolean) {
        this.telemetry = value;
        await this.applyTelemetry();
        try {
            await kvSet(STORE, TELEMETRY_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    /** Called once the user has been told about telemetry; nothing is sent before this. */
    async markTelemetryNoticeShown() {
        if (this.telemetryNoticeShown) return;
        this.telemetryNoticeShown = true;
        try {
            await kvSet(STORE, TELEMETRY_NOTICE_KEY, true);
        } catch {
            // The notice may show again next launch.
        }
        await this.applyTelemetry();
    }

    async resetTelemetryId() {
        await resetTelemetryId();
    }

    private async applyGcRecovery() {
        try {
            await setGcRecoveryEnabled(this.gcRecovery);
        } catch {
            // Not running inside Tauri.
        }
    }

    async setGcRecovery(value: boolean) {
        this.gcRecovery = value;
        await this.applyGcRecovery();
        try {
            await kvSet(STORE, GC_RECOVERY_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setMatchIngest(value: boolean) {
        this.matchIngest = value;
        this.ingestPromptPending = false;
        await this.applyIngest();
        try {
            await kvSet(STORE, INGEST_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setUiScale(value: number) {
        this.uiScale = resolveUiScale(value);
        try {
            await setUiScale(this.uiScale);
        } catch {
            // Not running inside Tauri.
        }
        try {
            await kvSet(STORE, UI_SCALE_KEY, this.uiScale);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setHardwareAcceleration(value: boolean) {
        this.hardwareAcceleration = value;
        try {
            await kvSet(STORE, HARDWARE_ACCELERATION_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setThemeEffects(value: boolean) {
        this.themeEffects = value;
        try {
            await kvSet(STORE, THEME_EFFECTS_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setThemeLayer(theme: ThemeId, layer: string, on: boolean) {
        await this.saveThemeOptions(withLayer(this.themeOptions, theme, layer, on));
    }

    async setThemeAccent(theme: ThemeId, accent: Accent | null) {
        await this.saveThemeOptions(withAccent(this.themeOptions, theme, accent));
    }

    async setThemeVariant(theme: ThemeId, variant: string) {
        await this.saveThemeOptions(withVariant(this.themeOptions, theme, variant));
    }

    async setThemeNamedAccent(theme: ThemeId, accent: string) {
        await this.saveThemeOptions(withNamedAccent(this.themeOptions, theme, accent));
    }

    private async saveThemeOptions(options: ThemeOptions) {
        this.themeOptions = options;
        try {
            await kvSet(STORE, THEME_OPTIONS_KEY, $state.snapshot(options));
        } catch {
            // The choice just won't persist across restarts.
        }
    }

    async setAccessibleFont(value: boolean) {
        this.accessibleFont = value;
        try {
            await kvSet(STORE, ACCESSIBLE_FONT_KEY, value);
        } catch {
            // The choice just won't persist across restarts.
        }
    }
}

export const settings = new Settings();
