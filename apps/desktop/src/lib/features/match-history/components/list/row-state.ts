import type { RowCoverageState } from "@deadlock-plus/match/coverage";

export interface RowStateBadge {
    labelKey: string;
    variant: "outline" | "secondary";
}

const BADGES: Record<NonNullable<RowCoverageState>, RowStateBadge> = {
    missing: { labelKey: "match_history.row_state.missing", variant: "outline" },
    recovering: { labelKey: "match_history.row_state.recovering", variant: "secondary" },
};

export const rowStateBadge = (state: RowCoverageState): RowStateBadge | null => (state ? BADGES[state] : null);

export const showGrade = (grade: unknown, state: RowCoverageState): boolean => !!grade && state === null;
