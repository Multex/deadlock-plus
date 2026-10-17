import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";
import { describe, expect, it, vi } from "vitest";
import { gradeBySlot, gradeTone, ordinalCategory, scoreText, statLines, watchMatchGrade, type GradeDeps } from "./mvp";

const player = (over: Partial<MvpPlayerGrade> = {}): MvpPlayerGrade => ({
    accountId: 1,
    playerSlot: 0,
    heroId: 7,
    s10: 724,
    letter: "A-",
    place: 2,
    percentiles: [80, 30, 60, 75, 90, 40, null, 55],
    ...over,
});

const grade = (matchId: number, over: Partial<MvpMatchGrade> = {}): MvpMatchGrade => ({
    matchId,
    builtAt: 0,
    leaver: false,
    pathsChecked: true,
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

describe("statLines", () => {
    it("lists the graded stats in order and skips the ones skipped for the hero", () => {
        expect(statLines(player()).map((l) => l.key)).toEqual([
            "kills",
            "deaths",
            "assists",
            "souls",
            "playerDamage",
            "objectiveDamage",
            "support",
        ]);
    });

    it("turns deaths around so a higher share is always better", () => {
        const lines = statLines(player({ percentiles: [80.4, 30, null, null, null, null, null, null] }));
        expect(lines).toEqual([
            { key: "kills", better: 80 },
            { key: "deaths", better: 70 },
        ]);
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
