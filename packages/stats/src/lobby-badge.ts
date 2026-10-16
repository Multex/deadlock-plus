import { badgeParts } from "./rank";

export const MIN_MATCHES = 200;
export const MIN_TIER = 1;
export const MAX_TIER = 11;
const MIN_LOBBY_RANKS = 4;
const STALE_SECS = 30 * 86_400;
const SUBRANKS = 6;

// The API ignores a bound at or past either end of the ladder (Initiate 1, Eternus 6).
const LOWEST_BADGE = MIN_TIER * 10 + 1;
const HIGHEST_BADGE = MAX_TIER * 10 + SUBRANKS;

export interface RankRow {
    badge: number;
    last_match: { start_time: number } | null;
}

export interface TierRange {
    fromTier: number;
    toTier: number;
}

export interface BadgeFilter {
    minAverageBadge: number | undefined;
    maxAverageBadge: number | undefined;
}

export type ComparisonGroup = { kind: "streetBrawl" } | { kind: "allRanks" } | { kind: "tiers"; range: TierRange };

export type GroupLabel =
    | { kind: "rank"; tier: number }
    | { kind: "range"; fromTier: number; toTier: number }
    | { kind: "allRanks" }
    | { kind: "streetBrawl" };

const NO_FILTER: BadgeFilter = { minAverageBadge: undefined, maxAverageBadge: undefined };

// Port of deadlock-api's `mean_badge`. Badges skip subranks 7-9 (56 is followed by 61), so the mean
// is taken on a dense scale of 6 subranks per tier and mapped back; a plain mean can land on 59.
export function meanBadge(badges: readonly (number | null)[]): number | null {
    const ranked = badges.filter((b): b is number => b !== null && b > 0);
    if (ranked.length === 0) return null;
    const dense = ranked.map((b) => b - 4 * Math.floor(b / 10));
    const m = Math.floor(dense.reduce((s, d) => s + d, 0) / dense.length + 0.5);
    return m + 4 * Math.floor((m - 1) / SUBRANKS);
}

// An unranked lobby's badge, from a rank lookup of its players. Badges whose last match is over 30
// days old are skipped as out of date. Too few left to trust → your own rank; null means all ranks.
export function unrankedLobbyBadge(rows: readonly RankRow[], ownBadge: number | null, nowSecs: number): number | null {
    const usable = rows
        .filter((r) => r.badge > 0 && r.last_match !== null && nowSecs - r.last_match.start_time <= STALE_SECS)
        .map((r) => r.badge);
    if (usable.length >= MIN_LOBBY_RANKS) return meanBadge(usable);
    return ownBadge !== null && ownBadge > 0 ? ownBadge : null;
}

const clampTier = (tier: number) => Math.min(MAX_TIER, Math.max(MIN_TIER, tier));

export function tierRange(badge: number): TierRange {
    const tier = clampTier(badgeParts(badge)?.tier ?? MIN_TIER);
    return { fromTier: tier, toTier: tier };
}

export function widen(range: TierRange): TierRange | null {
    if (range.fromTier <= MIN_TIER && range.toTier >= MAX_TIER) return null;
    return { fromTier: clampTier(range.fromTier - 1), toTier: clampTier(range.toTier + 1) };
}

export function badgeFilter(range: TierRange): BadgeFilter {
    const min = range.fromTier * 10 + 1;
    const max = range.toTier * 10 + SUBRANKS;
    return {
        minAverageBadge: min <= LOWEST_BADGE ? undefined : min,
        maxAverageBadge: max >= HIGHEST_BADGE ? undefined : max,
    };
}

// The API returns 400 for Street Brawl with a badge filter, so it never gets one.
export function startGroup(opts: { streetBrawl: boolean; badge: number | null }): ComparisonGroup {
    if (opts.streetBrawl) return { kind: "streetBrawl" };
    if (opts.badge === null || opts.badge <= 0) return { kind: "allRanks" };
    return { kind: "tiers", range: tierRange(opts.badge) };
}

/** The next, wider group to try after `group` returned `matches` samples, or null to keep `group`. */
export function nextGroup(group: ComparisonGroup, matches: number): ComparisonGroup | null {
    if (group.kind !== "tiers" || matches >= MIN_MATCHES) return null;
    const range = widen(group.range);
    return range ? { kind: "tiers", range } : null;
}

export function groupFilter(group: ComparisonGroup): BadgeFilter {
    return group.kind === "tiers" ? badgeFilter(group.range) : NO_FILTER;
}

export function groupLabel(group: ComparisonGroup): GroupLabel {
    if (group.kind !== "tiers") return { kind: group.kind };
    const { fromTier, toTier } = group.range;
    if (fromTier <= MIN_TIER && toTier >= MAX_TIER) return { kind: "allRanks" };
    if (fromTier === toTier) return { kind: "rank", tier: fromTier };
    return { kind: "range", fromTier, toTier };
}
