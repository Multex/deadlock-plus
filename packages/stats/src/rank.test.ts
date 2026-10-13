import { describe, expect, it } from "vitest";
import {
    badgeParts,
    parseRankInfo,
    parseRanks,
    progressSeries,
    rankChanges,
    rankTrack,
    standing,
    subrankAt,
    windowStats,
    winsToNext,
    gainForWin,
    lossOutcome,
    winStreak,
    type RankInfo,
} from "./rank";
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
    rankBadge: 0,
    rankDelta: null,
    calibration: false,
    demotionProtected: false,
    ...over,
});

describe("rankTrack with provisional matches", () => {
    it("keeps ranked provisional rows with a badge, flagged and without a delta", () => {
        const track = rankTrack([
            match({ matchId: 1, rankBadge: 102 }),
            match({ matchId: 2, startTime: 2000, rankBadge: 103, provisional: true }),
        ]);
        expect(track.map((p) => p.matchId)).toEqual([1, 2]);
        expect(track[0].provisional).toBe(false);
        expect(track[1]).toMatchObject({ provisional: true, delta: null });
    });

    it("leaves out provisional rows that are unranked, street brawl or have no badge", () => {
        const track = rankTrack([
            match({ matchId: 1, rankBadge: 102 }),
            match({ matchId: 2, matchMode: 1, rankBadge: 103, provisional: true }),
            match({ matchId: 3, gameMode: 4, matchMode: 1, rankBadge: 103, provisional: true }),
            match({ matchId: 4, rankBadge: 0, provisional: true }),
        ]);
        expect(track.map((p) => p.matchId)).toEqual([1]);
    });
});

const info = (over: Partial<RankInfo> = {}): RankInfo => ({
    badge: 102,
    finalFlat: 64260,
    shieldsLeft: 2,
    placementLeft: 0,
    lastMatchId: 3,
    ...over,
});

const raw = (over: Record<string, unknown> = {}) => ({
    badge: 102,
    last_match: {
        match_id: 3,
        player_rank_initial_display_rank: 102,
        player_rank_initial_flat_progress: 64560,
        player_rank_final_flat_progress: 64260,
        player_rank_initial_calibration_games: 0,
        player_rank_initial_demotion_protection_games: 2,
        player_rank_consumed_demotion_protection: false,
        ...over,
    },
});

describe("badgeParts", () => {
    it("splits tier and subrank", () => {
        expect(badgeParts(102)).toEqual({ tier: 10, sub: 2 });
        expect(badgeParts(51)).toEqual({ tier: 5, sub: 1 });
    });

    it("returns null for no badge", () => {
        expect(badgeParts(0)).toBeNull();
        expect(badgeParts(null)).toBeNull();
    });
});

describe("parseRanks", () => {
    it("keeps tier, name, colour and the large image", () => {
        const out = parseRanks([
            { tier: 1, name: "Initiate", color: "#aaa", images: { large_webp: "https://x/1.webp" } },
            { tier: "x", name: "bad" },
            null,
        ]);
        expect(out).toEqual([{ tier: 1, name: "Initiate", color: "#aaa", image: "https://x/1.webp" }]);
    });

    it("returns an empty list for a non-array", () => {
        expect(parseRanks({})).toEqual([]);
    });
});

describe("parseRankInfo", () => {
    it("reads badge, progress and match id", () => {
        expect(parseRankInfo(raw())).toMatchObject({
            badge: 102,
            finalFlat: 64260,
            lastMatchId: 3,
        });
    });

    it("counts shields left after this match used one", () => {
        expect(parseRankInfo(raw())?.shieldsLeft).toBe(2);
        expect(parseRankInfo(raw({ player_rank_consumed_demotion_protection: true }))?.shieldsLeft).toBe(1);
        expect(
            parseRankInfo(
                raw({
                    player_rank_initial_demotion_protection_games: 0,
                    player_rank_consumed_demotion_protection: true,
                }),
            )?.shieldsLeft,
        ).toBe(0);
    });

    it("leaves shields unknown when the API does not report them", () => {
        expect(parseRankInfo(raw({ player_rank_initial_demotion_protection_games: null }))?.shieldsLeft).toBeNull();
    });

    it("is null without a last match or progress values", () => {
        expect(parseRankInfo({ badge: 0, last_match: null })).toBeNull();
        expect(parseRankInfo(raw({ player_rank_final_flat_progress: null }))).toBeNull();
        expect(parseRankInfo("x")).toBeNull();
        expect(parseRankInfo({ ...raw(), badge: 0 })).toBeNull();
    });
});

