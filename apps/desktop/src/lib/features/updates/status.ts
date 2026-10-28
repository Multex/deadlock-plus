import { t } from "$lib/core/i18n.svelte";
import { byteProgress, updateStage, type UpdateSource } from "./flow";

export function updateLine(u: UpdateSource): string {
    const version = u.version ?? "";
    switch (updateStage(u)) {
        case "idle":
            return t("updates.status.idle");
        case "checking":
            return t("updates.status.checking");
        case "upToDate":
            return t("updates.status.up_to_date");
        case "available":
            return t("updates.status.available", { version });
        case "downloading": {
            const { fraction } = byteProgress(u);
            return fraction === null
                ? t("updates.status.downloading", { version })
                : t("updates.status.downloading_percent", { version, percent: Math.round(fraction * 100) });
        }
        case "ready":
            return t("updates.status.ready", { version });
        case "failed":
            return u.error === "check" ? t("updates.status.check_failed") : t("updates.status.download_failed");
    }
}
