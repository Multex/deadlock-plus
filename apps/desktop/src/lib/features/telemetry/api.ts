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

const FLUSH_LIMIT_MS = 2000;

/** Never rejects and never waits past the limit, so a caller about to lose the process can always await it. */
export async function flushTelemetry(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<void>((resolve) => (timer = setTimeout(resolve, FLUSH_LIMIT_MS)));
    await Promise.race([command("flush_telemetry").catch(() => {}), limit]);
    clearTimeout(timer);
}

export function resetTelemetryId() {
    return command("reset_telemetry_id");
}
