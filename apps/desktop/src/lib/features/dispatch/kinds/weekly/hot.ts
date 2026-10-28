import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";

/** Longest win streak that makes a hot week. */
export const HOT_STREAK = 5;
/** Share of scored matches won, from `HOT_RECORD_MIN_MATCHES` scored matches up. */
export const HOT_RECORD_SHARE = 0.7;
export const HOT_RECORD_MIN_MATCHES = 8;
export const HOT_GRADES: readonly MvpLetter[] = ["S+", "S", "S-"];

export type HotReason = "streak" | "climb" | "record" | "s_grade";

export interface HotInput {
    number: Edition["number"];
    stats: Pick<Edition["stats"], "wins" | "losses">;
    longestWin: number;
    rank: Pick<NonNullable<Edition["rank"]>, "startBadge" | "endBadge"> | null;
    bestGame: Pick<NonNullable<Edition["bestGame"]>, "letter"> | null;
}

/** Why a week earns the "Extra!" stamp; empty for an ordinary week. Unscored matches count on neither side. */
export function hotReasons(e: HotInput): HotReason[] {
    const reasons: HotReason[] = [];
    if (e.longestWin >= HOT_STREAK) reasons.push("streak");
    // A higher badge, not just positive rank points: a week that ends on the badge it started on held, it did not climb.
    if (e.rank && e.rank.endBadge > e.rank.startBadge) reasons.push("climb");
    const scored = e.stats.wins + e.stats.losses;
    if (scored >= HOT_RECORD_MIN_MATCHES && e.stats.wins / scored >= HOT_RECORD_SHARE) reasons.push("record");
    const letter = e.bestGame?.letter;
    if (letter && HOT_GRADES.includes(letter)) reasons.push("s_grade");
    return reasons;
}

/** "This week so far" is still being written, so it is never stamped. */
export function isHotWeek(e: HotInput): boolean {
    return e.number !== null && hotReasons(e).length > 0;
}
