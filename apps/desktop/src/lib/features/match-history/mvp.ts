import { command, listen } from "$lib/core/tauri";
import type { Letter } from "@deadlock-plus/stats/grades";
import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";

export const GRADED_EVENT = "mvp://graded";

/** Stored grades only; matches without one are left out. */
export const readGrades = (matchIds: number[]) => command<MvpMatchGrade[]>("mvp_grades", { matchIds });
/** Grades the match first when it has no grade yet; null when it cannot be graded. */
export const gradeMatch = (matchId: number) => command<MvpMatchGrade | null>("mvp_grade_match", { matchId });
export const onGraded = (handler: (matchIds: number[]) => void) => listen<number[]>(GRADED_EVENT, handler);

/** The stats behind a grade, in the order of `MvpPlayerGrade.percentiles`. */
export const MVP_STATS = [
    "kills",
    "deaths",
    "assists",
    "souls",
    "playerDamage",
    "objectiveDamage",
    "selfHealing",
    "support",
] as const;
export type MvpStat = (typeof MVP_STATS)[number];

export const STAT_LABEL: Record<MvpStat, string> = {
    kills: "live.grades.label.kills",
    deaths: "live.grades.label.deaths",
    assists: "live.grades.label.assists",
    souls: "live.grades.label.souls",
    playerDamage: "live.grades.label.damage",
    objectiveDamage: "live.grades.label.objective_damage",
    selfHealing: "match_history.detail.grade.stat.self_healing",
    support: "match_history.detail.grade.stat.support",
};

export function ordinalCategory(place: number, locale: string): Intl.LDMLPluralRule {
    return new Intl.PluralRules(locale, { type: "ordinal" }).select(place);
}

export function gradeTone(letter: MvpLetter): Letter {
    const band = letter[0];
    return band === "F" ? "E" : (band as Letter);
}

export function scoreText(s10: number, locale: string): string {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(s10 / 10);
}

/** Share of players on the same hero this one beat in each stat; fewer deaths count as better. */
export function statLines(grade: MvpPlayerGrade): { key: MvpStat; better: number }[] {
    return MVP_STATS.flatMap((key, i) => {
        const p = grade.percentiles[i];
        if (p === null || p === undefined) return [];
        return [{ key, better: Math.round(key === "deaths" ? 100 - p : p) }];
    });
}

export function gradeBySlot(grade: MvpMatchGrade | null): Map<number, MvpPlayerGrade> {
    return new Map((grade?.players ?? []).map((p) => [p.playerSlot, p]));
}

export interface GradeDeps {
    gradeMatch(matchId: number): Promise<MvpMatchGrade | null>;
    readGrades(matchIds: number[]): Promise<MvpMatchGrade[]>;
    listen(handler: (matchIds: number[]) => void): Promise<() => void>;
}

export const liveGradeDeps: GradeDeps = { gradeMatch, readGrades, listen: onGraded };

/**
 * Grades `matchId` once, then re-reads its stored grade each time the backend reports it graded.
 * Failures leave the shown grade as it was: a grade is extra, never an error. Returns the stop function.
 */
export function watchMatchGrade(
    matchId: number,
    deps: GradeDeps,
    onGrade: (grade: MvpMatchGrade | null) => void,
): () => void {
    let stopped = false;
    let latest = 0;
    let unlisten: (() => void) | null = null;

    const settle = (request: Promise<MvpMatchGrade | null | undefined>) => {
        const id = ++latest;
        request.then(
            (grade) => {
                if (stopped || id !== latest || grade === undefined) return;
                onGrade(grade);
            },
            () => {},
        );
    };

    settle(deps.gradeMatch(matchId));
    deps.listen((ids) => {
        if (ids.includes(matchId)) settle(deps.readGrades([matchId]).then((found) => found[0]));
    }).then(
        (stop) => {
            if (stopped) stop();
            else unlisten = stop;
        },
        () => {},
    );

    return () => {
        stopped = true;
        unlisten?.();
        unlisten = null;
    };
}
