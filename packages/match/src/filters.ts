import type { Outcome } from "@deadlock-plus/stats/stats";
import type { MatchRow } from "./list";

export type ModeFilter = "all" | "ranked" | "unranked" | "streetBrawl";

export interface RowFilters {
    mode: ModeFilter;
    heroId: number | null;
    outcome: Outcome | "all";
    days: number | null;
    custom: boolean;
}

export const DEFAULT_FILTERS: RowFilters = { mode: "all", heroId: null, outcome: "all", days: null, custom: false };

const DAY_S = 86_400;

function visible(row: MatchRow, custom: boolean): boolean {
    if (row.mode === "bot") return false;
    if (row.mode === "custom") return custom && row.source === "api";
    return !custom;
}

export function filterRows(rows: MatchRow[], f: RowFilters, nowS: number): MatchRow[] {
    const cutoff = f.days === null ? null : nowS - f.days * DAY_S;
    return rows.filter(
        (r) =>
            visible(r, f.custom) &&
            (f.custom || f.mode === "all" || r.mode === f.mode) &&
            (f.heroId === null || r.heroId === f.heroId) &&
            (f.outcome === "all" || r.outcome === f.outcome) &&
            (cutoff === null || r.startTime >= cutoff),
    );
}