describe("subrankAt", () => {
    it("maps progress to tier, subrank and where that subrank starts", () => {
        expect(subrankAt(64560)).toEqual({ tier: 10, sub: 2, start: 64000, span: 1000 });
        expect(subrankAt(63000)).toEqual({ tier: 10, sub: 1, start: 63000, span: 1000 });
        expect(subrankAt(56000)).toEqual({ tier: 9, sub: 1, start: 56000, span: 1000 });
    });

    it("gives the sixth subrank the last 2000 points of the tier", () => {
        expect(subrankAt(61000)).toEqual({ tier: 9, sub: 6, start: 61000, span: 2000 });
        expect(subrankAt(62999)).toEqual({ tier: 9, sub: 6, start: 61000, span: 2000 });
        expect(subrankAt(63000).tier).toBe(10);
    });
});

describe("standing", () => {
    it("gives the API badge and progress inside the subrank", () => {
        expect(standing(info())).toEqual({ tier: 10, sub: 2, within: 260, span: 1000 });
    });

    it("measures the double-width sixth subrank against 2000", () => {
        expect(standing(info({ badge: 96, finalFlat: 62100 }))).toEqual({ tier: 9, sub: 6, within: 1100, span: 2000 });
    });

    it("hides the progress when it disagrees with the API badge", () => {
        expect(standing(info({ badge: 102, finalFlat: 63900 }))).toMatchObject({ tier: 10, sub: 2, within: null });
    });
});

describe("gainForWin", () => {
    it("pays 300 for the first two wins, then a streak bonus capped at 430", () => {
        expect([1, 2, 3, 4, 5, 6, 7, 12].map(gainForWin)).toEqual([300, 300, 370, 390, 410, 430, 430, 430]);
    });
});

describe("lossOutcome", () => {
    it("takes a flat 300 when there is enough progress", () => {
        expect(lossOutcome(700, 2)).toEqual({ lost: 300, usesShield: false, demotes: false });
        expect(lossOutcome(300, 0)).toEqual({ lost: 300, usesShield: false, demotes: false });
    });

    it("takes only the remaining progress and a shield when below 300", () => {
        expect(lossOutcome(70, 2)).toEqual({ lost: 70, usesShield: true, demotes: false });
    });

    it("costs only a shield at zero progress", () => {
        expect(lossOutcome(0, 1)).toEqual({ lost: 0, usesShield: true, demotes: false });
    });

    it("demotes when there is no shield left to absorb it", () => {
        expect(lossOutcome(70, 0)).toEqual({ lost: 300, usesShield: false, demotes: true });
        expect(lossOutcome(0, 0)).toEqual({ lost: 300, usesShield: false, demotes: true });
    });
});

describe("winStreak", () => {
    const t = (...o: ("win" | "loss" | "unscored")[]) =>
        rankTrack(o.map((outcome, i) => match({ matchId: i + 1, startTime: i + 1, rankBadge: 102, outcome })));

    it("counts trailing wins", () => {
        expect(winStreak(t("loss", "win", "win", "win"))).toBe(3);
        expect(winStreak(t("win", "loss"))).toBe(0);
    });

    it("skips unscored matches", () => {
        expect(winStreak(t("win", "unscored", "win"))).toBe(2);
    });
});

describe("winsToNext", () => {
    it("walks the streak bonuses until the subrank is full", () => {
        // 300 + 300 + 370 = 970 < 1000 after three, so the fourth win (390) finishes it.
        expect(winsToNext(0, 1000, 0)).toBe(4);
    });

    it("starts from the current streak", () => {
        expect(winsToNext(500, 1000, 4)).toBe(2);
    });

    it("uses the subrank's own span", () => {
        expect(winsToNext(0, 2000, 6)).toBe(5);
    });
});

