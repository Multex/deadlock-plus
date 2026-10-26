import { formatNumber, i18n, t, tn } from "$lib/core/i18n.svelte";
import type { Hero } from "$lib/features/heroes/heroes";
import { badgeName } from "$lib/features/stats/rank-view";
import { formatPlaytime } from "$lib/features/stats/stats";
import type { RankTier } from "@deadlock-plus/stats/rank";
import type { DispatchViewDeps } from "../edition-view";
import { dateRange } from "../date-range";

const dates = (tz: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.locale, { ...options, timeZone: tz });

/** Dates use the edition's own time zone so a day never shifts to its neighbour. */
export function dispatchViewDeps(heroes: Record<number, Hero>, ranks: RankTier[]): DispatchViewDeps {
    return {
        t,
        tn,
        number: (n) => formatNumber(n),
        hero: (id) => {
            const hero = heroes[id];
            return hero ? { name: hero.name, art: hero.portrait } : undefined;
        },
        day: (s, tz) => dates(tz, { weekday: "short", month: "short", day: "numeric" }).format(s * 1000),
        dayRange: (a, b, tz) =>
            dateRange(
                dates(tz, { month: "short", day: "numeric", year: "numeric" }),
                a * 1000,
                b * 1000,
                t("dispatch.range_join"),
            ),
        month: (s, tz) => dates(tz, { month: "long", year: "numeric" }).format(s * 1000),
        percent: (v) => formatNumber(v, { style: "percent", maximumFractionDigits: 0 }),
        duration: formatPlaytime,
        netWorth: (n) => formatNumber(n, { notation: "compact", maximumFractionDigits: 1 }),
        rank: (badge) => badgeName(ranks, badge),
    };
}
