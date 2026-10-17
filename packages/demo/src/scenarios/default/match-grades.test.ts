import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle } from "../../scenario";
import { IDENTITY, MATCH_IDS } from "./identity";
import { defaultScenario } from "./index";
import { GRADE_CASES, letterFor } from "./match-grades";

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
        expect(grade).toMatchObject({ leaver: false, pathsChecked: true });
        expect(grade.players).toHaveLength(12);
        expect(grade.players.map((p) => [p.playerSlot, p.heroId, p.accountId].join()).sort()).toEqual(
            [...roster].sort(),
        );
        for (const p of grade.players) {
            expect(p.letter).toBe(letterFor(p.s10));
            expect(p.place).toBe(1 + grade.players.filter((o) => o.s10 > p.s10).length);
            expect(p.percentiles).toHaveLength(8);
        }
        expect(grade.players.map((p) => p.place)).toEqual([...grade.players.map((p) => p.place)].sort((a, b) => a - b));
    });

    it("has a tie, a leaver match and a game-captured grade", async () => {
        const handle = start();
        const tied = (await gradeOf(handle, GRADE_CASES.tie))!;
        const places = tied.players.map((p) => p.place);
        expect(new Set(places).size).toBeLessThan(places.length);

        const leaver = (await gradeOf(handle, GRADE_CASES.leaver))!;
        expect(leaver.leaver).toBe(true);
        expect(leaver.players).toHaveLength(11);
        expect(leaver.players.map((p) => p.accountId)).toContain(IDENTITY.accountId);

        expect((await gradeOf(handle, GRADE_CASES.provisional))!.pathsChecked).toBe(false);
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
