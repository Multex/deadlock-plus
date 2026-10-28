import { describe, expect, it } from "vitest";
import { BONUS_MAX, detectDispatchStories, rankDispatchStories, type DispatchEditionInput } from "./stories";
import type { DispatchStory, DispatchStoryKind, EditionWindow } from "./types";

const HOUR = 3600;

const BASE_STATS: DispatchEditionInput["stats"] = {
    matches: 5,
    wins: 3,
    losses: 2,
    unscored: 0,
    winrate: 0.6,
    playtimeS: 3 * HOUR,
    kills: 30,
    deaths: 20,
    assists: 40,
    netWorth: 150000,
    longestMatchS: 35 * 60,
    longestSession: { matches: 2, startS: 1_760_000_000, durationS: 4000 },
    busiestDay: { dayStartS: 1_759_968_000, matches: 3 },
    nightShare: 0.1,
    daysPlayed: 3,
    busiestMonth: { monthStartS: 1_759_276_800, matches: 5 },
};

/** Every section present but below every threshold: only `record` and `hours` fire. */
function edition(
    over: Partial<DispatchEditionInput> = {},
    stats: Partial<DispatchEditionInput["stats"]> = {},
): DispatchEditionInput {
    return {
        schema: 1,
        id: "weekly-2026-10-12",
        window: { kind: "weekly", id: "weekly-2026-10-12", startS: 1_760_220_000, endS: 1_760_824_800, tz: "UTC" },
        accountId: 1001,
        number: null,
        volume: 2026,
        issuedAt: null,
        heroes: [1, 2, 3, 6, 7].map((heroId) => ({ heroId, games: 1, wins: 1, playtimeS: 1800 })),
        newHeroes: [],
        bestGame: null,
        longestWin: 2,
        rank: null,
        season: null,
        mates: [],
        nemesis: null,
        combat: null,
        ...over,
        stats: { ...BASE_STATS, ...stats },
    };
}

const story = (e: DispatchEditionInput, kind: DispatchStoryKind) =>
    detectDispatchStories(e).find((s) => s.kind === kind);
const kinds = (e: DispatchEditionInput) => detectDispatchStories(e).map((s) => s.kind);

const combatRow = (heroId: number, damage: number | null, mvpRankCounts: number[] = [0, 0, 0]) => ({
    heroId,
    matches: 2,
    damage,
    objDamagePerMin: null,
    accuracy: null,
    critRate: null,
    mvpRankCounts,
    mvpRated: 2,
});

describe("base edition", () => {
    it("holds only the record and hours stories", () => {
        expect(kinds(edition()).sort()).toEqual(["hours", "record"]);
    });
});

describe("record", () => {
    it("tells a winning record with the match count", () => {
        expect(story(edition(), "record")).toMatchObject({
            headline: { key: "dispatch.story.record.headline_winning" },
            deck: { key: "dispatch.story.record.deck", count: 5 },
            params: {
                wins: { type: "number", value: 3 },
                losses: { type: "number", value: 2 },
                winrate: { type: "percent", value: 0.6 },
            },
        });
    });

    it("picks the losing and even headlines", () => {
        expect(story(edition({}, { wins: 1, losses: 4 }), "record")?.headline.key).toBe(
            "dispatch.story.record.headline_losing",
        );
        expect(story(edition({}, { wins: 2, losses: 2, unscored: 1 }), "record")?.headline.key).toBe(
            "dispatch.story.record.headline_even",
        );
    });

    it("scores a bigger margin higher", () => {
        const close = story(edition({}, { wins: 3, losses: 2 }), "record")!;
        const wide = story(edition({}, { wins: 5, losses: 0 }), "record")!;
        expect(wide.score - close.score).toBe(4);
    });

    it("stays quiet when no match was scored", () => {
        expect(story(edition({}, { wins: 0, losses: 0, unscored: 5, winrate: null }), "record")).toBeUndefined();
    });
});

