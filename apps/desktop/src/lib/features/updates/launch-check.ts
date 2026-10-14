import { toast } from "svelte-sonner";
import { t } from "$lib/core/i18n.svelte";
import { createPoller, type PollerEnv } from "$lib/core/poller";
import { getAppInfo } from "$lib/features/settings/about";
import { settings } from "$lib/features/settings/settings.svelte";
import { connectivity } from "$lib/features/connectivity/online.svelte";
import { openSupport } from "$lib/features/support/support";
import { installUpdate, reportUpdateShown, updateBanner } from "./banner.svelte";
import { shouldRecheckOnShow, type InstallSource } from "./nudge";
import { updater } from "./updater.svelte";

/** A release check is one cheap GitHub request; hourly is nowhere near enough traffic to matter. */
const RECHECK_MS = 60 * 60 * 1000;

export interface UpdateCheckDeps {
    now(): number;
    env?: PollerEnv;
    banner: { readonly visible: boolean; refresh(): void; reveal(): void };
    reportShown(version: string): void;
    install(source: InstallSource): unknown;
}

const documentEnv: PollerEnv = {
    isHidden: () => document.visibilityState === "hidden",
    onVisibilityChange: (cb) => {
        document.addEventListener("visibilitychange", cb);
        return () => document.removeEventListener("visibilitychange", cb);
    },
};

export function createUpdateChecks(deps: UpdateCheckDeps) {
    /** Avoids re-toasting the same version on every periodic recheck while the app stays open. */
    let notifiedVersion: string | null = null;
    let lastCheckAt: number | null = null;

    async function attemptCheck() {
        await settings.ready;
        if (!settings.autoUpdateCheck || !connectivity.online) return;
        try {
            if ((await getAppInfo()).debugBuild) return;
        } catch {
            return;
        }
        lastCheckAt = deps.now();
        const found = await updater.check();
        deps.banner.refresh();
        const version = updater.version;
        if (!found || !version || version === notifiedVersion) return;
        notifiedVersion = version;
        if (deps.banner.visible) return;
        toast(t("updates.toast_available", { version }), {
            duration: 15000,
            action: { label: t("settings.about_page.install", { version }), onClick: () => void deps.install("toast") },
            cancel: { label: t("support.action"), onClick: openSupport },
        });
        deps.reportShown(version);
    }

    return {
        checkOnLaunch: attemptCheck,
        /** The hourly timer pauses while the window is hidden, so a show also checks when the last one is stale. */
        start() {
            const env = deps.env ?? documentEnv;
            const stopPoller = createPoller(attemptCheck, {
                intervalMs: RECHECK_MS,
                pauseWhenHidden: true,
                env,
            }).start();
            const unwatch = env.onVisibilityChange(() => {
                if (env.isHidden()) return;
                deps.banner.reveal();
                if (shouldRecheckOnShow(lastCheckAt, deps.now())) void attemptCheck();
            });
            return () => {
                stopPoller();
                unwatch();
            };
        },
    };
}

const checks = createUpdateChecks({
    now: () => Date.now(),
    banner: updateBanner,
    reportShown: reportUpdateShown,
    install: installUpdate,
});

/** Silent on failure and in dev builds; only an available update surfaces, as a toast or the banner. */
export function checkOnLaunch() {
    return checks.checkOnLaunch();
}

/** Rechecks on an interval for the rest of the session, since the app is often left open and actively used for hours. */
export function startBackgroundUpdateChecks() {
    return checks.start();
}
