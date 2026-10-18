import { Bell, ChartColumn, Film, Globe, Gauge, History, House, MessageCircle, Swords, VolumeX } from "@lucide/svelte";
import type { Component } from "svelte";
import { installFrontendLogging } from "./logging/frontend";
import { adminAccess } from "./admin-access/admin-access.svelte";
import { apiHealth } from "./api-health/health.svelte";
import { alerts } from "./alerts/alerts.svelte";
import { connectivity } from "./connectivity/online.svelte";
import { gameArt } from "./gamedata/art-refresh";
import { gcStatus } from "./gc/status.svelte";
import { ingestStatus } from "./ingest/status.svelte";
import { jobs } from "./jobs/jobs.svelte";
import { grades } from "./live/grades.svelte";
import { lobbyRanks } from "./live/lobby-ranks.svelte";
import { live } from "./live/live.svelte";
import { startBreakReminder } from "./match-history/break-reminder.svelte";
import { presenceStatus } from "./presence/status.svelte";
import { notifications } from "./notifications/notifications.svelte";
import { onboarding } from "./onboarding/onboarding.svelte";
import { performanceScan } from "./performance/scan.svelte";
import { settings } from "./settings/settings.svelte";
import { nudgeOnLaunch } from "./support/nudge";
import { noticeOnLaunch } from "./telemetry/notice";
import { steamAccount } from "./steam-account/account.svelte";
import { t } from "$lib/core/i18n.svelte";
import { checkOnLaunch, startBackgroundUpdateChecks } from "./updates/launch-check";
import { whatsNew } from "./updates/whats-new.svelte";

export interface FeatureNavEntry {
    id: string;
    label: string;
    href: string;
    description: string;
    icon: Component<{ class?: string }>;
    /** Count shown as a dot on the nav link while above zero. */
    badge?: () => number;
    /** Occasional tools, listed after the main entries in a collapsible sidebar group. */
    group?: "tools";
}

export const HOME_ENTRY: FeatureNavEntry = {
    id: "home",
    get label() {
        return t("shell.nav.home");
    },
    href: "/",
    get description() {
        return t("shell.nav_description.home");
    },
    icon: House,
};

/**
 * Every top-level feature registers itself here so the app shell's nav stays
 * data-driven. Adding a new feature = a route under src/routes/<id> + an entry here.
 */
export const FEATURES: FeatureNavEntry[] = [
    {
        id: "server-picker",
        get label() {
            return t("shell.nav.server_picker");
        },
        href: "/server-picker",
        get description() {
            return t("shell.nav_description.server_picker");
        },
        icon: Globe,
    },
    {
        id: "live",
        get label() {
            return t("shell.nav.live");
        },
        href: "/live",
        get description() {
            return t("shell.nav_description.live");
        },
        icon: Swords,
    },
    {
        id: "stats",
        get label() {
            return t("shell.nav.stats");
        },
        href: "/stats",
        get description() {
            return t("shell.nav_description.stats");
        },
        icon: ChartColumn,
    },
    {
        id: "match-history",
        get label() {
            return t("shell.nav.match_history");
        },
        href: "/match-history",
        get description() {
            return t("shell.nav_description.match_history");
        },
        icon: History,
    },
    {
        id: "alerts",
        get label() {
            return t("shell.nav.alerts");
        },
        href: "/alerts",
        get description() {
            return t("shell.nav_description.alerts");
        },
        icon: Bell,
        badge: () => alerts.unread,
    },
    {
        id: "presence",
        get label() {
            return t("shell.nav.presence");
        },
        href: "/presence",
        get description() {
            return t("shell.nav_description.presence");
        },
        icon: MessageCircle,
    },
    {
        id: "performance",
        get label() {
            return t("shell.nav.performance");
        },
        href: "/performance",
        get description() {
            return t("shell.nav_description.performance");
        },
        icon: Gauge,
        group: "tools",
    },
    {
        id: "voice-bans",
        get label() {
            return t("shell.nav.voice_bans");
        },
        href: "/voice-bans",
        get description() {
            return t("shell.nav_description.voice_bans");
        },
        icon: VolumeX,
        group: "tools",
    },
    {
        id: "demos",
        get label() {
            return t("shell.nav.demos");
        },
        href: "/demos",
        get description() {
            return t("shell.nav_description.demos");
        },
        icon: Film,
        group: "tools",
    },
];

/** Sidebar order, tools last; Ctrl/Cmd+1..9 jump to the first nine. */
export const NAV_ENTRIES: FeatureNavEntry[] = [HOME_ENTRY, ...FEATURES];

/** Started in order when the app mounts; a returned function stops the service. */
export type Service = () => void | (() => void);

export const SERVICES: Service[] = [
    installFrontendLogging,
    () => {
        void settings.init();
    },
    () => ingestStatus.start(),
    () => gcStatus.start(),
    () => apiHealth.start(),
    () => steamAccount.start(),
    () => alerts.start(),
    () => notifications.start(),
    () => jobs.start(),
    () => performanceScan.start(),
    () => connectivity.start(),
    () => gameArt.start(),
    () => live.start(),
    () => grades.start(),
    () => lobbyRanks.start(),
    () => adminAccess.start(),
    () => presenceStatus.start(),
    startBreakReminder,
    () => {
        void onboarding.init();
    },
    () => {
        void whatsNew.init();
    },
    () => void checkOnLaunch(),
    () => {
        void noticeOnLaunch();
    },
    () => nudgeOnLaunch(),
    startBackgroundUpdateChecks,
];

export { isActivePath } from "./home/home";
export { apiHealth, gcStatus, ingestStatus, jobs, live, performanceScan, presenceStatus, settings };
export { jobPercent, jobStatusText } from "./jobs/jobs";
export { recoveryBarItem } from "./gc/recovery-bar";
export { discordBarState } from "./presence/presence";
export { liveBarItem } from "./live/live";
export { isLightTheme, resolveReducedMotion } from "./settings/themes";
export { getAppInfo } from "./settings/about";
export { updater } from "./updates/updater.svelte";
export { default as NotificationCenter } from "./notifications/components/notification-center.svelte";
