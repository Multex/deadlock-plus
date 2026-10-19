import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import type { MvpMetric } from "@deadlock-plus/ipc-types/MvpMetric";
import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";
import { describe, expect, it, vi } from "vitest";
import {
    gradeBySlot,
    gradeTone,
    METRIC_LABEL,
    ordinalCategory,
    pointsText,
    scoreText,
    statLineText,
    statValueText,
    statLines,
    watchMatchGrade,
    type GradeDeps,
} from "./mvp";

const player = (over: Partial<MvpPlayerGrade> = {}): MvpPlayerGrade => ({
    accountId: 1,
    playerSlot: 0,
    heroId: 7,
    s10: 724,
    letter: "A-",
    place: 2,
    totalPoints: 9000,
    farmBonus: 0,
    team: 1,
    stats: [
        { metric: "cc", points: 2688, rank: 1 },
        { metric: "deaths", points: -1234, rank: 12 },
    ],
    ...over,
});

const grade = (matchId: number, over: Partial<MvpMatchGrade> = {}): MvpMatchGrade => ({
    matchId,
    leaver: false,
    pathsChecked: true,
    provisional: false,
    players: [player()],
    ...over,
});

describe("ordinalCategory", () => {
    const en = (place: number) => ordinalCategory(place, "en");

    it("picks the English ordinal form of the place", () => {
        expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(en)).toEqual([
            "one",
            "two",
            "few",
            "other",
            "other",
            "other",
            "other",
            "one",
            "two",
            "few",
            "one",
            "other",
        ]);
    });

    it("follows the locale's own ordinal rules", () => {
        expect(ordinalCategory(2, "de")).toBe("other");
    });
});

describe("gradeTone", () => {
    it("colours a letter like the live grade of the same band", () => {
        expect(gradeTone("S+")).toBe("S");
        expect(gradeTone("S-")).toBe("S");
        expect(gradeTone("A")).toBe("A");
        expect(gradeTone("B-")).toBe("B");
        expect(gradeTone("C+")).toBe("C");
        expect(gradeTone("D")).toBe("D");
        expect(gradeTone("E-")).toBe("E");
    });

    it("shows F in the lowest band", () => {
        expect(gradeTone("F")).toBe("E");
    });
});

describe("scoreText", () => {
    it("shows the score with one decimal", () => {
        expect(scoreText(724, "en")).toBe("72.4");
        expect(scoreText(1000, "en")).toBe("100.0");
        expect(scoreText(5, "en")).toBe("0.5");
        expect(scoreText(724, "de")).toBe("72,4");
    });
});

const ALL_METRICS: MvpMetric[] = [
    "early_damage",
    "late_damage",
    "early_assists",
    "late_assists",
    "prebase_objective",
    "base_objective",
    "damage_absorbed",
    "ally_healing",
    "heal_prevented",
    "barriers",
    "cs",
    "kills",
    "deaths",
    "cc",
];

describe("METRIC_LABEL", () => {
    it("has a key for every metric", () => {
        expect(Object.keys(METRIC_LABEL).sort()).toEqual([...ALL_METRICS].sort());
        for (const m of ALL_METRICS) expect(METRIC_LABEL[m]).toBe(`match_history.detail.grade.metric.${m}`);
    });
});

describe("pointsText", () => {
    it("signs positive points and groups digits by locale", () => {
        expect(pointsText(2688, "en")).toBe("+2,688");
        expect(pointsText(2688, "de")).toBe("+2.688");
    });

    it("uses a real minus for negative points", () => {
        expect(pointsText(-1234, "en")).toBe("−1,234");
    });

    it("shows zero without a sign", () => {
        expect(pointsText(0, "en")).toBe("0");
        expect(pointsText(-0.4, "en")).toBe("0");
    });
});

describe("statLineText", () => {
    const tr = (key: string) => key;
    const ordinal = (place: number) => `#${place}`;

    it("joins label, signed points and the lobby rank", () => {
        expect(statLineText({ metric: "cc", points: 2688, rank: 1 }, "en", tr, ordinal)).toBe(
            "match_history.detail.grade.metric.cc +2,688 · #1",
        );
    });

    it("shows negative points and keeps the rank at zero", () => {
        expect(statLineText({ metric: "deaths", points: -1234, rank: 12 }, "en", tr, ordinal)).toBe(
            "match_history.detail.grade.metric.deaths −1,234 · #12",
        );
        expect(statLineText({ metric: "ally_healing", points: 0, rank: 1 }, "en", tr, ordinal)).toBe(
            "match_history.detail.grade.metric.ally_healing 0 · #1",
        );
    });
});

describe("statValueText", () => {
    it("joins signed points and the rank without the label", () => {
        expect(statValueText({ metric: "cc", points: 278, rank: 11 }, "en", (n) => `#${n}`)).toBe("+278 · #11");
        expect(statValueText({ metric: "deaths", points: 0, rank: 1 }, "en", (n) => `#${n}`)).toBe("0 · #1");
    });
});

