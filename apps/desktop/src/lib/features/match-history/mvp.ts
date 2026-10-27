import { command, listen } from "$lib/core/tauri";
import type { Letter } from "@deadlock-plus/stats/grades";
import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import type { MvpStatLine } from "@deadlock-plus/ipc-types/MvpStatLine";
import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import type { MvpMetric } from "@deadlock-plus/ipc-types/MvpMetric";
import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";

export const GRADED_EVENT = "mvp://graded";

const isGrade = (value: unknown): value is MvpMatchGrade =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as MvpMatchGrade).matchId === "number" &&
    Array.isArray((value as MvpMatchGrade).players);

/** Stored grades only; matches without one are left out. */
export const readGrades = async (matchIds: number[]): Promise<MvpMatchGrade[]> => {
    const value = await command<unknown>("mvp_grades", { matchIds });
    return Array.isArray(value) ? value.filter(isGrade) : [];
};
/** Grades the match first when it has no grade yet; null when it cannot be graded. */
export const gradeMatch = async (matchId: number): Promise<MvpMatchGrade | null> => {
    const value = await command<unknown>("mvp_grade_match", { matchId });
    return isGrade(value) ? value : null;
};
export const onGraded = (handler: (matchIds: number[]) => void) => listen<number[]>(GRADED_EVENT, handler);

export const METRIC_LABEL: Record<MvpMetric, string> = {
    early_damage: "match_history.detail.grade.metric.early_damage",
    late_damage: "match_history.detail.grade.metric.late_damage",
    early_assists: "match_history.detail.grade.metric.early_assists",
    late_assists: "match_history.detail.grade.metric.late_assists",
    prebase_objective: "match_history.detail.grade.metric.prebase_objective",
    base_objective: "match_history.detail.grade.metric.base_objective",
    damage_absorbed: "match_history.detail.grade.metric.damage_absorbed",
    ally_healing: "match_history.detail.grade.metric.ally_healing",
    heal_prevented: "match_history.detail.grade.metric.heal_prevented",
    barriers: "match_history.detail.grade.metric.barriers",
    cs: "match_history.detail.grade.metric.cs",
    kills: "match_history.detail.grade.metric.kills",
    deaths: "match_history.detail.grade.metric.deaths",
    cc: "match_history.detail.grade.metric.cc",
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

/** Points with an explicit sign and a real minus; zero (after rounding) has none. */
export function pointsText(points: number, locale: string): string {
    const rounded = Math.round(points);
    if (rounded === 0) return "0";
    const digits = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.abs(rounded));
    return `${rounded < 0 ? "−" : "+"}${digits}`;
}

/** "CC +2,688 · 1st". The rank stays when the whole lobby has zero. */
export function statLineText(
    line: MvpStatLine,
    locale: string,
    t: (key: string) => string,
    ordinal: (place: number) => string,
): string {
    return `${t(METRIC_LABEL[line.metric])} ${statValueText(line, locale, ordinal)}`;
}

/** "+2,688 · 1st": the value half of a stat line. */
export function statValueText(line: MvpStatLine, locale: string, ordinal: (place: number) => string): string {
    return `${pointsText(line.points, locale)} · ${ordinal(line.rank)}`;
}

/** Lines in the order the backend sends them (`MvpMetric` order). */
export function statLines(grade: MvpPlayerGrade): MvpStatLine[] {
    return grade.stats;
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
