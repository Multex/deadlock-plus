import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { IDENTITY, MATCH_IDS } from "./identity";
import { defaultScenario } from "./index";
import { GRADE_CASES, letterFor } from "./match-grades";

const METRICS = [
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

const OPTIONS = { appVersion: "1.2.3", changelog: "", mapItemsTsv: "# a\n# b\n# c" };

describe("demo match grades", () => {
    const handles: DemoHandle[] = [];
    const start = () => {
        const handle = install(defaultScenario(OPTIONS));
        handles.push(handle);
        return handle;
    };
    const gradeOf = (handle: DemoHandle, matchId: number) =>
        handle.invoke("mvp_grade_match", { matchId }) as Promise<MvpMatchGrade | null>;
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
    });

    it("follows the app's letter cut-offs", () => {
        expect([1000, 966, 965, 900, 899, 650, 649, 500, 499, 100, 99, 0].map(letterFor)).toEqual([
            "S+",
            "S+",
            "S",
            "S-",
            "A+",
            "B",
            "B-",
            "C+",
            "C",
            "E-",
            "F",
            "F",
        ]);
    });

    it("grades all twelve players of a match, by place, on the match's own slots and heroes", async () => {
        const handle = start();
        const grade = (await gradeOf(handle, MATCH_IDS[4]!))!;
        const meta = await (await fetch(`https://api.deadlock-api.com/v1/matches/${MATCH_IDS[4]}/metadata`)).json();
        const roster = meta.match_info.players.map((p: { player_slot: number; hero_id: number; account_id: number }) =>
            [p.player_slot, p.hero_id, p.account_id].join(),
        );

        expect(grade.matchId).toBe(MATCH_IDS[4]);
        expect(grade).toMatchObject({ leaver: false, pathsChecked: true, provisional: false });
        expect(grade).not.toHaveProperty("builtAt");
        expect(grade.players).toHaveLength(12);
        expect(grade.players.map((p) => [p.playerSlot, p.heroId, p.accountId].join()).sort()).toEqual(
            [...roster].sort(),
        );
        const places = grade.players.map((p) => p.place);
        expect(places).toEqual([...places].sort((a, b) => a - b));
        expect(places[0]).toBe(1);
    });

    it("gives every player the lobby-points shape", async () => {
        const grade = (await gradeOf(start(), MATCH_IDS[4]!))!;
        for (const p of grade.players) {
            expect(p).not.toHaveProperty("percentiles");
            expect([0, 1, 2]).toContain(p.team);
            expect(Number.isInteger(p.s10)).toBe(true);
            expect(p.s10).toBeGreaterThanOrEqual(0);
            expect(p.s10).toBeLessThanOrEqual(1000);
            expect(p.stats.map((s) => s.metric)).toEqual(METRICS);
            const sum = p.stats.reduce((acc, s) => acc + s.points, 0);
            expect(p.totalPoints).toBeCloseTo(sum + p.farmBonus, 6);
            expect(p.stats.find((s) => s.metric === "deaths")!.points).toBeLessThanOrEqual(0);
        }
    });

    it("keeps letters, places and ranks consistent with the points", async () => {
        const handle = start();
        for (const matchId of MATCH_IDS) {
            const grade = (await gradeOf(handle, matchId))!;
            const { players } = grade;
            for (const p of players) {
                expect(p.letter).toBe(letterFor(p.s10));
                expect(p.place).toBe(1 + players.filter((o) => o.totalPoints > p.totalPoints).length);
                for (const o of players) {
                    if (o.totalPoints > p.totalPoints) expect(o.s10).toBeGreaterThanOrEqual(p.s10);
                    if (o.totalPoints === p.totalPoints) expect(o.s10).toBe(p.s10);
                }
                p.stats.forEach((line, i) => {
                    expect(line.rank).toBe(1 + players.filter((o) => o.stats[i]!.points > line.points).length);
                });
            }
        }
    });

    it("has a tie, a leaver match and a game-captured grade", async () => {
        const handle = start();
        const tied = (await gradeOf(handle, GRADE_CASES.tie))!;
        const places = tied.players.map((p) => p.place);
        expect(new Set(places).size).toBeLessThan(places.length);
        const shared = tied.players.filter((p) => tied.players.filter((o) => o.place === p.place).length > 1);
        expect(shared.length).toBeGreaterThanOrEqual(2);
        expect(new Set(shared.map((p) => p.totalPoints)).size).toBeLessThan(shared.length);
        expect(places).toContain(1 + places.filter((x) => x < shared[0]!.place).length);
        expect(places).not.toContain(shared[0]!.place + 1);

        const leaver = (await gradeOf(handle, GRADE_CASES.leaver))!;
        expect(leaver.leaver).toBe(true);
        expect(leaver.players).toHaveLength(11);
        expect(leaver.players.map((p) => p.accountId)).toContain(IDENTITY.accountId);

        expect(leaver.players.map((p) => p.place)[0]).toBe(1);

        expect(await gradeOf(handle, GRADE_CASES.provisional)).toMatchObject({
            provisional: true,
            pathsChecked: false,
        });
    });

    it("gives the same grades on every install, and reads them back in bulk", async () => {
        const first = await gradeOf(start(), MATCH_IDS[0]!);
        const handle = start();
        expect(await gradeOf(handle, MATCH_IDS[0]!)).toEqual(first);
        const stored = (await handle.invoke("mvp_grades", { matchIds: [MATCH_IDS[0], 5, MATCH_IDS[1]] })) as unknown[];
        expect(stored).toEqual([first, await gradeOf(handle, MATCH_IDS[1]!)]);
        expect(await gradeOf(handle, 5)).toBeNull();
        expect(handle.unhandled()).toEqual([]);
    });
});
