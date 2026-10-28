import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import type { RankTier } from "@deadlock-plus/stats/rank";
import { badgeParts } from "@deadlock-plus/stats/rank";
import {
    arcRepeats,
    barsOf,
    calloutBox,
    climbChart,
    climbSteps,
    peakOf,
    seasonCode,
    serialOf,
    topHeroes,
    type ClimbChart,
} from "./model";

type Params = Record<string, string | number>;

export interface CollectorsDeps {
    t: (key: string, params?: Params) => string;
    tn: (key: string, count: number, params?: Params) => string;
    number: (n: number) => string;
    percent: (share: number) => string;
    dayRange: (firstS: number, lastS: number, tz: string) => string;
    day: (unixS: number, tz: string) => string;
    month: (unixS: number) => string;
    tiers: RankTier[];
    hero: (id: number) => { name: string; art: string | null } | undefined;
}

export interface BadgeView {
    label: string;
    image: string | null;
    color: string;
}

export interface CollectorsView {
    season: string;
    dates: string;
    serial: string;
    bars: number[];
    code: string;
    arc: string;
    arcRepeats: number;
    peak: BadgeView | null;
    peakName: string;
    peakLine: string;
    start: BadgeView | null;
    end: BadgeView | null;
    climb: string | null;
    record: string;
    winrate: string | null;
    streak: string;
    matches: string;
    chart: ClimbChart | null;
    tierArt: Record<number, string | null>;
    callout: { x: number; y: number; width: number } | null;
    moves: { ups: string; downs: string } | null;
    reached: string | null;
    matchOf: string | null;
    heroes: { id: number; name: string; art: string | null; line: string }[];
    certificate: { before: string; name: string | null; after: string };
}

/** The climb chart's drawing size inside the left page. */
export const CHART = { width: 624, height: 470 } as const;
const SENTINEL = "\u0000";
const FALLBACK_TIER_COLOR = "#8a6aa8";

export function collectorsView(edition: Edition, deps: CollectorsDeps): CollectorsView {
    const { t, tn } = deps;
    const win = edition.window;
    const season = edition.season?.name ?? t("dispatch.stamp.collectors");
    const tierOf = (tier: number) => deps.tiers.find((x) => x.tier === tier) ?? null;
    const tierName = (tier: number) => tierOf(tier)?.name ?? null;
    const badge = (b: number | undefined): BadgeView | null => {
        const p = b === undefined ? null : badgeParts(b);
        if (!p) return null;
        const tier = tierOf(p.tier);
        return {
            label: `${tier?.name ?? t("rank.tier_fallback", { tier: p.tier })} ${p.sub}`,
            image: tier?.image ?? null,
            color: tier?.color ?? FALLBACK_TIER_COLOR,
        };
    };

    const serial = serialOf(edition.accountId, edition.season?.id ?? win.id);
    const unit = t("dispatch.collectors.arc", { season });
    const repeats = arcRepeats(unit.length + 1);

    const rank = edition.rank;
    const peak = badge(rank?.peakBadge);
    const at = peakOf(edition.rankSeries);
    const date = at ? deps.day(at.startS, win.tz) : null;

    const steps = climbSteps(rank);
    const climb =
        steps === null
            ? null
            : steps === 0
              ? t("dispatch.collectors.climb_held")
              : tn(`dispatch.collectors.climb_${steps > 0 ? "up" : "down"}`, Math.abs(steps));

    const chart = climbChart(edition.rankSeries, win.startS, win.endS, { ...CHART, month: deps.month, tierName });
    const tierArt: Record<number, string | null> = {};
    for (const row of chart?.rows ?? []) if (row.major) tierArt[row.tier] = tierOf(row.tier)?.image ?? null;
    const peakName = peak?.label ?? t("dispatch.collectors.unranked");

    const { stats } = edition;
    const heroes = topHeroes(edition.heroes).map((h) => {
        const known = deps.hero(h.heroId);
        return {
            id: h.heroId,
            name: known?.name ?? t("stats.hero_fallback", { id: h.heroId }),
            art: known?.art ?? null,
            line: `${tn("dispatch.collectors.hero_games", h.games)} · ${tn("dispatch.collectors.hero_wins", h.wins)}`,
        };
    });

    const name = edition.playerName ?? null;
    const [before, after = ""] = (
        name === null
            ? tn("dispatch.collectors.cert_body_anon", stats.matches, { season })
            : tn("dispatch.collectors.cert_body", stats.matches, { name: SENTINEL, season })
    ).split(SENTINEL);

    return {
        season,
        dates: deps.dayRange(win.startS, win.endS - 1, win.tz),
        serial,
        bars: barsOf(serial),
        code: [String(edition.volume), seasonCode(edition.season?.id), serial].filter(Boolean).join(" · "),
        arc: Array.from({ length: repeats }, () => unit).join(" "),
        arcRepeats: repeats,
        peak,
        peakName,
        peakLine: date ? t("dispatch.collectors.peak_reached", { date }) : t("dispatch.collectors.peak_label"),
        start: badge(rank?.startBadge),
        end: badge(rank?.endBadge),
        climb,
        record: t("dispatch.collectors.record_value", {
            wins: deps.number(stats.wins),
            losses: deps.number(stats.losses),
        }),
        winrate: stats.winrate === null ? null : deps.percent(stats.winrate),
        streak: deps.number(edition.longestWin),
        matches: deps.number(stats.matches),
        chart,
        tierArt,
        callout: chart
            ? calloutBox(chart.peak, peakName, {
                  left: chart.pad.l,
                  right: chart.width - chart.pad.r,
                  top: chart.pad.t,
              })
            : null,
        moves: chart ? { ups: deps.number(chart.ups), downs: deps.number(chart.downs) } : null,
        reached: date ? t("dispatch.collectors.reached", { date }) : null,
        matchOf:
            at && edition.rankSeries
                ? t("dispatch.collectors.match_of", {
                      n: deps.number(at.index + 1),
                      total: deps.number(edition.rankSeries.length),
                  })
                : null,
        heroes,
        certificate: { before, name, after },
    };
}
