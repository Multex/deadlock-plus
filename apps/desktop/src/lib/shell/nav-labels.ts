import { t } from "$lib/core/i18n.svelte";

export function navLabel(id: string, fallback: string): string {
    switch (id) {
        case "home":
            return t("shell.nav.home");
        case "server-picker":
            return t("shell.nav.server_picker");
        case "live":
            return t("shell.nav.live");
        case "stats":
            return t("shell.nav.stats");
        case "alerts":
            return t("shell.nav.alerts");
        case "performance":
            return t("shell.nav.performance");
        case "voice-bans":
            return t("shell.nav.voice_bans");
        case "demos":
            return t("shell.nav.demos");
        case "presence":
            return t("shell.nav.presence");
        case "match-history":
            return t("shell.nav.match_history");
        default:
            return fallback;
    }
}
