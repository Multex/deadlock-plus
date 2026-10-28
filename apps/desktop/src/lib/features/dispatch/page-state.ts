import { MIN_EDITION_MATCHES } from "@deadlock-plus/stats/dispatch/types";
import { soFarWindow } from "@deadlock-plus/stats/dispatch/window";

/** The first weekly paper comes out on the next Monday 00:00 local, if this week reaches the minimum. */
export function firstPaper(nowS: number, tz: string, soFarMatches: number): { dateS: number; needed: number } {
    return { dateS: soFarWindow(nowS, tz).endS, needed: Math.max(0, MIN_EDITION_MATCHES - soFarMatches) };
}

/** The mini paper's look: one per edition kind, plus the unfinished week. */
export type PaperKind = "so_far" | "weekly" | "monthly" | "collectors" | "year_end";
