import { describe, expect, it } from "vitest";
import { rowState, summarizeCoverage } from "./coverage";

const DAY = 86_400;
const NOW = 1_800_000_000;
const row = (matchId: number, startTime: number) => ({ matchId, startTime });

describe("summarizeCoverage", () => {
    it("counts full, missing and the total", () => {
        const rows = [row(1, NOW - 100 * DAY), row(2, NOW - 90 * DAY), row(3, NOW - 80 * DAY)];
        const s = summarizeCoverage(rows, { withDetails: [1, 3], withReplay: [] }, NOW);
        expect(s).toMatchObject({ total: 3, full: 2, missing: 1, missingIds: [2] });
    });

    it("lists missing ids newest first whatever the row order", () => {
        const rows = [row(10, NOW - 3 * DAY), row(30, NOW - 1 * DAY), row(20, NOW - 2 * DAY)];
        const s = summarizeCoverage(rows, { withDetails: [], withReplay: [] }, NOW);
        expect(s.missingIds).toEqual([30, 20, 10]);
    });

    it("counts a match started just under 30 days ago as recent", () => {
        const rows = [row(1, NOW - 30 * DAY + 1)];
        expect(summarizeCoverage(rows, { withDetails: [], withReplay: [1] }, NOW)).toMatchObject({
            recent: 1,
            replays: 1,
        });
    });

    it("does not count a match started exactly 30 days ago as recent", () => {
        const rows = [row(1, NOW - 30 * DAY)];
        expect(summarizeCoverage(rows, { withDetails: [], withReplay: [1] }, NOW)).toMatchObject({
            recent: 0,
            replays: 0,
        });
    });

    it("counts replays only among recent rows", () => {
        const rows = [row(1, NOW - DAY), row(2, NOW - 2 * DAY), row(3, NOW - 60 * DAY)];
        const s = summarizeCoverage(rows, { withDetails: [1, 2, 3], withReplay: [1, 3] }, NOW);
        expect(s).toMatchObject({ recent: 2, replays: 1 });
    });

    it("handles no rows", () => {
        expect(summarizeCoverage([], { withDetails: [5], withReplay: [5] }, NOW)).toEqual({
            total: 0,
            full: 0,
            missing: 0,
            recent: 0,
            replays: 0,
            missingIds: [],
            replayIds: [],
        });
    });

    it("lists matches under 21 days with details and no replay as replay ids, newest first", () => {
        const rows = [
            row(1, NOW - 3 * DAY),
            row(2, NOW - DAY),
            row(3, NOW - 2 * DAY),
            row(4, NOW - 2 * DAY),
            row(5, NOW - 5 * DAY),
        ];
        const s = summarizeCoverage(rows, { withDetails: [1, 2, 3, 5], withReplay: [5] }, NOW);
        expect(s.replayIds).toEqual([2, 3, 1]);
    });

    it("leaves matches 21 days or older out of the replay ids", () => {
        const rows = [row(1, NOW - 21 * DAY + 1), row(2, NOW - 21 * DAY), row(3, NOW - 25 * DAY)];
        const s = summarizeCoverage(rows, { withDetails: [1, 2, 3], withReplay: [] }, NOW);
        expect(s.replayIds).toEqual([1]);
    });

    it("ignores coverage ids that are not in the rows", () => {
        const s = summarizeCoverage([row(1, NOW)], { withDetails: [1, 99], withReplay: [] }, NOW);
        expect(s).toMatchObject({ total: 1, full: 1, missing: 0 });
    });
});

describe("rowState", () => {
    const cov = { withDetails: [1], withReplay: [] };

    it("is missing without details", () => {
        expect(rowState(2, cov, new Set())).toBe("missing");
    });

    it("is null with details", () => {
        expect(rowState(1, cov, new Set())).toBeNull();
    });

    it("lets queued beat missing, from a set or an array", () => {
        expect(rowState(2, cov, new Set([2]))).toBe("recovering");
        expect(rowState(2, cov, [2])).toBe("recovering");
    });

    it("is null when coverage has not loaded", () => {
        expect(rowState(2, null, new Set([2]))).toBeNull();
    });
});