describe("hours", () => {
    it("counts whole hours in matches", () => {
        expect(story(edition({}, { playtimeS: 5 * HOUR + 1500 }), "hours")).toMatchObject({
            headline: { key: "dispatch.story.hours.headline", count: 5 },
            deck: { key: "dispatch.story.hours.deck" },
            params: { hours: { type: "number", value: 5 }, playtime: { type: "duration", seconds: 5 * HOUR + 1500 } },
        });
    });

    it("says how many days once it reaches 24 hours", () => {
        expect(story(edition({}, { playtimeS: 37 * HOUR }), "hours")).toMatchObject({
            deck: { key: "dispatch.story.hours.deck_days", count: 1.5 },
            params: { days: { type: "number", value: 1.5 } },
        });
    });

    it("scores more hours higher, with a capped bonus", () => {
        const few = story(edition({}, { playtimeS: 2 * HOUR }), "hours")!;
        const many = story(edition({}, { playtimeS: 10 * HOUR }), "hours")!;
        const huge = story(edition({}, { playtimeS: 200 * HOUR }), "hours")!;
        expect(many.score - few.score).toBe(4);
        expect(huge.score - few.score).toBe(BONUS_MAX - 1);
    });

    it("stays quiet under an hour", () => {
        expect(story(edition({}, { playtimeS: HOUR - 1 }), "hours")).toBeUndefined();
    });
});

describe("top hero", () => {
    it("names the most played hero at 40% or more", () => {
        const heroes = [
            { heroId: 7, games: 2, wins: 1, playtimeS: 3000 },
            { heroId: 15, games: 2, wins: 2, playtimeS: 3600 },
            { heroId: 1, games: 1, wins: 0, playtimeS: 1800 },
        ];
        expect(story(edition({ heroes }), "top_hero")).toMatchObject({
            headline: { key: "dispatch.story.top_hero.headline" },
            deck: { key: "dispatch.story.top_hero.deck", count: 2 },
            params: { hero: { type: "hero", heroId: 15 }, share: { type: "percent", value: 0.4 } },
        });
    });

    it("stays quiet when no hero reaches 40%", () => {
        const heroes = [
            { heroId: 7, games: 2, wins: 1, playtimeS: 3000 },
            { heroId: 15, games: 1, wins: 1, playtimeS: 3600 },
        ];
        expect(story(edition({ heroes }, { matches: 6 }), "top_hero")).toBeUndefined();
    });

    it("always names the hero of the year on a Year-End Special", () => {
        const heroes = [
            { heroId: 7, games: 2, wins: 1, playtimeS: 3000 },
            { heroId: 15, games: 1, wins: 1, playtimeS: 3600 },
        ];
        expect(story(special(YEAR_END, { heroes }, { matches: 6 }), "top_hero")).toMatchObject({
            headline: { key: "dispatch.story.top_hero.headline_year" },
            params: { hero: { type: "hero", heroId: 7 } },
        });
    });
});

describe("new hero", () => {
    it("names the first new hero and counts them all", () => {
        expect(story(edition({ newHeroes: [31, 2] }), "new_hero")).toMatchObject({
            headline: { key: "dispatch.story.new_hero.headline", count: 2 },
            deck: { key: "dispatch.story.new_hero.deck", count: 2 },
            params: { hero: { type: "hero", heroId: 31 } },
        });
    });

    it("stays quiet without a new hero", () => {
        expect(story(edition({ newHeroes: [] }), "new_hero")).toBeUndefined();
    });
});

