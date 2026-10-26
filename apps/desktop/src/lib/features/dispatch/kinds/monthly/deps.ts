import { formatNumber, i18n, t, tn } from "$lib/core/i18n.svelte";
import type { Hero } from "$lib/features/heroes/heroes";
import { badgeName } from "$lib/features/stats/rank-view";
import { formatPlaytime } from "$lib/features/stats/stats";
import { badgeParts, type RankTier } from "@deadlock-plus/stats/rank";
import type { MagazineDeps } from "./magazine";

export function magazineDeps(heroes: Record<number, Hero>, ranks: RankTier[]): MagazineDeps {
    return {
        t,
        tn,
        number: (n) => formatNumber(n),
        percent: (v) => formatNumber(v, { style: "percent", maximumFractionDigits: 0 }),
        percentParts: (v) =>
            new Intl.NumberFormat(i18n.locale, { style: "percent", maximumFractionDigits: 0 })
                .formatToParts(v)
                .map((p) => ({ value: p.value, sign: p.type === "percentSign" })),
        duration: formatPlaytime,
        date: (s, tz, options) => new Intl.DateTimeFormat(i18n.locale, { ...options, timeZone: tz }).format(s * 1000),
        hero: (id) => {
            const h = heroes[id];
            return h ? { name: h.name, icon: h.icon, art: h.portrait } : undefined;
        },
        rank: (badge) => {
            const tier = badgeParts(badge)?.tier;
            return { name: badgeName(ranks, badge), image: ranks.find((r) => r.tier === tier)?.image ?? null };
        },
    };
}
