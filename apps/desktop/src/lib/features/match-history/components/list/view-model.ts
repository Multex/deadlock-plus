import type { Outcome } from "@deadlock-plus/stats/stats";
import { signed } from "$lib/features/stats/format";
import type { SelectMenuItem } from "@deadlock-plus/ui/select-menu";
import { DEFAULT_FILTERS, type ModeFilter, type RowFilters } from "@deadlock-plus/match/filters";
import type { MatchRow, RowMode } from "@deadlock-plus/match/list";

export type DeltaTone = "up" | "down" | "flat" | "none";

export interface DeltaView {
    text: string;
    tone: DeltaTone;
}

export const kdaText = (r: Pick<MatchRow, "kills" | "deaths" | "assists">) => `${r.kills} / ${r.deaths} / ${r.assists}`;

export function deltaView(r: Pick<MatchRow, "rankDelta">): DeltaView {
    if (r.rankDelta === null) return { text: "-", tone: "none" };
    const tone: DeltaTone = r.rankDelta > 0 ? "up" : r.rankDelta < 0 ? "down" : "flat";
    return { text: signed(r.rankDelta), tone };
}

const MODE_KEYS: Record<RowMode, string> = {
    ranked: "stats.scope.ranked",
    unranked: "stats.scope.unranked",
    streetBrawl: "live.game.streetBrawl",
    custom: "match_history.list.mode.custom",
    bot: "match_history.list.mode.other",
    other: "match_history.list.mode.other",
};

export const modeLabelKey = (mode: RowMode) => MODE_KEYS[mode];

const OUTCOME_KEYS: Record<Outcome, string> = {
    win: "stats.outcome.win",
    loss: "stats.outcome.loss",
    unscored: "match_history.list.outcome.unscored",
};

export const outcomeLabelKey = (o: Outcome) => OUTCOME_KEYS[o];

export const MODE_OPTIONS: readonly { value: ModeFilter; labelKey: string }[] = [
    { value: "all", labelKey: "stats.scope.all" },
    { value: "ranked", labelKey: "stats.scope.ranked" },
    { value: "unranked", labelKey: "stats.scope.unranked" },
    { value: "streetBrawl", labelKey: "live.game.streetBrawl" },
];

export const OUTCOME_OPTIONS: readonly { value: Outcome | "all"; labelKey: string }[] = [
    { value: "all", labelKey: "match_history.list.filter.any_outcome" },
    { value: "win", labelKey: "stats.outcome.win" },
    { value: "loss", labelKey: "stats.outcome.loss" },
    { value: "unscored", labelKey: "match_history.list.outcome.unscored" },
];

export const DAY_OPTIONS: readonly (number | null)[] = [7, 30, 90, null];

export interface HeroOption {
    id: number;
    name: string;
}

export function heroOptions(rows: MatchRow[], nameOf: (heroId: number) => string): HeroOption[] {
    const ids = new Set(rows.map((r) => r.heroId));
    return [...ids].map((id) => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name));
}

export type HeroMenuItem = SelectMenuItem & { heroId?: number };

/** The empty value is the "any hero" choice. */
export function heroMenuItems(heroes: readonly HeroOption[], anyLabel: string): HeroMenuItem[] {
    return [
        { value: "", label: anyLabel },
        ...heroes.map((h) => ({ value: String(h.id), label: h.name, heroId: h.id })),
    ];
}

export const parseHeroValue = (value: string): number | null => (value === "" ? null : Number(value));

export function filtersActive(f: RowFilters): boolean {
    return (Object.keys(DEFAULT_FILTERS) as (keyof RowFilters)[]).some((k) => f[k] !== DEFAULT_FILTERS[k]);
}

export const matchHref = (matchId: number) => `/match-history/${matchId}`;
