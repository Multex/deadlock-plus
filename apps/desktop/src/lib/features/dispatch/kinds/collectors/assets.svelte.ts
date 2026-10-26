import { formatNumber, i18n, t, tn } from "$lib/core/i18n.svelte";
import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
import { loadRankTiers } from "$lib/features/ranks/ranks";
import type { RankTier } from "@deadlock-plus/stats/rank";
import type { CollectorsDeps } from "./view";
import { dateRange } from "../../date-range";

const dates = (tz: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.locale, { ...options, timeZone: tz });

/** Rank tiers with the installed game's badge art, and heroes with their card art, loaded once per mount. */
export function collectorsAssets() {
    let tiers = $state.raw<RankTier[]>([]);
    let heroes = $state.raw<Record<number, Hero>>({});
    let ready = $state(false);

    $effect(() => {
        let live = true;
        void Promise.all([loadRankTiers(), loadHeroes()]).then(([r, h]) => {
            if (!live) return;
            tiers = r;
            heroes = h;
            ready = true;
        });
        const off = onHeroesRefreshed((h) => (heroes = h));
        return () => {
            live = false;
            off();
        };
    });

    return {
        get ready() {
            return ready;
        },
        get deps(): CollectorsDeps {
            const h = heroes;
            return {
                t,
                tn,
                number: (n) => formatNumber(n),
                percent: (v) => formatNumber(v, { style: "percent", maximumFractionDigits: 0 }),
                dayRange: (a, b, tz) =>
                    dateRange(
                        dates(tz, { month: "short", day: "numeric", year: "numeric" }),
                        a * 1000,
                        b * 1000,
                        t("dispatch.range_join"),
                    ),
                day: (s, tz) => dates(tz, { weekday: "short", month: "short", day: "numeric" }).format(s * 1000),
                // Month rules sit on UTC month starts, so they are named in UTC too.
                month: (s) => dates("UTC", { month: "short" }).format(s * 1000),
                tiers,
                hero: (id) => (h[id] ? { name: h[id].name, art: h[id].portrait } : undefined),
            };
        },
    };
}
