import { command } from "$lib/core/tauri";

export function setTelemetrySettings(enabled: boolean, locale: string) {
    return command("set_telemetry_settings", { enabled, locale });
}

export function trackFeature(name: string) {
    return command("track_feature", { name });
}

export function trackDiscordInvite() {
    return command("track_discord_invite");
}

export function trackUpdateShown(toVersion: string) {
    return command("track_update_shown", { toVersion });
}

export function trackUpdateInstallClicked(toVersion: string, source: "banner" | "toast" | "about") {
    return command("track_update_install_clicked", { toVersion, source });
}

export function resetTelemetryId() {
    return command("reset_telemetry_id");
}
