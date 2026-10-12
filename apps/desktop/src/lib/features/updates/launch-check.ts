import { goto } from "$app/navigation";
import { toast } from "svelte-sonner";
import { t } from "$lib/core/i18n.svelte";
import { createPoller } from "$lib/core/poller";
import { getAppInfo } from "$lib/features/settings/about";
import { settings } from "$lib/features/settings/settings.svelte";
import { connectivity } from "$lib/features/connectivity/online.svelte";
import { openSupport } from "$lib/features/support/support";
import { updater } from "./updater.svelte";

/** A release check is one cheap GitHub request; hourly is nowhere near enough traffic to matter. */
const RECHECK_MS = 60 * 60 * 1000;

/** Avoids re-toasting the same version on every periodic recheck while the app stays open. */
let notifiedVersion: string | null = null;

async function attemptCheck() {
    await settings.ready;
    if (!settings.autoUpdateCheck || !connectivity.online) return;
    try {
        if ((await getAppInfo()).debugBuild) return;
    } catch {
        return;
    }
    if (!(await updater.check())) return;
    if (updater.version === notifiedVersion) return;
    notifiedVersion = updater.version;
    toast(t("updates.toast_available", { version: updater.version ?? "" }), {
        duration: 15000,
        action: { label: t("updates.toast_details"), onClick: () => void goto("/settings/about") },
        cancel: { label: t("support.action"), onClick: openSupport },
    });
}

/** Silent on failure and in dev builds; only an available update surfaces, as a toast. */
export async function checkOnLaunch() {
    await attemptCheck();
}

/** Rechecks on an interval for the rest of the session, since the app is often left open and actively used for hours. */
export function startBackgroundUpdateChecks() {
    return createPoller(attemptCheck, { intervalMs: RECHECK_MS, pauseWhenHidden: true }).start();
}
