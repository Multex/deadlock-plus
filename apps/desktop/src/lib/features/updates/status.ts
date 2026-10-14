import { t } from "$lib/core/i18n.svelte";
import type { UpdateFailure, UpdatePhase } from "./updater.svelte";

export interface UpdateView {
    phase: UpdatePhase;
    version: string | null;
    progress: number | null;
    error: UpdateFailure | null;
}

export function updateLine(u: UpdateView): string {
    switch (u.phase) {
        case "idle":
            return t("updates.status.idle");
        case "checking":
            return t("updates.status.checking");
        case "upToDate":
            return t("updates.status.up_to_date");
        case "available":
            return t("updates.status.available", { version: u.version ?? "" });
        case "downloading": {
            const version = u.version ?? "";
            return u.progress === null
                ? t("updates.status.downloading", { version })
                : t("updates.status.downloading_percent", { version, percent: Math.round(u.progress * 100) });
        }
        case "error":
            return u.error === "download" ? t("updates.status.download_failed") : t("updates.status.check_failed");
    }
}
