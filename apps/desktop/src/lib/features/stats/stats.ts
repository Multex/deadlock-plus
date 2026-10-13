import { t } from "$lib/core/i18n.svelte";

export function formatPlaytime(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return h > 0 ? t("stats.playtime_hm", { hours: h, minutes: m }) : t("stats.playtime_m", { minutes: m });
}
