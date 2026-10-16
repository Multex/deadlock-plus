import { describe, expect, it } from "vitest";
import { GRADED_STATS, type GradedStat, type MatchGrades, type StatGrade } from "@deadlock-plus/stats/grades";
import type { GroupLabel } from "@deadlock-plus/stats/lobby-badge";
import type { GradeDisplay } from "./grades";
import type { GradesView } from "./grades.svelte";
import {
    BANDS,
    formatAverage,
    formatValue,
    groupMessage,
    stripView,
    type StripNames,
    type StatTile,
} from "./grade-strip";

type ShownView = Exclude<GradesView, { kind: "hidden" }>;

const names: StripNames = {
    locale: "en",
    hero: "Lash",
    tierName: (tier) =>
        ["", "Initiate", "Seeker", "Alchemist", "Arcanist", "Ritualist", "Emissary", "Archon", "Oracle"][tier] ??
        `T${tier}`,
};

const display: GradeDisplay = {
    values: { kills: 9, deaths: 3, assists: 8, souls: 1320.4, damage: 907.6, objectiveDamage: 135.2, healing: 4220 },
    selfHeal: 1200,
    healingTeammates: 3020,
};

function stat(over: Partial<StatGrade> = {}): StatGrade {
    return { value: 0, average: 0, pct: 60, score: 60, letter: "B", tooEarly: false, ...over };
}

function gradesOf(
    over: Partial<Record<GradedStat, StatGrade>> = {},
    overall: MatchGrades["overall"] = null,
): MatchGrades {
    const stats = Object.fromEntries(GRADED_STATS.map((s) => [s, stat()])) as Record<GradedStat, StatGrade>;
    return { stats: { ...stats, ...over }, overall, frozen: false, firstMinute: false };
}

function graded(opts: { grades?: MatchGrades; frozen?: boolean; group?: GroupLabel } = {}): ShownView {
    return {
        kind: "graded",
        heroId: 7,
        display,
        grades: opts.grades ?? gradesOf({}, { score: 62, letter: "B" }),
        frozen: opts.frozen ?? false,
        group: opts.group ?? { kind: "rank", tier: 8 },
    };
}

const tile = (view: ShownView, s: GradedStat): StatTile => {
    const found = stripView(view, names).tiles.find((t) => t.stat === s);
    if (!found) throw new Error(`no tile for ${s}`);
    return found;
};

describe("stripView tiles", () => {
    it("lists the seven stats in the plan's order with their label keys", () => {
        const view = stripView({ kind: "firstMinute", heroId: 7, display }, names);
        expect(view.tiles.map((t) => t.stat)).toEqual([
            "kills",
            "deaths",
            "assists",
            "souls",
            "damage",
            "objectiveDamage",
            "healing",
        ]);
        expect(view.tiles.map((t) => t.label)).toEqual([
            "live.grades.label.kills",
            "live.grades.label.deaths",
            "live.grades.label.assists",
            "live.grades.label.souls",
            "live.grades.label.damage",
            "live.grades.label.objective_damage",
            "live.grades.label.healing",
        ]);
        expect(view.tiles.every((t) => t.tip.name.startsWith("live.grades.name."))).toBe(true);
    });

    it("shows values in every shown state", () => {
        for (const v of [
            { kind: "firstMinute", heroId: 7, display },
            { kind: "loading", heroId: 7, display },
            { kind: "noTargets", reason: "offline", heroId: 7, display },
            graded(),
        ] satisfies ShownView[]) {
            expect(stripView(v, names).tiles.map((t) => t.value)).toEqual([
                "9",
                "3",
                "8",
                "1,320",
                "908",
                "135",
                "4,220",
            ]);
        }
    });

    it("draws a dash, never a letter, before targets apply", () => {
        for (const v of [
            { kind: "firstMinute", heroId: 7, display },
            { kind: "loading", heroId: 7, display },
            { kind: "noTargets", reason: "apiDown", heroId: 7, display },
        ] satisfies ShownView[]) {
            const view = stripView(v, names);
            expect(view.tiles.every((t) => t.mark.kind === "dash" && t.score === null)).toBe(true);
            expect(view.overall.mark).toEqual({ kind: "dash" });
        }
    });

    it("gives a graded stat its letter and bar score", () => {
        const view = graded({ grades: gradesOf({ kills: stat({ pct: 92.4, score: 92.4, letter: "S" }) }) });
        const k = tile(view, "kills");
        expect(k.mark).toEqual({ kind: "letter", letter: "S" });
        expect(k.score).toBe(92.4);
    });

    it("marks a too-early stat as too early with no score", () => {
        const view = graded({
            grades: gradesOf({ objectiveDamage: stat({ pct: null, score: null, letter: null, tooEarly: true }) }),
        });
        const o = tile(view, "objectiveDamage");
        expect(o.mark).toEqual({ kind: "tooEarly" });
        expect(o.score).toBeNull();
    });

    it("places deaths on the bar by score, not by percentile", () => {
        const view = graded({ grades: gradesOf({ deaths: stat({ pct: 20, score: 80, letter: "A" }) }) });
        expect(tile(view, "deaths").score).toBe(80);
    });
});

