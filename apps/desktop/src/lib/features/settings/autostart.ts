import type { AutostartStatus } from "@deadlock-plus/ipc-types/AutostartStatus";
import { platform, type Platform } from "$lib/core/platform";
import { t } from "$lib/core/i18n.svelte";

export { getAutostart, setAutostart } from "./api";
export type { AutostartStatus };

export function autostartTitle(p: Platform = platform): string {
    if (p === "windows") return t("settings.autostart.title_windows");
    if (p === "macos") return t("settings.autostart.title_macos");
    return t("settings.autostart.title_linux");
}

export function autostartDescription(p: Platform = platform): string {
    if (p === "windows") return t("settings.autostart.description_windows");
    if (p === "macos") return t("settings.autostart.description_macos");
    return t("settings.autostart.description_linux");
}

export function autostartLine(status: AutostartStatus | null, error: string | null): string {
    if (error) return t("settings.autostart.failed", { error });
    if (!status) return "";
    return status.stale ? t("settings.autostart.stale") : "";
}