describe("best game", () => {
    const bestGame = {
        matchId: 555,
        heroId: 20,
        kills: 14,
        deaths: 2,
        assists: 11,
        netWorth: 42000,
        startTime: 1_760_300_000,
        letter: null,
        place: null,
    };

    it("tells the line of the best game", () => {
        expect(story(edition({ bestGame }), "best_game")).toMatchObject({
            matchId: 555,
            headline: { key: "dispatch.story.best_game.headline" },
            deck: { key: "dispatch.story.best_game.deck" },
            params: {
                hero: { type: "hero", heroId: 20 },
                kills: { type: "number", value: 14 },
                deaths: { type: "number", value: 2 },
                assists: { type: "number", value: 11 },
                net_worth: { type: "number", value: 42000 },
                date: { type: "date", unixS: 1_760_300_000 },
            },
        });
    });

    it("adds the grade letter and scores a better grade higher", () => {
        const plain = story(edition({ bestGame }), "best_game")!;
        const s = story(edition({ bestGame: { ...bestGame, letter: "S+", place: 1 } }), "best_game")!;
        const b = story(edition({ bestGame: { ...bestGame, letter: "B" } }), "best_game")!;
        expect(s.deck.key).toBe("dispatch.story.best_game.deck_graded");
        expect(s.params.letter).toEqual({ type: "grade", letter: "S+" });
        expect(s.score - plain.score).toBe(BONUS_MAX);
        expect(b.score).toBeLessThan(s.score);
        expect(b.score).toBeGreaterThan(plain.score);
    });

    it("stays quiet without a best game", () => {
        expect(story(edition({ bestGame: null }), "best_game")).toBeUndefined();
    });
});

describe("best streak", () => {
    it("counts a run of three or more wins", () => {
        expect(story(edition({ longestWin: 4 }), "best_streak")).toMatchObject({
            headline: { key: "dispatch.story.best_streak.headline", count: 4 },
            params: { wins: { type: "number", value: 4 } },
        });
    });

    it("stays quiet under three", () => {
        expect(story(edition({ longestWin: 2 }), "best_streak")).toBeUndefined();
    });
});

describe("longest session", () => {
    it("tells a sitting of three or more matches", () => {
        const longestSession = { matches: 4, startS: 1_760_400_000, durationS: 9000 };
        expect(story(edition({}, { longestSession }), "longest_session")).toMatchObject({
            headline: { key: "dispatch.story.longest_session.headline", count: 4 },
            params: { duration: { type: "duration", seconds: 9000 }, date: { type: "date", unixS: 1_760_400_000 } },
        });
    });

    it("stays quiet for short or missing sessions", () => {
        expect(story(edition(), "longest_session")).toBeUndefined();
        expect(story(edition({}, { longestSession: null }), "longest_session")).toBeUndefined();
    });
});

describe("busiest day", () => {
    it("tells a day with four or more matches", () => {
        const busiestDay = { dayStartS: 1_760_313_600, matches: 6 };
        expect(story(edition({}, { busiestDay }), "busiest_day")).toMatchObject({
            headline: { key: "dispatch.story.busiest_day.headline", count: 6 },
            params: { date: { type: "date", unixS: 1_760_313_600 } },
        });
    });

    it("stays quiet for a light or missing day", () => {
        expect(story(edition(), "busiest_day")).toBeUndefined();
        expect(story(edition({}, { busiestDay: null }), "busiest_day")).toBeUndefined();
    });
});

describe("longest match", () => {
    it("tells a match of 45 minutes or more", () => {
        expect(story(edition({}, { longestMatchS: 52 * 60 }), "longest_match")).toMatchObject({
            headline: { key: "dispatch.story.longest_match.headline" },
            params: { duration: { type: "duration", seconds: 52 * 60 } },
        });
    });

    it("stays quiet under 45 minutes", () => {
        expect(story(edition({}, { longestMatchS: 45 * 60 - 1 }), "longest_match")).toBeUndefined();
    });
});

