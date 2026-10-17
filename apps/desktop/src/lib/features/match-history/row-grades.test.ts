import { describe, expect, it, vi } from "vitest";
import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";
import { RowGrades, type RowGradeDeps } from "./row-grades.svelte";

const ME = 7;

function player(accountId: number, place: number): MvpPlayerGrade {
    return {
        accountId,
        playerSlot: place,
        heroId: 1,
        s10: 900 - place * 10,
        letter: "A",
        place,
        percentiles: [50, 50, 50, 50, 50, 50, null, null],
    };
}

function grade(matchId: number, players = [player(1, 1), player(ME, 2)]): MvpMatchGrade {
    return { matchId, builtAt: 0, leaver: false, pathsChecked: true, players };
}

function setup(stored: MvpMatchGrade[] = []) {
    const db = new Map(stored.map((g) => [g.matchId, g]));
    const queued: (() => void)[] = [];
    let emit: (ids: number[]) => void = () => {};
    const deps: RowGradeDeps = {
        readGrades: vi.fn(async (ids: number[]) => ids.flatMap((id) => db.get(id) ?? [])),
        listen: vi.fn(async (handler: (ids: number[]) => void) => {
            emit = handler;
            return () => {};
        }),
        accountId: () => ME,
        schedule: (run) => queued.push(run),
    };
    const flush = async () => {
        while (queued.length) queued.shift()!();
        await new Promise((r) => setTimeout(r, 0));
    };
    return { grades: new RowGrades(deps), deps, db, flush, emit: (ids: number[]) => emit(ids) };
}

describe("RowGrades", () => {
    it("reads every row watched in the same tick with one call and shows your own grade", async () => {
        const { grades, deps, flush } = setup([grade(1), grade(2)]);
        grades.watch(1);
        grades.watch(2);
        grades.watch(3);
        await flush();

        expect(deps.readGrades).toHaveBeenCalledTimes(1);
        expect(deps.readGrades).toHaveBeenCalledWith([1, 2, 3]);
        expect(grades.own(1)?.place).toBe(2);
        expect(grades.own(1)?.accountId).toBe(ME);
        expect(grades.own(3)).toBeNull();
    });

    it("shows nothing when you were not graded in the match", async () => {
        const { grades, flush } = setup([grade(1, [player(1, 1)])]);
        grades.watch(1);
        await flush();
        expect(grades.own(1)).toBeNull();
    });

    it("re-reads only the watched rows a graded event names", async () => {
        const { grades, deps, db, flush, emit } = setup();
        const stop = grades.watch(1);
        grades.watch(2);
        await flush();
        stop();

        db.set(2, grade(2));
        emit([1, 2, 9]);
        await flush();

        expect(deps.readGrades).toHaveBeenLastCalledWith([2]);
        expect(grades.own(2)?.place).toBe(2);
        expect(deps.listen).toHaveBeenCalledTimes(1);
    });

    it("keeps a row's grade while another row on the page still watches the same match", async () => {
        const { grades, deps, db, flush, emit } = setup();
        const first = grades.watch(1);
        grades.watch(1);
        await flush();
        first();

        db.set(1, grade(1));
        emit([1]);
        await flush();
        expect(deps.readGrades).toHaveBeenLastCalledWith([1]);
        expect(grades.own(1)).not.toBeNull();
    });

    it("does not read a known grade again when its row comes back, but retries a match without one", async () => {
        const { grades, deps, flush } = setup([grade(1)]);
        grades.watch(1)();
        grades.watch(2)();
        await flush();

        grades.watch(1);
        grades.watch(2);
        await flush();

        expect(deps.readGrades).toHaveBeenCalledTimes(2);
        expect(deps.readGrades).toHaveBeenLastCalledWith([2]);
    });

    it("leaves the shown grades as they were when a read fails", async () => {
        const { grades, deps, flush, emit } = setup([grade(1)]);
        grades.watch(1);
        await flush();

        vi.mocked(deps.readGrades).mockRejectedValueOnce(new Error("offline"));
        emit([1]);
        await flush();
        expect(grades.own(1)?.place).toBe(2);
    });
});
