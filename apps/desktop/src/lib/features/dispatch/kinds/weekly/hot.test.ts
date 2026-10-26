import { describe, expect, it } from "vitest";
import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import { HOT_RECORD_MIN_MATCHES, HOT_RECORD_SHARE, HOT_STREAK, hotReasons, isHotWeek, type HotInput } from "./hot";

function week(extra: Partial<HotInput> = {}): HotInput {
    return {
        number: 4,
        stats: { wins: 6, losses: 6 },
        longestWin: 2,
        rank: null,
        bestGame: { letter: "A" },
        ...extra,
    };
}

const record = (wins: number, losses: number) => ({ stats: { wins, losses } });
const rank = (startBadge: number, endBadge: number) => ({ rank: { startBadge, endBadge } });
const graded = (letter: MvpLetter | null) => ({ bestGame: { letter } });

describe("hotReasons", () => {
    it("finds nothing in an ordinary week", () => {
        expect(hotReasons(week())).toEqual([]);
        expect(isHotWeek(week())).toBe(false);
    });

    it("counts a win streak from the threshold up", () => {
        expect(hotReasons(week({ longestWin: HOT_STREAK - 1 }))).toEqual([]);
        expect(hotReasons(week({ longestWin: HOT_STREAK }))).toEqual(["streak"]);
    });

    it("counts a climb to a higher badge, not a hold or a drop", () => {
        expect(hotReasons(week(rank(74, 75)))).toEqual(["climb"]);
        expect(hotReasons(week(rank(76, 81)))).toEqual(["climb"]);
        expect(hotReasons(week(rank(75, 75)))).toEqual([]);
        expect(hotReasons(week(rank(81, 76)))).toEqual([]);
    });

    it("counts a record share over enough scored matches", () => {
        const wins = Math.ceil(HOT_RECORD_MIN_MATCHES * HOT_RECORD_SHARE);
        expect(hotReasons(week(record(wins, HOT_RECORD_MIN_MATCHES - wins)))).toEqual(["record"]);
        expect(hotReasons(week(record(7, 3)))).toEqual(["record"]);
        expect(hotReasons(week(record(6, 3)))).toEqual([]);
    });

    it("needs the minimum matches before a record share counts", () => {
        expect(hotReasons(week(record(HOT_RECORD_MIN_MATCHES - 1, 0)))).toEqual([]);
    });

    it("counts an S-tier best game", () => {
        for (const letter of ["S+", "S", "S-"] as const) expect(hotReasons(week(graded(letter)))).toEqual(["s_grade"]);
        expect(hotReasons(week(graded("A+")))).toEqual([]);
        expect(hotReasons(week(graded(null)))).toEqual([]);
        expect(hotReasons(week({ bestGame: null }))).toEqual([]);
    });

    it("lists every reason a week is hot", () => {
        const all = week({ longestWin: 6, ...rank(70, 72), ...record(9, 2), ...graded("S") });
        expect(hotReasons(all)).toEqual(["streak", "climb", "record", "s_grade"]);
    });

    it("never calls the unfinished week hot", () => {
        expect(isHotWeek(week({ number: null, longestWin: 9 }))).toBe(false);
    });
});
