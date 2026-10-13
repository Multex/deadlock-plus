import { describe, expect, it } from "vitest";
import { projectRank } from "./rank-live";
import type { RankInfo } from "./rank";
import type { Match } from "./stats";

const match = (over: Partial<Match> = {}): Match => ({
    matchId: 1,
    heroId: 10,
    startTime: 1000,
    matchMode: 4,
    gameMode: 1,
    outcome: "win",
    kills: 0,
    deaths: 0,
    assists: 0,
    netWorth: 0,
    durationS: 1800,
    rankBadge: 102,
    rankDelta: 300,
    calibration: false,
    demotionProtected: false,
    ...over,
});

const prov = (over: Partial<Match> = {}) => match({ rankDelta: null, provisional: true, startTime: 2000, ...over });

// Flat 7500 is tier 2 sub 2 (7000 + 1000 .. 9000 is sub 2) with 500 inside the subrank.
const info = (over: Partial<RankInfo> = {}): RankInfo => ({
    badge: 22,
    finalFlat: 8500,
    shieldsLeft: 1,
    placementLeft: 0,
    lastMatchId: 1,
    ...over,
});

describe("projectRank", () => {
    it("returns null without rank info", () => {
        expect(projectRank([match(), prov({ matchId: 2 })], null)).toBeNull();
    });

    it("adds nothing when there are no provisional ranked rows", () => {
        const p = projectRank([match()], info())!;
        expect(p.modelled).toBe(0);
        expect(p.info).toEqual(info());
        expect(p.track.map((t) => t.matchId)).toEqual([1]);
    });

    it("models a win from the confirmed progress", () => {
        const p = projectRank([match({ outcome: "loss" }), prov({ matchId: 2 })], info())!;
        expect(p.modelled).toBe(1);
        expect(p.info.finalFlat).toBe(8800);
        expect(p.info.lastMatchId).toBe(2);
        expect(p.track.at(-1)).toMatchObject({ matchId: 2, delta: 300, provisional: true });
    });

    it("continues the confirmed win streak for the bonus", () => {
        const confirmed = [match({ matchId: 1, startTime: 100 }), match({ matchId: 2, startTime: 200 })];
        const p = projectRank([...confirmed, prov({ matchId: 4 })], info({ lastMatchId: 2 }))!;
        expect(p.track.at(-1)!.delta).toBe(370);
    });

    it("charges a loss in full when the subrank holds enough progress", () => {
        const p = projectRank([match(), prov({ matchId: 2, outcome: "loss" })], info())!;
        expect(p.track.at(-1)).toMatchObject({ delta: -300, demotionProtected: false });
        expect(p.info.finalFlat).toBe(8200);
        expect(p.info.shieldsLeft).toBe(1);
    });

    it("spends a shield on a loss under 300 progress", () => {
        const p = projectRank([match(), prov({ matchId: 2, outcome: "loss" })], info({ finalFlat: 8100 }))!;
        expect(p.track.at(-1)).toMatchObject({ delta: -100, demotionProtected: true });
        expect(p.info.finalFlat).toBe(8000);
        expect(p.info.shieldsLeft).toBe(0);
    });

    it("chains several provisional rows in time order", () => {
        const rows = [
            match(),
            prov({ matchId: 3, startTime: 3000, outcome: "loss" }),
            prov({ matchId: 2, startTime: 2000 }),
        ];
        const p = projectRank(rows, info())!;
        expect(p.track.map((t) => t.matchId)).toEqual([1, 2, 3]);
        expect(p.info.finalFlat).toBe(8500 + 300 - 300);
        expect(p.modelled).toBe(2);
    });

    it("names the modelled badge from the modelled progress", () => {
        const p = projectRank([match(), prov({ matchId: 2 })], info({ finalFlat: 8800 }))!;
        expect(p.info.finalFlat).toBe(9100);
        expect(p.info.badge).toBe(23);
    });

    it("ignores unranked and street brawl provisional rows", () => {
        const rows = [
            match(),
            prov({ matchId: 2, matchMode: 1 }),
            prov({ matchId: 3, matchMode: 4, gameMode: 4, rankBadge: 0 }),
        ];
        const p = projectRank(rows, info())!;
        expect(p.modelled).toBe(0);
        expect(p.track.map((t) => t.matchId)).toEqual([1]);
    });

    it("shows no rank change when a provisional ranked row has no badge", () => {
        const p = projectRank([match(), prov({ matchId: 2, rankBadge: 0 })], info())!;
        expect(p.modelled).toBe(0);
        expect(p.info).toEqual(info());
        expect(p.track.map((t) => t.matchId)).toEqual([1]);
    });

    it("degrades for every row once one has no badge", () => {
        const rows = [match(), prov({ matchId: 2, rankBadge: 0 }), prov({ matchId: 3, startTime: 3000 })];
        const p = projectRank(rows, info())!;
        expect(p.modelled).toBe(0);
        expect(p.info.finalFlat).toBe(8500);
    });

    it("degrades during placement games", () => {
        const p = projectRank([match(), prov({ matchId: 2 })], info({ placementLeft: 3 }))!;
        expect(p.modelled).toBe(0);
        expect(p.info.finalFlat).toBe(8500);
    });

    it("degrades for a calibration row", () => {
        const p = projectRank([match(), prov({ matchId: 2, calibration: true })], info())!;
        expect(p.modelled).toBe(0);
    });

    it("degrades in the top tier where progress is not a point total", () => {
        const p = projectRank([match(), prov({ matchId: 2 })], info({ badge: 112, finalFlat: 72000 }), 11)!;
        expect(p.modelled).toBe(0);
    });

    it("skips provisional rows older than the last confirmed ranked match", () => {
        const rows = [match({ startTime: 5000 }), prov({ matchId: 2, startTime: 2000 })];
        const p = projectRank(rows, info())!;
        expect(p.modelled).toBe(0);
        expect(p.track.map((t) => t.matchId)).toEqual([1]);
    });

    it("gives unscored rows no delta and no progress", () => {
        const p = projectRank([match(), prov({ matchId: 2, outcome: "unscored" })], info())!;
        expect(p.info.finalFlat).toBe(8500);
        expect(p.track.at(-1)!.delta).toBeNull();
    });

    it("drops the modelled row once the API row for the same match arrives", () => {
        const p = projectRank([match(), match({ matchId: 2, startTime: 2000, rankDelta: 310 })], info())!;
        expect(p.modelled).toBe(0);
        expect(p.track.at(-1)).toMatchObject({ matchId: 2, delta: 310, provisional: false });
    });
});
