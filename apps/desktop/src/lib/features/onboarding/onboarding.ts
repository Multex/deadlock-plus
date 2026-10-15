import { t } from "$lib/core/i18n.svelte";
import { platformName, type Platform } from "$lib/core/platform";
import type { PresenceSettings } from "@deadlock-plus/ipc-types/PresenceSettings";

export const ONBOARDING_VERSION = 2;

export interface GameStatus {
    found: boolean;
    path: string | null;
}

export type StepId = "welcome" | "features" | "permissions" | "steam" | "sharing" | "extras" | "done";

export interface Step {
    id: StepId;
    title: string;
}

export interface FeatureBlurb {
    id: string;
    blurb: string;
}

export interface FeatureGroup {
    id: string;
    title: string;
    items: FeatureBlurb[];
}

export type IngestChoice = "share" | "decline";

export interface Extras {
    autostart: boolean;
    closeToTray: boolean;
    updateAlerts: boolean;
    maintenance: boolean;
    gcRecovery: boolean;
    showOnDiscord: boolean;
}

export function defaultExtras(): Extras {
    return {
        autostart: false,
        closeToTray: false,
        updateAlerts: false,
        maintenance: false,
        gcRecovery: false,
        showOnDiscord: false,
    };
}

/** Detailed, because it is the level that shows the hero, mode and rank the switch promises. */
export function extrasPresence(extras: Extras): Pick<PresenceSettings, "level"> | null {
    return extras.showOnDiscord ? { level: "detailed" } : null;
}

export function featureGroups(): FeatureGroup[] {
    return [
        {
            id: "play",
            title: t("onboarding.groups.play"),
            items: [
                { id: "server-picker", blurb: t("onboarding.blurbs.server_picker") },
                { id: "live", blurb: t("onboarding.blurbs.live") },
                { id: "presence", blurb: t("onboarding.blurbs.presence") },
            ],
        },
        {
            id: "progress",
            title: t("onboarding.groups.progress"),
            items: [{ id: "stats", blurb: t("onboarding.blurbs.stats") }],
        },
        {
            id: "news",
            title: t("onboarding.groups.news"),
            items: [{ id: "alerts", blurb: t("onboarding.blurbs.alerts") }],
        },
        {
            id: "housekeeping",
            title: t("onboarding.groups.housekeeping"),
            items: [
                { id: "voice-bans", blurb: t("onboarding.blurbs.voice_bans") },
                { id: "demos", blurb: t("onboarding.blurbs.demos") },
                { id: "performance", blurb: t("onboarding.blurbs.performance") },
            ],
        },
    ];
}

export function needsOnboarding(stored: number | null | undefined): boolean {
    return typeof stored !== "number" || stored < ONBOARDING_VERSION;
}

export function isReturningUser(legacyDone: boolean | null | undefined): boolean {
    return legacyDone === true;
}

export function gameStatus(gameDir: string | null | undefined): GameStatus {
    return gameDir ? { found: true, path: gameDir } : { found: false, path: null };
}

export function stepsFor(platform: Platform): Step[] {
    const permissions =
        platform === "windows"
            ? t("onboarding.permissions.windows_title")
            : t("onboarding.permissions.other_title", { platform: platformName(platform) });
    return [
        { id: "welcome", title: t("onboarding.welcome.step_title") },
        { id: "features", title: t("onboarding.features.title") },
        { id: "permissions", title: permissions },
        { id: "steam", title: t("onboarding.steam.title") },
        { id: "sharing", title: t("onboarding.sharing.title") },
        { id: "extras", title: t("onboarding.extras.title") },
        { id: "done", title: t("onboarding.done.step_title") },
    ];
}

export function nextStep(index: number, count: number): number {
    return Math.min(index + 1, count - 1);
}

export function previousStep(index: number): number {
    return Math.max(index - 1, 0);
}

export async function finishOnboarding(write: (version: number) => Promise<void>): Promise<void> {
    try {
        await write(ONBOARDING_VERSION);
    } catch {
        // It will just show again next launch.
    }
}

/** `null` means the user skipped the step: consent stays unanswered. */
export function ingestDecision(choice: IngestChoice | null): boolean | null {
    if (choice === null) return null;
    return choice === "share";
}
