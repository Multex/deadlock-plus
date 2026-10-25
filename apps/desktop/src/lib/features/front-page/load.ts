import { formatDate, formatNumber, i18n, t, tn } from "$lib/core/i18n.svelte";
import { matchPingPoints } from "$lib/features/connection/api";
import { loadHeroes, type Hero } from "$lib/features/heroes/heroes";
import { formatClock } from "$lib/features/live/live";
import { readProvisionalDetail } from "$lib/features/match-history/api";
import { ordinalCategory, readGrades } from "$lib/features/match-history/mvp";
import { playerNames } from "$lib/features/match-history/names";
import { parseApiDetail } from "@deadlock-plus/match/api-detail";
import { withNames } from "@deadlock-plus/match/names";
import { allPlayers, type MatchDetail } from "@deadlock-plus/match/detail";
import { MAX_PING_POINTS } from "@deadlock-plus/match/ping";
import type { GradeInput } from "@deadlock-plus/match/stories/index";
import type { MatchPingSeries } from "@deadlock-plus/ipc-types/MatchPingSeries";
import type { ViewDeps } from "./front-page-view";

export interface FrontPageExtras {
    heroes: Record<number, Hero>;
    grades: GradeInput[];
    ping: MatchPingSeries | null;
}

/**
 * `storedGrade` reads the stored grade only: from Match History the scoreboard already asked for one, so the front
 * page never starts a grading run of its own there.
 */
export async function loadExtras(detail: MatchDetail, storedGrade: boolean): Promise<FrontPageExtras> {
    const heroIds = [...new Set(allPlayers(detail).map((p) => p.heroId))];
    const [heroes, grades, ping] = await Promise.all([
        loadHeroes(heroIds).catch((): Record<number, Hero> => ({})),
        storedGrade ? readGrades([detail.matchId]).catch(() => []) : [],
        matchPingPoints(detail.matchId, MAX_PING_POINTS).catch(() => null),
    ]);
    return { heroes, grades: grades.find((g) => g.matchId === detail.matchId)?.players ?? [], ping };
}

/** The match the game capture just recorded, with player names when they resolve. */
export async function readCapturedDetail(matchId: number): Promise<MatchDetail | null> {
    const raw = await readProvisionalDetail(matchId).catch(() => null);
    const detail = raw === null ? null : parseApiDetail(raw, { source: "provisional" });
    if (detail?.matchId !== matchId) return null;
    try {
        return withNames(detail, await playerNames.resolve(allPlayers(detail).map((p) => p.accountId)));
    } catch {
        return detail;
    }
}

export function viewDeps(heroes: Record<number, Hero>): ViewDeps {
    return {
        t,
        tn,
        number: (n) => formatNumber(n),
        date: (s) => formatDate(s * 1000, { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
        ordinal: (place) =>
            t(`match_history.detail.grade.place_ordinal_${ordinalCategory(place, i18n.locale)}`, { place }),
        clock: (s) => formatClock(s) ?? "",
        hero: (id) => {
            const hero = heroes[id];
            return hero ? { name: hero.name, art: hero.portrait } : undefined;
        },
    };
}
