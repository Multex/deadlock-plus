import type { Alert } from "@deadlock-plus/ipc-types/Alert";
import type { AppInfo } from "@deadlock-plus/ipc-types/AppInfo";
import type { AppNotification } from "@deadlock-plus/ipc-types/AppNotification";
import type { AutostartStatus } from "@deadlock-plus/ipc-types/AutostartStatus";
import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";
import type { IngestStatus } from "@deadlock-plus/ipc-types/IngestStatus";
import type { JobsSnapshot } from "@deadlock-plus/ipc-types/JobsSnapshot";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { LiveState } from "@deadlock-plus/ipc-types/LiveState";
import type { MaintenanceSchedule } from "@deadlock-plus/ipc-types/MaintenanceSchedule";
import type { PresenceConfig } from "@deadlock-plus/ipc-types/PresenceConfig";
import type { PresenceSample } from "@deadlock-plus/ipc-types/PresenceSample";
import type { PresenceSettings } from "@deadlock-plus/ipc-types/PresenceSettings";
import type { PresenceStateId } from "@deadlock-plus/ipc-types/PresenceStateId";
import type { PresenceStatus } from "@deadlock-plus/ipc-types/PresenceStatus";
import type { PresenceVariantId } from "@deadlock-plus/ipc-types/PresenceVariantId";
import type { SteamAccount } from "@deadlock-plus/ipc-types/SteamAccount";

import type { Handlers } from "../../backend";
import type { Identity, Module } from "../../scenario";
import { PRESENCE_DEFAULTS, PRESENCE_LAYOUT, PRESENCE_PLACEHOLDERS, presencePreview } from "./presence";

export interface ShellOptions {
    /** Version the app reports as its own. */
    appVersion: string;
    /** The app's changelog, as Markdown. */
    changelog: string;
}

const HOUR_S = 3600;
const DAY_MS = 24 * HOUR_S * 1000;
const STEAM_DIR = "C:\\Program Files (x86)\\Steam";

export const OS = "Windows 11 Pro";
export const ARCH = "x86_64";
export const WEBVIEW = "141.0.3537.71";
export const GAME_DIR = `${STEAM_DIR}\\steamapps\\common\\Deadlock`;
export const GAME_CLIENT_VERSION = "6712";

const account = ({ steamId64, accountId, persona }: Identity): SteamAccount => ({
    steamId64,
    steamId32: accountId,
    personaName: persona,
    avatarDataUrl: null,
    userdataDir: `${STEAM_DIR}\\userdata\\${accountId}`,
});

const appInfo = (appVersion: string, { persona }: Identity): AppInfo => ({
    appVersion,
    tauriVersion: "2.11.6",
    webviewVersion: WEBVIEW,
    os: OS,
    arch: ARCH,
    debugBuild: false,
    elevated: false,
    dataDir: `C:\\Users\\${persona}\\AppData\\Roaming\\app.deadlockplus`,
    gameDir: GAME_DIR,
    gameBuild: {
        clientVersion: GAME_CLIENT_VERSION,
        sourceRevision: "11052340",
        versionDate: "Oct 08 2026",
        versionTime: "10:42:17",
    },
});

const INGEST: IngestStatus = { running: true, steamFound: true, submitted: 1284, lastError: null };
const GC: GcStatus = { running: true, accounts: 1, delivered: 37, lastError: null };
const AUTOSTART: AutostartStatus = { supported: true, enabled: true, stale: false };

const PRESENCE: PresenceSettings = {
    level: "basic",
    clients: ["stable", "ptb", "canary", "other"],
    supportButton: true,
};
const PRESENCE_STATUS: PresenceStatus = {
    running: true,
    clients: [{ kind: "stable", pipeIndex: 0, connected: true }],
};
const PRESENCE_UNEDITED: PresenceConfig = { states: {}, variants: {}, heroes: {} };

/** Reads an exported presence layout back, refusing anything that is not a JSON object as the app does. */
function parsePresenceConfig(text: string): PresenceConfig {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("expected a JSON object");
    return value as PresenceConfig;
}

const MAINTENANCE: MaintenanceSchedule = { enabled: true, weekday: 2, minuteOfDay: 0, leadMinutes: 30 };
const DAYS_TO_MAINTENANCE = 2;

/** Midnight UTC, `DAYS_TO_MAINTENANCE` days after the day of `now`. */
function nextMaintenanceS(now: number): number {
    const day = new Date(now);
    return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + DAYS_TO_MAINTENANCE) / 1000;
}

type JobEntry = JobsSnapshot["catalog"][number];

const JOBS: JobsSnapshot = {
    catalog: [
        { id: "addon-scan", policy: "pauseInGame", policyConfigurable: true, enabled: true },
        { id: "patch-notes-index", policy: "pauseInGame", policyConfigurable: true, enabled: true },
        { id: "server-block-sync", policy: "always", policyConfigurable: false, enabled: true },
    ],
    jobs: [],
    gameRunning: false,
    allEnabled: true,
    pauseInGame: true,
};

const LIVE_STATE: LiveState = { phase: "gameClosed", matchPresent: false };
const LIVE_MATCH: LiveMatch = {
    clockSecs: null,
    paused: false,
    matchMode: null,
    gameMode: null,
    perspective: "unknown",
    yourSide: null,
    teams: [],
    queue: null,
};

type AlertSeed = [daysAgo: number, source: string, kind: string, title: string, summary: string];

const ALERT_SEEDS: AlertSeed[] = [
    [1, "forum", "Minor Update", "Gameplay update", "Balance adjustments to several heroes and items."],
    [5, "steam", "Patch notes", "Matchmaking update", "Changes to queue times and party matchmaking."],
    [9, "forum", "Minor Update", "Stability update", "Fixes for crashes and a number of visual issues."],
    [16, "steam", "Major Update", "Map and objectives update", "A reworked mid lane and new neutral camps."],
    [23, "forum", "Patch notes", "Hero balance update", "Tuning for abilities across the roster."],
];