describe("overall tile", () => {
    it("notes the first minute", () => {
        const o = stripView({ kind: "firstMinute", heroId: 7, display }, names).overall;
        expect(o.note).toEqual({ key: "live.grades.after_first_minute" });
    });

    it("notes no targets and says why in the tooltip", () => {
        const o = stripView({ kind: "noTargets", reason: "rateLimited", heroId: 7, display }, names).overall;
        expect(o.note).toEqual({ key: "live.grades.no_targets" });
        expect(o.tip.lines).toEqual([{ key: "live.grades.reason.rate_limited" }]);
    });

    it("has no note while loading, and says it is loading in the tooltip", () => {
        const o = stripView({ kind: "loading", heroId: 7, display }, names).overall;
        expect(o.note).toBeNull();
        expect(o.tip.lines).toEqual([{ key: "live.grades.loading" }]);
    });

    it("shows the overall letter and score when graded", () => {
        const o = stripView(graded(), names).overall;
        expect(o.mark).toEqual({ kind: "letter", letter: "B" });
        expect(o.score).toBe(62);
        expect(o.note).toBeNull();
        expect(o.groupTiers).toEqual([8]);
    });

    it("keeps grading and notes frozen targets", () => {
        const o = stripView(graded({ frozen: true }), names).overall;
        expect(o.mark).toEqual({ kind: "letter", letter: "B" });
        expect(o.note).toEqual({ key: "live.grades.frozen" });
    });

    it("shows too early when every stat is too early", () => {
        const early = stat({ pct: null, score: null, letter: null, tooEarly: true });
        const all = Object.fromEntries(GRADED_STATS.map((s) => [s, early]));
        const o = stripView(graded({ grades: gradesOf(all, null) }), names).overall;
        expect(o.mark).toEqual({ kind: "tooEarly" });
        expect(o.score).toBeNull();
    });

    it("lists the tiers of the comparison group", () => {
        expect(
            stripView(graded({ group: { kind: "range", fromTier: 7, toTier: 9 } }), names).overall.groupTiers,
        ).toEqual([7, 9]);
        expect(stripView(graded({ group: { kind: "allRanks" } }), names).overall.groupTiers).toEqual([]);
        expect(stripView(graded({ group: { kind: "streetBrawl" } }), names).overall.groupTiers).toEqual([]);
        expect(stripView({ kind: "loading", heroId: 7, display }, names).overall.groupTiers).toEqual([]);
    });
});

