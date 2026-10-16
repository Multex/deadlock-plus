import { GRADED_STATS, type GradedStat, type Letter, type StatGrade } from "@deadlock-plus/stats/grades";
import type { GroupLabel } from "@deadlock-plus/stats/lobby-badge";
import type { GradeDisplay, NoTargetsReason } from "./grades";
import type { GradesView } from "./grades.svelte";

export type ShownGradesView = Exclude<GradesView, { kind: "hidden" }>;

export interface Message {
    key: string;
    params?: Record<string, string | number>;
}

export interface StripNames {
    locale: string;
    hero: string;
    tierName: (tier: number) => string;
}

export type TileMark = { kind: "letter"; letter: Letter } | { kind: "dash" } | { kind: "tooEarly" };

export interface TileTip {
    name: string;
    lines: Message[];
    group: Message | null;
}

export interface StatTile {
    stat: GradedStat;
    label: string;
    value: string;
    mark: TileMark;
    /** Position on the E-S bar: the score, so deaths read right-is-better too. */
    score: number | null;
    tip: TileTip;
}

export interface OverallTile {
    label: string;
    mark: TileMark;
    score: number | null;
    note: Message | null;
    groupTiers: number[];
    tip: TileTip;
}

export interface StripView {
    overall: OverallTile;
    tiles: StatTile[];
}

export const BANDS: readonly { letter: Letter; from: number; to: number }[] = [
    { letter: "E", from: 0, to: 10 },
    { letter: "D", from: 10, to: 25 },
    { letter: "C", from: 25, to: 50 },
    { letter: "B", from: 50, to: 75 },
    { letter: "A", from: 75, to: 90 },
    { letter: "S", from: 90, to: 100 },
];

export const LETTER_COLOR: Record<Letter, string> = {
    S: "var(--brass)",
    A: "var(--success)",
    B: "oklch(0.74 0.09 215)",
    C: "var(--muted-foreground)",
    D: "oklch(0.72 0.14 50)",
    E: "var(--destructive)",
};

const LABEL_KEY: Record<GradedStat, string> = {
    kills: "live.grades.label.kills",
    deaths: "live.grades.label.deaths",
    assists: "live.grades.label.assists",
    souls: "live.grades.label.souls",
    damage: "live.grades.label.damage",
    objectiveDamage: "live.grades.label.objective_damage",
    healing: "live.grades.label.healing",
};

const NAME_KEY: Record<GradedStat, string> = {
    kills: "live.grades.name.kills",
    deaths: "live.grades.name.deaths",
    assists: "live.grades.name.assists",
    souls: "live.grades.name.souls",
    damage: "live.grades.name.damage",
    objectiveDamage: "live.grades.name.objective_damage",
    healing: "live.grades.name.healing",
};

const REASON_KEY: Record<NoTargetsReason, string> = {
    offline: "live.grades.reason.offline",
    apiDown: "live.grades.reason.api_down",
    rateLimited: "live.grades.reason.rate_limited",
    emptyData: "live.grades.reason.empty_data",
};

const COUNTS: ReadonlySet<GradedStat> = new Set(["kills", "deaths", "assists"]);
const DASH: TileMark = { kind: "dash" };
const TOO_EARLY: TileMark = { kind: "tooEarly" };

export function formatValue(value: number, locale: string): string {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function formatAverage(stat: GradedStat, value: number, locale: string): string {
    const digits = COUNTS.has(stat) ? 1 : 0;
    return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
}

export function groupMessage(group: GroupLabel, names: StripNames): Message {
    const hero = names.hero;
    switch (group.kind) {
        case "rank":
            return { key: "live.grades.group.rank", params: { hero, rank: names.tierName(group.tier) } };
        case "range":
            return {
                key: "live.grades.group.range",
                params: { hero, rankFrom: names.tierName(group.fromTier), rankTo: names.tierName(group.toTier) },
            };
        case "allRanks":
            return { key: "live.grades.group.all_ranks", params: { hero } };
        case "streetBrawl":
            return { key: "live.grades.group.street_brawl", params: { hero } };
    }
}

function groupTiers(group: GroupLabel): number[] {
    if (group.kind === "rank") return [group.tier];
    if (group.kind === "range") return [group.fromTier, group.toTier];
    return [];
}

function stateLines(view: ShownGradesView): Message[] {
    switch (view.kind) {
        case "firstMinute":
            return [{ key: "live.grades.after_first_minute" }];
        case "loading":
            return [{ key: "live.grades.loading" }];
        case "noTargets":
            return [{ key: REASON_KEY[view.reason] }];
        case "graded":
            return [];
    }
}

function healingSplit(display: GradeDisplay, locale: string): Message[] {
    return [
        { key: "live.grades.self_heal", params: { n: formatValue(display.selfHeal, locale) } },
        { key: "live.grades.healing_teammates", params: { n: formatValue(display.healingTeammates, locale) } },
    ];
}

function gradedLines(stat: GradedStat, grade: StatGrade, locale: string): Message[] {
    const average: Message = {
        key: "live.grades.average",
        params: { value: formatAverage(stat, grade.average, locale) },
    };
    if (grade.score === null) return [average, { key: "live.grades.too_early_long" }];
    const key = stat === "deaths" ? "live.grades.fewer_deaths" : "live.grades.better_than";
    return [average, { key, params: { pct: Math.round(grade.score) } }];
}

function statTile(stat: GradedStat, view: ShownGradesView, names: StripNames): StatTile {
    const grade = view.kind === "graded" ? view.grades.stats[stat] : null;
    const graded = view.kind === "graded" && grade !== null;
    const mark: TileMark = !graded ? DASH : grade.letter ? { kind: "letter", letter: grade.letter } : TOO_EARLY;
    const lines = graded ? gradedLines(stat, grade, names.locale) : stateLines(view);
    if (stat === "healing") lines.push(...healingSplit(view.display, names.locale));
    return {
        stat,
        label: LABEL_KEY[stat],
        value: formatValue(view.display.values[stat], names.locale),
        mark,
        score: grade?.score ?? null,
        tip: {
            name: NAME_KEY[stat],
            lines,
            group: view.kind === "graded" && grade?.score != null ? groupMessage(view.group, names) : null,
        },
    };
}

function overallTile(view: ShownGradesView, names: StripNames): OverallTile {
    const base = { label: "live.grades.label.overall", groupTiers: [] as number[] };
    if (view.kind !== "graded") {
        const note: Message | null =
            view.kind === "firstMinute"
                ? { key: "live.grades.after_first_minute" }
                : view.kind === "noTargets"
                  ? { key: "live.grades.no_targets" }
                  : null;
        return {
            ...base,
            mark: DASH,
            score: null,
            note,
            tip: { name: base.label, lines: stateLines(view), group: null },
        };
    }
    const overall = view.grades.overall;
    return {
        ...base,
        mark: overall ? { kind: "letter", letter: overall.letter } : TOO_EARLY,
        score: overall?.score ?? null,
        note: view.frozen ? { key: "live.grades.frozen" } : null,
        groupTiers: groupTiers(view.group),
        tip: {
            name: base.label,
            lines: overall ? [] : [{ key: "live.grades.too_early_long" }],
            group: overall ? groupMessage(view.group, names) : null,
        },
    };
}

export function stripView(view: ShownGradesView, names: StripNames): StripView {
    return {
        overall: overallTile(view, names),
        tiles: GRADED_STATS.map((stat) => statTile(stat, view, names)),
    };
}