describe("rankTrack", () => {
    it("keeps ranked matches with a badge, oldest first", () => {
        const track = rankTrack([
            match({ matchId: 3, startTime: 300, rankBadge: 32 }),
            match({ matchId: 1, startTime: 100, rankBadge: 31 }),
            match({ matchId: 2, startTime: 200, matchMode: 1, rankBadge: 99 }),
            match({ matchId: 4, startTime: 400, rankBadge: 0 }),
        ]);
        expect(track.map((p) => p.matchId)).toEqual([1, 3]);
    });

    it("carries outcome and hero", () => {
        const [p] = rankTrack([match({ rankBadge: 31, outcome: "loss", heroId: 7 })]);
        expect(p).toMatchObject({ outcome: "loss", heroId: 7 });
    });
});

describe("progressSeries", () => {
    it("rebuilds earlier progress by undoing later deltas", () => {
        const track = rankTrack([
            match({ matchId: 1, startTime: 1, rankBadge: 102, rankDelta: 300 }),
            match({ matchId: 2, startTime: 2, rankBadge: 102, rankDelta: -300 }),
            match({ matchId: 3, startTime: 3, rankBadge: 102, rankDelta: -300 }),
        ]);
        const s = progressSeries(track, info({ finalFlat: 64260 }));
        expect(s.map((p) => p.flat)).toEqual([64860, 64560, 64260]);
    });

    it("stops at the match the API reports as latest", () => {
        const track = rankTrack([
            match({ matchId: 1, startTime: 1, rankBadge: 102, rankDelta: 100 }),
            match({ matchId: 2, startTime: 2, rankBadge: 102, rankDelta: 100 }),
        ]);
        const s = progressSeries(track, info({ lastMatchId: 1, finalFlat: 5000 }));
        expect(s.map((p) => p.matchId)).toEqual([1]);
    });

    it("uses the last point when the API's latest match is not in the history", () => {
        const track = rankTrack([match({ matchId: 9, startTime: 1, rankBadge: 102, rankDelta: 100 })]);
        expect(progressSeries(track, info({ lastMatchId: 99, finalFlat: 5000 }))[0].flat).toBe(5000);
    });

    it("treats a missing delta as no change", () => {
        const track = rankTrack([
            match({ matchId: 1, startTime: 1, rankBadge: 102, rankDelta: null }),
            match({ matchId: 2, startTime: 2, rankBadge: 102, rankDelta: null }),
        ]);
        expect(progressSeries(track, info({ lastMatchId: 2, finalFlat: 5000 })).map((p) => p.flat)).toEqual([
            5000, 5000,
        ]);
    });
});

describe("rankChanges", () => {
    it("lists each badge change with direction, newest first", () => {
        const track = rankTrack([
            match({ matchId: 1, startTime: 1, rankBadge: 101 }),
            match({ matchId: 2, startTime: 2, rankBadge: 102 }),
            match({ matchId: 3, startTime: 3, rankBadge: 102 }),
            match({ matchId: 4, startTime: 4, rankBadge: 101 }),
        ]);
        expect(rankChanges(track).map((c) => [c.from, c.to, c.promoted])).toEqual([
            [102, 101, false],
            [101, 102, true],
        ]);
    });
});

describe("windowStats", () => {
    const track = rankTrack([
        match({ matchId: 1, startTime: 1, rankBadge: 102, rankDelta: 300, outcome: "win" }),
        match({ matchId: 2, startTime: 2, rankBadge: 102, rankDelta: -300, outcome: "loss", demotionProtected: true }),
        match({ matchId: 3, startTime: 3, rankBadge: 102, rankDelta: 400, outcome: "win" }),
        match({ matchId: 4, startTime: 4, rankBadge: 102, rankDelta: null, outcome: "unscored" }),
    ]);

    it("summarises the last N matches", () => {
        expect(windowStats(track, 4)).toMatchObject({ games: 3, wins: 2, losses: 1, net: 400, shieldsUsed: 1 });
    });

    it("has null averages without wins or losses", () => {
        const s = windowStats(rankTrack([match({ rankBadge: 102, outcome: "unscored" })]), 5);
        expect(s).toMatchObject({ games: 0, winrate: null });
    });
});