describe("tile tooltip", () => {
    it("gives a graded stat its average, percentile and group", () => {
        const view = graded({
            grades: gradesOf({ kills: stat({ average: 6.24, pct: 92.4, score: 92.4, letter: "S" }) }),
        });
        const tip = tile(view, "kills").tip;
        expect(tip.name).toBe("live.grades.name.kills");
        expect(tip.lines).toEqual([
            { key: "live.grades.average", params: { value: "6.2" } },
            { key: "live.grades.better_than", params: { pct: 92 } },
        ]);
        expect(tip.group).toEqual({ key: "live.grades.group.rank", params: { hero: "Lash", rank: "Oracle" } });
    });

    it("words deaths as fewer deaths, from the score", () => {
        const view = graded({ grades: gradesOf({ deaths: stat({ average: 4.5, pct: 20, score: 80, letter: "A" }) }) });
        expect(tile(view, "deaths").tip.lines).toEqual([
            { key: "live.grades.average", params: { value: "4.5" } },
            { key: "live.grades.fewer_deaths", params: { pct: 80 } },
        ]);
    });

    it("says too early to grade, without a percentile or group", () => {
        const view = graded({
            grades: gradesOf({
                objectiveDamage: stat({ average: 40.4, pct: null, score: null, letter: null, tooEarly: true }),
            }),
        });
        const tip = tile(view, "objectiveDamage").tip;
        expect(tip.lines).toEqual([
            { key: "live.grades.average", params: { value: "40" } },
            { key: "live.grades.too_early_long" },
        ]);
        expect(tip.group).toBeNull();
    });

    it("splits healing into self heal and healing teammates in every state", () => {
        const split = [
            { key: "live.grades.self_heal", params: { n: "1,200" } },
            { key: "live.grades.healing_teammates", params: { n: "3,020" } },
        ];
        expect(tile(graded(), "healing").tip.lines.slice(-2)).toEqual(split);
        expect(tile({ kind: "firstMinute", heroId: 7, display }, "healing").tip.lines).toEqual([
            { key: "live.grades.after_first_minute" },
            ...split,
        ]);
        expect(tile(graded(), "kills").tip.lines.some((l) => l.key === "live.grades.self_heal")).toBe(false);
    });

    it("gives every stat the no-targets reason", () => {
        const reasons = {
            offline: "live.grades.reason.offline",
            apiDown: "live.grades.reason.api_down",
            rateLimited: "live.grades.reason.rate_limited",
            emptyData: "live.grades.reason.empty_data",
        } as const;
        for (const [reason, key] of Object.entries(reasons)) {
            const view = stripView(
                { kind: "noTargets", reason: reason as keyof typeof reasons, heroId: 7, display },
                names,
            );
            expect(view.tiles.every((t) => t.tip.lines[0].key === key && t.tip.group === null)).toBe(true);
        }
    });
});

describe("groupMessage", () => {
    it("covers the four label variants", () => {
        expect(groupMessage({ kind: "rank", tier: 8 }, names)).toEqual({
            key: "live.grades.group.rank",
            params: { hero: "Lash", rank: "Oracle" },
        });
        expect(groupMessage({ kind: "range", fromTier: 7, toTier: 9 }, names)).toEqual({
            key: "live.grades.group.range",
            params: { hero: "Lash", rankFrom: "Archon", rankTo: "T9" },
        });
        expect(groupMessage({ kind: "allRanks" }, names)).toEqual({
            key: "live.grades.group.all_ranks",
            params: { hero: "Lash" },
        });
        expect(groupMessage({ kind: "streetBrawl" }, names)).toEqual({
            key: "live.grades.group.street_brawl",
            params: { hero: "Lash" },
        });
    });
});

describe("formatting", () => {
    it("rounds values to whole numbers with grouping", () => {
        expect(formatValue(1320.6, "en")).toBe("1,321");
        expect(formatValue(9, "en")).toBe("9");
    });

    it("keeps one decimal on K/D/A averages and none elsewhere", () => {
        expect(formatAverage("kills", 6.24, "en")).toBe("6.2");
        expect(formatAverage("assists", 7, "en")).toBe("7");
        expect(formatAverage("souls", 1180.7, "en")).toBe("1,181");
        expect(formatAverage("healing", 3950.2, "en")).toBe("3,950");
    });
});

describe("BANDS", () => {
    it("covers 0-100 with the letter cut-offs", () => {
        expect(BANDS.map((b) => [b.letter, b.from, b.to])).toEqual([
            ["E", 0, 10],
            ["D", 10, 25],
            ["C", 25, 50],
            ["B", 50, 75],
            ["A", 75, 90],
            ["S", 90, 100],
        ]);
    });
});
