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
import { settingSaveFailed } from "./save-failed";
import { setPresenceArt, setPresenceSettings } from "$lib/features/presence/api";
import { loadHeroes, onHeroesRefreshed } from "$lib/features/heroes/heroes";
import { DEFAULT_PRESENCE, heroArtMap, patchPresence, resolvePresence } from "$lib/features/presence/presence";
import { loadRankNames } from "$lib/features/ranks/ranks";
import type { PresenceSettings } from "@deadlock-plus/ipc-types/PresenceSettings";
import { toast } from "svelte-sonner";
import { failureText } from "$lib/core/errors";
import { i18n, t } from "$lib/core/i18n.svelte";
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
import { DEFAULT_UPDATE_CHANNEL, resolveUpdateChannel, type UpdateChannel } from "$lib/features/updates/channel";
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
const UPDATE_CHANNEL_KEY = "updateChannel";
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

// Before Tauri is ready, or with a backend that lacks the command, startup keeps the loaded value.
async function quietly(apply: () => Promise<unknown>) {
    try {
        await apply();
    } catch {
        // Applied again on the next change.
    }
}

type SaveOptions = {
    /** Hands the new value to the backend before it is stored. */
    apply?: () => Promise<unknown>;
    /** What goes into the store, when it is not the field's value itself. */
    stored?: () => unknown;
};

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
    updateChannel = $state<UpdateChannel>(DEFAULT_UPDATE_CHANNEL);
    presence = $state<PresenceSettings>(resolvePresence(DEFAULT_PRESENCE));
    uiScale = $state(DEFAULT_UI_SCALE);
    hardwareAcceleration = $state(true);
    /** What the running webview was built with; a change only takes effect after a restart. */
    hardwareAccelerationAtLaunch = $state(true);

    /** The value each field last saved, so a failed write puts the control back on what is really stored. */
    #saved = new Map<PropertyKey, unknown>();

    private resolveReady: () => void = () => {};
    ready = new Promise<void>((resolve) => (this.resolveReady = resolve));

    async init() {
        this.#saved.clear();
        onHeroesRefreshed(() => void quietly(() => this.applyPresence()));
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
        this.updateChannel = resolveUpdateChannel(await stored<unknown>(UPDATE_CHANNEL_KEY));
        this.presence = resolvePresence(await stored<unknown>(PRESENCE_KEY));
        this.uiScale = resolveUiScale(await stored<unknown>(UI_SCALE_KEY));
        this.hardwareAcceleration = resolveHardwareAcceleration(await stored<unknown>(HARDWARE_ACCELERATION_KEY));
        this.hardwareAccelerationAtLaunch = this.hardwareAcceleration;
        await quietly(() => this.applyIngest());
        await quietly(() => this.applyTelemetry());
        await quietly(() => this.applyGcRecovery());
        await quietly(() => this.applyCloseToTray());
        await quietly(() => this.applyOpenOnGameStart());
        await quietly(() => this.applyMaintenance());
        await quietly(() => this.applyUpdateAlerts());
        await quietly(() => this.applyOverlay());
        await quietly(() => this.applyNotifications());
        await quietly(() => this.applyPresence());
        this.resolveReady();
    }

    /**
     * Shows `next` at once, then applies and stores it. When either step fails the field goes back to
     * the value last saved, the backend is handed that value again, and the player is told.
     */
    private async save<F extends keyof this>(field: F, next: this[F], key: string, options: SaveOptions = {}) {
        if (!this.#saved.has(field)) this.#saved.set(field, $state.snapshot(this[field]));
        this[field] = next;
        try {
            await options.apply?.();
            await kvSet(STORE, key, options.stored ? options.stored() : $state.snapshot(next));
            this.#saved.set(field, $state.snapshot(next));
        } catch (e) {
            this[field] = this.#saved.get(field) as this[F];
            if (options.apply) await quietly(options.apply);
            settingSaveFailed(e);
        }
    }

    private async applyPresence() {
        await setPresenceSettings($state.snapshot(this.presence));
        if (this.presence.level === "detailed") {
            // Art is extra: a lookup that fails leaves the activity without pictures, not unsaved.
            await quietly(async () => {
                const [heroes, ranks] = await Promise.all([loadHeroes(), loadRankNames()]);
                await setPresenceArt(heroArtMap(heroes), ranks);
            });
        }
    }

    setPresence(patch: Partial<PresenceSettings>) {
        return this.save("presence", patchPresence(this.presence, patch), PRESENCE_KEY, {
            apply: () => this.applyPresence(),
        });
    }

    private applyUpdateAlerts() {
        return setAlertsEnabled(this.updateAlerts);
    }

    setUpdateAlerts(value: boolean) {
        return this.save("updateAlerts", value, ALERTS_KEY, { apply: () => this.applyUpdateAlerts() });
    }

    private applyOverlay() {
        return setOverlaySettings($state.snapshot(this.overlay));
    }

    setOverlay(patch: Partial<OverlaySettings>) {
        return this.save("overlay", { ...this.overlay, ...patch }, OVERLAY_KEY, { apply: () => this.applyOverlay() });
    }

    private applyNotifications() {
        return setNotificationSettings($state.snapshot(this.notifications));
    }

    setNotifications(patch: Partial<Omit<NotificationSettings, "deliveries">>) {
        return this.save("notifications", { ...this.notifications, ...patch }, NOTIFICATIONS_KEY, {
            apply: () => this.applyNotifications(),
        });
    }

    setDelivery(topic: NotificationTopic, delivery: Delivery) {
        const next = { ...this.notifications, deliveries: { ...this.notifications.deliveries, [topic]: delivery } };
        return this.save("notifications", next, NOTIFICATIONS_KEY, { apply: () => this.applyNotifications() });
    }

    setTheme(value: ThemeId) {
        return this.save("theme", value, THEME_KEY);
    }

    setMotion(value: MotionPreference) {
        return this.save("motion", value, MOTION_KEY);
    }

    setAutoUpdateCheck(value: boolean) {
        return this.save("autoUpdateCheck", value, AUTO_UPDATE_KEY);
    }

    /** Use `updater.setChannel`, which also checks the new channel. */
    setUpdateChannel(value: UpdateChannel) {
        return this.save("updateChannel", value, UPDATE_CHANNEL_KEY);
    }

    setBreakHint(value: boolean) {
        return this.save("breakHint", value, BREAK_HINT_KEY);
    }

    setFrontPageAfterMatch(value: boolean) {
        return this.save("frontPageAfterMatch", value, FRONT_PAGE_KEY);
    }

    setFrontPageMode(mode: RowMode, on: boolean) {
        const next = { ...this.frontPageModes, [mode]: on };
        return this.save("frontPageModes", next, FRONT_PAGE_MODES_KEY, { stored: () => frontPageModeChanges(next) });
    }

    setFrontPageOverlayAlert(value: boolean) {
        return this.save("frontPageOverlayAlert", value, FRONT_PAGE_ALERT_KEY);
    }

    setDispatchAlerts(value: boolean) {
        return this.save("dispatchAlerts", value, DISPATCH_ALERTS_KEY);
    }

    private applyMaintenance() {
        return setMaintenanceSchedule($state.snapshot(this.maintenance));
    }

    setMaintenance(patch: Partial<MaintenanceSchedule>) {
        return this.save("maintenance", { ...this.maintenance, ...patch }, MAINTENANCE_KEY, {
            apply: () => this.applyMaintenance(),
        });
    }

    private applyCloseToTray() {
        return setCloseToTray(this.closeToTray);
    }

    setCloseToTray(value: boolean) {
        return this.save("closeToTray", value, CLOSE_TO_TRAY_KEY, { apply: () => this.applyCloseToTray() });
    }

    private applyOpenOnGameStart() {
        return setOpenOnGameStart(this.openOnGameStart);
    }

    setOpenOnGameStart(value: boolean) {
        return this.save("openOnGameStart", value, OPEN_ON_GAME_START_KEY, {
            apply: () => this.applyOpenOnGameStart(),
        });
    }

    private applyIngest() {
        return setIngestEnabled(this.matchIngest);
    }

    private applyTelemetry() {
        const send = shouldSend({ enabled: this.telemetry, noticeShown: this.telemetryNoticeShown });
        return setTelemetrySettings(send, i18n.locale);
    }

    setTelemetry(value: boolean) {
        return this.save("telemetry", value, TELEMETRY_KEY, { apply: () => this.applyTelemetry() });
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
        await quietly(() => this.applyTelemetry());
    }

    async resetTelemetryId() {
        try {
            await resetTelemetryId();
            toast.success(t("settings.privacy.telemetry_reset_done"));
        } catch (e) {
            toast.error(failureText(e, t("settings.privacy.telemetry_reset_failed")));
        }
    }

    private applyGcRecovery() {
        return setGcRecoveryEnabled(this.gcRecovery);
    }

    setGcRecovery(value: boolean) {
        return this.save("gcRecovery", value, GC_RECOVERY_KEY, { apply: () => this.applyGcRecovery() });
    }

    setMatchIngest(value: boolean) {
        this.ingestPromptPending = false;
        return this.save("matchIngest", value, INGEST_KEY, { apply: () => this.applyIngest() });
    }

    setUiScale(value: number) {
        return this.save("uiScale", resolveUiScale(value), UI_SCALE_KEY, { apply: () => setUiScale(this.uiScale) });
    }

    setHardwareAcceleration(value: boolean) {
        return this.save("hardwareAcceleration", value, HARDWARE_ACCELERATION_KEY);
    }

    setThemeEffects(value: boolean) {
        return this.save("themeEffects", value, THEME_EFFECTS_KEY);
    }

    setThemeLayer(theme: ThemeId, layer: string, on: boolean) {
        return this.saveThemeOptions(withLayer(this.themeOptions, theme, layer, on));
    }

    setThemeAccent(theme: ThemeId, accent: Accent | null) {
        return this.saveThemeOptions(withAccent(this.themeOptions, theme, accent));
    }

    setThemeVariant(theme: ThemeId, variant: string) {
        return this.saveThemeOptions(withVariant(this.themeOptions, theme, variant));
    }

    setThemeNamedAccent(theme: ThemeId, accent: string) {
        return this.saveThemeOptions(withNamedAccent(this.themeOptions, theme, accent));
    }

    private saveThemeOptions(options: ThemeOptions) {
        return this.save("themeOptions", options, THEME_OPTIONS_KEY);
    }

    setAccessibleFont(value: boolean) {
        return this.save("accessibleFont", value, ACCESSIBLE_FONT_KEY);
    }
}

export const settings = new Settings();
