import { t } from "$lib/core/i18n.svelte";
import { byteProgress, failureStep, updateStage, type UpdateSource } from "./flow";

export function stageKicker(s: UpdateSource): string {
    switch (updateStage(s)) {
        case "available":
            return t("updates.surface.kicker.available");
        case "downloading":
            return t("updates.surface.kicker.downloading");
        case "ready":
            return t("updates.surface.kicker.ready");
        case "failed":
            return failureStep(s) === "check"
                ? t("updates.surface.kicker.check_failed")
                : t("updates.surface.kicker.failed");
        case "upToDate":
            return t("updates.surface.kicker.up_to_date");
        case "checking":
            return t("updates.surface.kicker.checking");
        case "idle":
            return t("updates.surface.kicker.idle");
    }
}

export function stageBody(s: UpdateSource, currentVersion: string | null): string {
    switch (updateStage(s)) {
        case "available":
            return t("updates.surface.body.available");
        case "downloading":
            return t("updates.surface.body.downloading");
        case "ready":
            return t("updates.surface.body.ready");
        case "failed":
            switch (failureStep(s)) {
                case "install":
                    return t("updates.surface.body.install_failed");
                case "download":
                    return t("updates.surface.body.failed");
                default:
                    return t("updates.surface.body.check_failed");
            }
        case "upToDate":
            return currentVersion
                ? t("updates.surface.body.up_to_date", { version: currentVersion })
                : t("updates.surface.body.up_to_date_plain");
        case "checking":
            return t("updates.surface.body.checking");
        case "idle":
            return t("updates.surface.body.idle");
    }
}

export function indicatorLabel(s: UpdateSource): string {
    switch (updateStage(s)) {
        case "downloading": {
            const { fraction } = byteProgress(s);
            return fraction === null
                ? t("updates.indicator.downloading_plain")
                : t("updates.indicator.downloading", { percent: Math.round(fraction * 100) });
        }
        case "ready":
            return t("updates.indicator.ready");
        case "failed":
            return t("updates.indicator.failed", { version: s.version ?? "" });
        default:
            return t("updates.indicator.available", { version: s.version ?? "" });
    }
}