describe("rank move", () => {
    it("tells a climb across badges", () => {
        const rank = { startBadge: 74, endBadge: 81, peakBadge: 82, delta: 900 };
        const s = story(edition({ rank }), "rank_move");
        expect(s).toMatchObject({
            headline: { key: "dispatch.story.rank_move.headline_up" },
            deck: { key: "dispatch.story.rank_move.deck_up" },
            params: {
                from: { type: "rank", badge: 74 },
                to: { type: "rank", badge: 81 },
                peak: { type: "rank", badge: 82 },
            },
        });
    });

    it("tells a fall and a held badge", () => {
        const down = story(
            edition({ rank: { startBadge: 81, endBadge: 75, peakBadge: 81, delta: -700 } }),
            "rank_move",
        );
        expect(down?.headline.key).toBe("dispatch.story.rank_move.headline_down");
        const held = story(edition({ rank: { startBadge: 81, endBadge: 81, peakBadge: 81, delta: 120 } }), "rank_move");
        expect(held?.headline.key).toBe("dispatch.story.rank_move.headline_held_up");
        expect(held?.deck.key).toBe("dispatch.story.rank_move.deck_held_up");
    });

    it("scores a bigger move higher", () => {
        const one = story(edition({ rank: { startBadge: 81, endBadge: 82, peakBadge: 82, delta: 300 } }), "rank_move")!;
        const two = story(edition({ rank: { startBadge: 81, endBadge: 83, peakBadge: 83, delta: 600 } }), "rank_move")!;
        expect(two.score - one.score).toBe(2);
    });

    it("stays quiet without a rank or a move", () => {
        expect(story(edition({ rank: null }), "rank_move")).toBeUndefined();
        expect(
            story(edition({ rank: { startBadge: 81, endBadge: 81, peakBadge: 82, delta: 0 } }), "rank_move"),
        ).toBeUndefined();
    });
});

describe("played with", () => {
    const mates = [
        { accountId: 9, name: "Ivy", matches: 3, wins: 1 },
        { accountId: 4, name: "Kelvin", matches: 5, wins: 4 },
    ];

    it("names the mate with the most party matches", () => {
        expect(story(edition({ mates }), "played_with")).toMatchObject({
            deck: { key: "dispatch.story.played_with.deck", count: 5 },
            params: {
                player: { type: "player", accountId: 4, name: "Kelvin" },
                wins: { type: "number", value: 4 },
            },
        });
    });

    it("stays quiet under three matches or without mates", () => {
        expect(
            story(edition({ mates: [{ accountId: 9, name: null, matches: 2, wins: 2 }] }), "played_with"),
        ).toBeUndefined();
        expect(story(edition({ mates: [] }), "played_with")).toBeUndefined();
    });
});

describe("nemesis", () => {
    it("names the enemy with the losses against them", () => {
        const nemesis = { accountId: 77, name: null, matches: 4, wins: 1 };
        expect(story(edition({ nemesis }), "nemesis")).toMatchObject({
            headline: { key: "dispatch.story.nemesis.headline" },
            deck: { key: "dispatch.story.nemesis.deck", count: 3 },
            params: { player: { type: "player", accountId: 77, name: null }, matches: { type: "number", value: 4 } },
        });
    });

    it("stays quiet under two losses or without a nemesis", () => {
        expect(
            story(edition({ nemesis: { accountId: 77, name: null, matches: 3, wins: 2 } }), "nemesis"),
        ).toBeUndefined();
        expect(story(edition({ nemesis: null }), "nemesis")).toBeUndefined();
    });
});

describe("damage", () => {
    it("sums player damage over heroes that report it", () => {
        const combat = [combatRow(1, 60000), combatRow(2, null), combatRow(3, 40000)];
        expect(story(edition({ combat }), "damage")).toMatchObject({
            deck: { key: "dispatch.story.damage.deck", count: 4 },
            params: { damage: { type: "number", value: 100000 } },
        });
    });

    it("stays quiet without combat stats or damage", () => {
        expect(story(edition({ combat: null }), "damage")).toBeUndefined();
        expect(story(edition({ combat: [combatRow(1, null)] }), "damage")).toBeUndefined();
    });
});

describe("mvp count", () => {
    it("sums every MVP ranking over all heroes", () => {
        const combat = [combatRow(1, 1, [1, 0, 2]), combatRow(2, 1, [0, 1, 0])];
        expect(story(edition({ combat }), "mvp_count")).toMatchObject({
            headline: { key: "dispatch.story.mvp_count.headline", count: 4 },
            params: { rated: { type: "number", value: 4 } },
        });
    });

    it("stays quiet at zero or without combat stats", () => {
        expect(story(edition({ combat: [combatRow(1, 1)] }), "mvp_count")).toBeUndefined();
        expect(story(edition({ combat: null }), "mvp_count")).toBeUndefined();
    });
});