describe("statLines", () => {
    it("returns the player's lines in the order the backend sent them", () => {
        expect(statLines(player()).map((l) => l.metric)).toEqual(["cc", "deaths"]);
        const reordered = player({ stats: [{ metric: "kills", points: 5, rank: 3 }, ...player().stats] });
        expect(statLines(reordered).map((l) => l.metric)).toEqual(["kills", "cc", "deaths"]);
    });
});

describe("gradeBySlot", () => {
    it("finds each graded player by slot and leaves the rest out", () => {
        const g = grade(5, { players: [player({ playerSlot: 3 }), player({ playerSlot: 9, place: 1 })] });
        const bySlot = gradeBySlot(g);
        expect(bySlot.get(9)?.place).toBe(1);
        expect(bySlot.get(3)?.place).toBe(2);
        expect(bySlot.has(4)).toBe(false);
        expect(gradeBySlot(null).size).toBe(0);
    });
});

describe("watchMatchGrade", () => {
    type Listener = (ids: number[]) => void;

    function fakeDeps(over: Partial<GradeDeps> = {}) {
        let listener: Listener | null = null;
        const unlisten = vi.fn();
        const deps: GradeDeps = {
            gradeMatch: vi.fn(async (id: number) => grade(id)),
            readGrades: vi.fn(async (ids: number[]) => ids.map((id) => grade(id, { leaver: true }))),
            listen: vi.fn(async (handler: Listener) => {
                listener = handler;
                return unlisten;
            }),
            ...over,
        };
        return { deps, unlisten, emit: (ids: number[]) => listener?.(ids) };
    }
    const flush = () => new Promise((r) => setTimeout(r, 0));

    it("grades the match once when it opens", async () => {
        const { deps } = fakeDeps();
        const seen: (MvpMatchGrade | null)[] = [];
        watchMatchGrade(7, deps, (g) => seen.push(g));
        await flush();
        expect(deps.gradeMatch).toHaveBeenCalledTimes(1);
        expect(deps.gradeMatch).toHaveBeenCalledWith(7);
        expect(seen).toEqual([grade(7)]);
    });

    it("re-reads the stored grade when this match is graded, and ignores other matches", async () => {
        const { deps, emit } = fakeDeps();
        const seen: (MvpMatchGrade | null)[] = [];
        watchMatchGrade(7, deps, (g) => seen.push(g));
        await flush();
        emit([3, 4]);
        await flush();
        expect(deps.readGrades).not.toHaveBeenCalled();
        emit([3, 7]);
        await flush();
        expect(deps.readGrades).toHaveBeenCalledWith([7]);
        expect(seen.at(-1)).toEqual(grade(7, { leaver: true }));
        expect(deps.gradeMatch).toHaveBeenCalledTimes(1);
    });

    it("keeps the shown grade when the re-read finds none", async () => {
        const { deps, emit } = fakeDeps({ readGrades: vi.fn(async () => []) });
        const seen: (MvpMatchGrade | null)[] = [];
        watchMatchGrade(7, deps, (g) => seen.push(g));
        await flush();
        emit([7]);
        await flush();
        expect(seen).toEqual([grade(7)]);
    });

    it("shows nothing when grading fails", async () => {
        const { deps } = fakeDeps({ gradeMatch: vi.fn(async () => Promise.reject(new Error("offline"))) });
        const seen: (MvpMatchGrade | null)[] = [];
        watchMatchGrade(7, deps, (g) => seen.push(g));
        await flush();
        expect(seen).toEqual([]);
    });

    it("does not let a slow first grade replace a newer re-read", async () => {
        let finish: (g: MvpMatchGrade) => void = () => {};
        const { deps, emit } = fakeDeps({ gradeMatch: vi.fn(() => new Promise<MvpMatchGrade>((r) => (finish = r))) });
        const seen: (MvpMatchGrade | null)[] = [];
        watchMatchGrade(7, deps, (g) => seen.push(g));
        await flush();
        emit([7]);
        await flush();
        finish(grade(7));
        await flush();
        expect(seen).toEqual([grade(7, { leaver: true })]);
    });

    it("stops listening and drops late answers once stopped", async () => {
        let finish: (g: MvpMatchGrade) => void = () => {};
        const { deps, unlisten } = fakeDeps({
            gradeMatch: vi.fn(() => new Promise<MvpMatchGrade>((r) => (finish = r))),
        });
        const seen: (MvpMatchGrade | null)[] = [];
        const stop = watchMatchGrade(7, deps, (g) => seen.push(g));
        await flush();
        stop();
        finish(grade(7));
        await flush();
        expect(seen).toEqual([]);
        expect(unlisten).toHaveBeenCalledTimes(1);
    });

    it("unlistens when stopped before the listener is ready", async () => {
        const { deps, unlisten } = fakeDeps();
        const stop = watchMatchGrade(7, deps, () => {});
        stop();
        await flush();
        expect(unlisten).toHaveBeenCalledTimes(1);
    });
});