const alerts = (now: number): Alert[] =>
    ALERT_SEEDS.map(([daysAgo, source, kind, title, summary], i) => ({
        id: `demo-alert-${ALERT_SEEDS.length - i}`,
        title,
        link: "",
        source,
        published: new Date(now - daysAgo * DAY_MS).toISOString(),
        kind,
        summary,
        image: null,
        read: true,
    }));

const notifications = (nowS: number): AppNotification[] => [
    {
        id: "demo-notification-2",
        kind: "alert",
        key: "notifications.alert_new",
        params: { title: ALERT_SEEDS[0]![3] },
        title: null,
        body: null,
        timestamp: nowS - 22 * HOUR_S,
        read: true,
        link: "/alerts",
    },
    {
        id: "demo-notification-1",
        kind: "servers",
        key: "notifications.server_blocks_updated",
        params: { servers: "Frankfurt, Stockholm" },
        title: null,
        body: null,
        timestamp: nowS - 3 * 24 * HOUR_S,
        read: true,
        link: "/server-picker",
    },
];

const SETTERS = [
    "frontend_ready",
    "set_update_badge",
    "set_language",
    "track_feature",
    "track_discord_invite",
    "reset_telemetry_id",
    "set_telemetry_settings",
    "set_ingest_enabled",
    "set_gc_recovery_enabled",
    "set_close_to_tray",
    "set_maintenance_schedule",
    "set_alerts_enabled",
    "set_presence_settings",
    "set_presence_art",
    "force_run_job",
    "refresh_alerts",
    "mark_alerts_read",
    "mark_notifications_read",
    "mark_notification_read",
    "dismiss_crash",
    "report_webview_crash",
];

const HEALTH = { services: { clickhouse: true, postgres: true, redis: true } };

export function shellModule({ appVersion, changelog }: ShellOptions): Module {
    return {
        name: "shell",
        create({ identity, now }) {
            const info = appInfo(appVersion, identity);
            const steamAccount = account(identity);
            const alertList = alerts(now);
            const notificationList = notifications(Math.floor(now / 1000));
            const nextMaintenance = nextMaintenanceS(now);
            let presenceConfig = PRESENCE_UNEDITED;
            let autostart = AUTOSTART;
            let jobs = JOBS;
            const changeJob = (id: unknown, change: Partial<JobEntry>) => {
                jobs = { ...jobs, catalog: jobs.catalog.map((job) => (job.id === id ? { ...job, ...change } : job)) };
                return null;
            };

            const handlers: Handlers = {
                ...Object.fromEntries(SETTERS.map((name) => [name, () => null])),
                app_info: () => info,
                changelog: () => changelog,
                current_steam_account: () => steamAccount,
                pending_crash: () => null,
                ingest_status: () => INGEST,
                gc_status: () => GC,
                autostart_status: () => autostart,
                set_autostart: (args): AutostartStatus =>
                    (autostart = { ...autostart, enabled: args.enabled === true }),
                next_maintenance: () => nextMaintenance,
                list_alerts: () => alertList,
                list_notifications: () => notificationList,
                search_patch_notes: () => [],
                get_patch_notes: () => null,
                jobs_snapshot: () => jobs,
                set_job_enabled: ({ id, enabled }) => changeJob(id, { enabled: enabled === true }),
                set_job_policy: ({ id, policy }) => changeJob(id, { policy: policy as JobEntry["policy"] }),
                set_all_jobs_enabled: ({ enabled }) => {
                    jobs = { ...jobs, allEnabled: enabled === true };
                    return null;
                },
                set_pause_in_game: ({ enabled }) => {
                    jobs = { ...jobs, pauseInGame: enabled === true };
                    return null;
                },
                is_game_running: () => false,
                get_live_state: () => LIVE_STATE,
                get_live_match: () => LIVE_MATCH,
                presence_status: () => PRESENCE_STATUS,
                presence_config: () => presenceConfig,
                presence_defaults: () => PRESENCE_DEFAULTS,
                set_presence_config: ({ config }) => {
                    presenceConfig = config as PresenceConfig;
                    return null;
                },
                export_presence_config: () => JSON.stringify(presenceConfig, null, 2),
                import_presence_config: ({ text }): PresenceConfig => {
                    presenceConfig = parsePresenceConfig(String(text));
                    return presenceConfig;
                },
                presence_layout: () => PRESENCE_LAYOUT,
                presence_placeholders: () => PRESENCE_PLACEHOLDERS,
                presence_preview: ({ config, state, variant, heroId, sample }) =>
                    presencePreview(
                        config as PresenceConfig,
                        state as PresenceStateId,
                        (variant ?? null) as PresenceVariantId | null,
                        (heroId ?? null) as number | null,
                        (sample ?? null) as PresenceSample | null,
                    ),
                // Empty local game data makes the hero and rank lookups use the public Deadlock API instead.
                game_heroes: () => [],
                game_rank_art: () => [],
            };

            return {
                handlers,
                kv: {
                    "app-settings": {
                        onboardingVersion: 2,
                        lastSeenVersion: appVersion,
                        matchIngest: true,
                        gcRecovery: true,
                        telemetry: true,
                        telemetryNoticeShown: true,
                        closeToTray: true,
                        updateAlerts: true,
                        maintenanceSchedule: MAINTENANCE,
                        discordPresence: PRESENCE,
                    },
                },
                routes: [[/^\/v1\/info\/health$/, () => HEALTH]],
            };
        },
    };
}