describe("night owl", () => {
    it("tells a share of night matches of 30% or more", () => {
        expect(story(edition({}, { matches: 10, nightShare: 0.4 }), "night_owl")).toMatchObject({
            deck: { key: "dispatch.story.night_owl.deck", count: 4 },
            params: { share: { type: "percent", value: 0.4 } },
        });
    });

    it("stays quiet under 30% or without a share", () => {
        expect(story(edition({}, { nightShare: 0.29 }), "night_owl")).toBeUndefined();
        expect(story(edition({}, { nightShare: null }), "night_owl")).toBeUndefined();
    });
});

const DAY = 86400;
const COLLECTORS: EditionWindow = {
    kind: "collectors",
    id: "collectors-season_1",
    startS: 1_785_430_800,
    endS: 1_793_916_000,
    tz: "UTC",
};
const YEAR_END: EditionWindow = {
    kind: "year_end",
    id: "year_end-2026",
    startS: 1_764_547_200,
    endS: 1_764_547_200 + 365 * DAY,
    tz: "UTC",
};
const MONTHLY: EditionWindow = {
    kind: "monthly",
    id: "monthly-2026-10",
    startS: 1_759_276_800,
    endS: 1_759_276_800 + 31 * DAY,
    tz: "UTC",
};
const SEASON = { id: "season_1", name: "Beta Season 1", startS: COLLECTORS.startS, endS: COLLECTORS.endS };

const special = (
    window: EditionWindow,
    over: Partial<DispatchEditionInput> = {},
    stats: Partial<DispatchEditionInput["stats"]> = {},
) => edition({ window, id: window.id, season: window.kind === "collectors" ? SEASON : null, ...over }, stats);

const CLIMB = { startBadge: 76, endBadge: 82, peakBadge: 84, delta: 2400 };

describe("peak rank", () => {
    it("names the season's peak badge on a Collector's Copy", () => {
        expect(story(special(COLLECTORS, { rank: CLIMB }), "peak_rank")).toMatchObject({
            headline: { key: "dispatch.story.peak_rank.headline" },
            deck: { key: "dispatch.story.peak_rank.deck" },
            params: { peak: { type: "rank", badge: 84 }, end: { type: "rank", badge: 82 } },
        });
    });

    it("says so when the season ended at the peak", () => {
        const rank = { startBadge: 76, endBadge: 84, peakBadge: 84, delta: 2400 };
        expect(story(special(COLLECTORS, { rank }), "peak_rank")?.deck.key).toBe("dispatch.story.peak_rank.deck_top");
    });

    it("stays quiet without a rank or outside a Collector's Copy", () => {
        expect(story(special(COLLECTORS, { rank: null }), "peak_rank")).toBeUndefined();
        expect(story(edition({ rank: CLIMB }), "peak_rank")).toBeUndefined();
        expect(story(special(MONTHLY, { rank: CLIMB }), "peak_rank")).toBeUndefined();
    });
});

describe("season climb", () => {
    it("tells the climb from the first badge to the last in subrank steps", () => {
        expect(story(special(COLLECTORS, { rank: CLIMB }), "season_climb")).toMatchObject({
            headline: { key: "dispatch.story.season_climb.headline_up" },
            deck: { key: "dispatch.story.season_climb.deck_up", count: 2 },
            params: {
                from: { type: "rank", badge: 76 },
                to: { type: "rank", badge: 82 },
                steps: { type: "number", value: 2 },
            },
        });
    });

    it("tells a slide", () => {
        const rank = { startBadge: 82, endBadge: 81, peakBadge: 83, delta: -300 };
        expect(story(special(COLLECTORS, { rank }), "season_climb")).toMatchObject({
            headline: { key: "dispatch.story.season_climb.headline_down" },
            deck: { key: "dispatch.story.season_climb.deck_down", count: 1 },
        });
    });

    it("scores a bigger climb higher", () => {
        const one = story(special(COLLECTORS, { rank: { ...CLIMB, endBadge: 81 } }), "season_climb")!;
        const two = story(special(COLLECTORS, { rank: CLIMB }), "season_climb")!;
        expect(two.score - one.score).toBe(2);
    });

    it("stays quiet when the badge did not move or outside a Collector's Copy", () => {
        const held = { startBadge: 82, endBadge: 82, peakBadge: 83, delta: 200 };
        expect(story(special(COLLECTORS, { rank: held }), "season_climb")).toBeUndefined();
        expect(story(edition({ rank: CLIMB }), "season_climb")).toBeUndefined();
    });

    it("takes the place of the rank move when the badge moved", () => {
        expect(story(special(COLLECTORS, { rank: CLIMB }), "rank_move")).toBeUndefined();
        const held = { startBadge: 82, endBadge: 82, peakBadge: 83, delta: 200 };
        expect(story(special(COLLECTORS, { rank: held }), "rank_move")?.headline.key).toBe(
            "dispatch.story.rank_move.headline_held_up",
        );
    });
});

