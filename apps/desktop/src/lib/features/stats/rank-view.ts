import { t } from "$lib/core/i18n.svelte";
import { shortDay } from "./format";
import { subrankAt, badgeParts, type BadgeParts, type ProgressPoint, type RankTier } from "@deadlock-plus/stats/rank";

export const CHART_W = 760;
export const CHART_H = 280;
export const CHART_PAD = { l: 96, r: 16, t: 14, b: 14 };

export const tierName = (ranks: RankTier[], tier: number) =>
    ranks.find((t) => t.tier === tier)?.name ?? t("rank.tier_fallback", { tier });

export const partsName = (ranks: RankTier[], p: BadgeParts) => `${tierName(ranks, p.tier)} ${p.sub}`;

export function badgeName(ranks: RankTier[], badge: number): string {
    const p = badgeParts(badge);
    return p ? partsName(ranks, p) : "-";
}

export interface RankChart {
    lines: { y: number; label: string }[];
    d: string;
    dots: { cx: number; cy: number; p: ProgressPoint }[];
    from: string;
    to: string;
}

export function buildRankChart(series: ProgressPoint[], shown: number, ranks: RankTier[]): RankChart | null {
    const pts = series.slice(-shown);
    if (pts.length < 2) return null;
    const { l: padL, r: padR, t: padT, b: padB } = CHART_PAD;
    const flats = pts.map((p) => p.flat);
    const lowest = subrankAt(Math.min(...flats));
    const highest = subrankAt(Math.max(...flats));
    const lo = lowest.start;
    const hi = highest.start + highest.span;
    const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (CHART_H - padT - padB);
    const x = (i: number) => padL + (i / (pts.length - 1)) * (CHART_W - padL - padR);
    const edges: number[] = [];
    for (let v = lo; v <= hi; v = subrankAt(v).start + subrankAt(v).span) edges.push(v);
    const every = Math.ceil(edges.length / 7);
    const lines = edges
        .map((v) => ({ y: y(v), label: partsName(ranks, subrankAt(v)) }))
        .filter((_, i) => i % every === 0);
    return {
        lines,
        d: pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.flat).toFixed(1)}`).join(" "),
        dots: pts.map((p, i) => ({ cx: x(i), cy: y(p.flat), p })),
        from: shortDay(pts[0].startTime),
        to: shortDay(pts.at(-1)!.startTime),
    };
}