describe("days played", () => {
    it("counts the days with a match on a Year-End Special", () => {
        expect(story(special(YEAR_END, {}, { daysPlayed: 40 }), "days_played")).toMatchObject({
            headline: { key: "dispatch.story.days_played.headline", count: 40 },
            deck: { key: "dispatch.story.days_played.deck" },
            params: {
                days: { type: "number", value: 40 },
                total: { type: "number", value: 365 },
                share: { type: "percent", value: 40 / 365 },
            },
        });
    });

    it("runs in a monthly edition from 15 days", () => {
        expect(story(special(MONTHLY, {}, { daysPlayed: 15 }), "days_played")).toMatchObject({
            headline: { count: 15 },
            params: { total: { type: "number", value: 31 } },
        });
        expect(story(special(MONTHLY, {}, { daysPlayed: 14 }), "days_played")).toBeUndefined();
    });

    it("stays quiet in a weekly edition, a Collector's Copy, or without the count", () => {
        expect(story(edition({}, { daysPlayed: 7 }), "days_played")).toBeUndefined();
        expect(story(special(COLLECTORS, {}, { daysPlayed: 60 }), "days_played")).toBeUndefined();
        expect(story(special(YEAR_END, {}, { daysPlayed: undefined }), "days_played")).toBeUndefined();
    });
});

describe("heroes tried", () => {
    const heroes = [1, 2, 3, 6, 7].map((heroId) => ({ heroId, games: 2, wins: 1, playtimeS: 3600 }));

    it("counts the distinct heroes of a Year-End Special", () => {
        expect(story(special(YEAR_END, { heroes }), "heroes_tried")).toMatchObject({
            headline: { key: "dispatch.story.heroes_tried.headline", count: 5 },
            deck: { key: "dispatch.story.heroes_tried.deck" },
            params: { heroes: { type: "number", value: 5 } },
        });
    });

    it("adds how many were new", () => {
        expect(story(special(YEAR_END, { heroes, newHeroes: [6, 7] }), "heroes_tried")?.deck).toEqual({
            key: "dispatch.story.heroes_tried.deck_new",
            count: 2,
        });
    });

    it("stays quiet under three heroes or outside a Year-End Special", () => {
        expect(story(special(YEAR_END, { heroes: heroes.slice(0, 2) }), "heroes_tried")).toBeUndefined();
        expect(story(special(MONTHLY, { heroes }), "heroes_tried")).toBeUndefined();
    });
});

describe("busiest month", () => {
    const busiestMonth = { monthStartS: 1_780_272_000, matches: 31 };

    it("names the month with the most matches on a Year-End Special", () => {
        expect(story(special(YEAR_END, {}, { busiestMonth }), "busiest_month")).toMatchObject({
            headline: { key: "dispatch.story.busiest_month.headline", count: 31 },
            deck: { key: "dispatch.story.busiest_month.deck" },
            params: { month: { type: "month", unixS: 1_780_272_000 } },
        });
    });

    it("stays quiet for a light month, a missing one, or outside a Year-End Special", () => {
        const light = { ...busiestMonth, matches: 4 };
        expect(story(special(YEAR_END, {}, { busiestMonth: light }), "busiest_month")).toBeUndefined();
        expect(story(special(YEAR_END, {}, { busiestMonth: null }), "busiest_month")).toBeUndefined();
        expect(story(special(MONTHLY, {}, { busiestMonth }), "busiest_month")).toBeUndefined();
    });
});

describe("special editions", () => {
    const GRADED = {
        matchId: 1,
        heroId: 20,
        kills: 20,
        deaths: 0,
        assists: 10,
        netWorth: 60000,
        startTime: 1,
        letter: "S+" as const,
        place: 1,
    };
    const busy = { bestGame: GRADED, longestWin: 12, rank: CLIMB, newHeroes: [1, 2, 3, 6] };

    it("leads a Collector's Copy with the climb and the peak", () => {
        const stories = detectDispatchStories(special(COLLECTORS, busy, { playtimeS: 200 * HOUR }));
        expect(stories.slice(0, 2).map((s) => s.kind)).toEqual(["season_climb", "peak_rank"]);
    });

    it("leads a Collector's Copy with the peak when the badge held", () => {
        const rank = { startBadge: 82, endBadge: 82, peakBadge: 84, delta: 0 };
        expect(detectDispatchStories(special(COLLECTORS, { ...busy, rank }))[0].kind).toBe("peak_rank");
    });

    it("leads a Year-End Special with the hours, not the rank or the best game", () => {
        const stories = detectDispatchStories(special(YEAR_END, busy, { playtimeS: HOUR, daysPlayed: 300 }));
        expect(stories[0].kind).toBe("hours");
        expect(stories.slice(0, 4).map((s) => s.kind)).toEqual(["hours", "days_played", "top_hero", "best_game"]);
        expect(stories.map((s) => s.kind)).not.toContain("rank_move");
    });

    it("leads a Year-End Special with a hero who took nearly every match", () => {
        const heroes = [
            { heroId: 15, games: 19, wins: 10, playtimeS: 30 * HOUR },
            { heroId: 7, games: 1, wins: 0, playtimeS: HOUR },
        ];
        const e = special(YEAR_END, { ...busy, heroes }, { matches: 20, playtimeS: 2 * HOUR });
        expect(detectDispatchStories(e)[0].kind).toBe("top_hero");
    });
});

describe("ranking", () => {
    it("puts the highest score first", () => {
        const e = edition(
            {
                bestGame: {
                    matchId: 1,
                    heroId: 20,
                    kills: 10,
                    deaths: 1,
                    assists: 5,
                    netWorth: 40000,
                    startTime: 1,
                    letter: "A",
                    place: 2,
                },
                longestWin: 3,
                rank: { startBadge: 81, endBadge: 82, peakBadge: 82, delta: 300 },
            },
            { nightShare: 0.3 },
        );
        const stories = detectDispatchStories(e);
        expect(stories.map((s) => s.kind)).toEqual([
            "best_game",
            "rank_move",
            "hours",
            "record",
            "best_streak",
            "night_owl",
        ]);
        for (let i = 1; i < stories.length; i++) expect(stories[i].score).toBeLessThanOrEqual(stories[i - 1].score);
    });

    it("breaks equal scores by kind order", () => {
        const make = (kind: DispatchStoryKind): DispatchStory => ({
            kind,
            score: 40,
            headline: { key: `dispatch.story.${kind}.headline` },
            deck: { key: `dispatch.story.${kind}.deck` },
            params: {},
        });
        const ranked = rankDispatchStories([make("night_owl"), make("hours"), make("best_game"), make("record")]);
        expect(ranked.map((s) => s.kind)).toEqual(["best_game", "hours", "record", "night_owl"]);
    });

    it("keys every story under its own kind", () => {
        const e = edition({
            newHeroes: [3],
            longestWin: 5,
            nemesis: { accountId: 1, name: null, matches: 3, wins: 0 },
        });
        for (const s of detectDispatchStories(e)) {
            expect(s.headline.key.startsWith(`dispatch.story.${s.kind}.headline`)).toBe(true);
            expect(s.deck.key.startsWith(`dispatch.story.${s.kind}.deck`)).toBe(true);
        }
    });
});
