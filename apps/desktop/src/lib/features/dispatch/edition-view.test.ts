import { describe, expect, it } from "vitest";
import { interpolate } from "$lib/core/i18n.svelte";
import { copySeed } from "@deadlock-plus/stats/dispatch/copy";
import { editionSignals } from "@deadlock-plus/stats/dispatch/signals";
import { arrangeStories } from "@deadlock-plus/stats/dispatch/stories";
import type { DispatchStory, Edition } from "@deadlock-plus/stats/dispatch/types";
import { MIN_CONTRAST, contrast } from "@deadlock-plus/ui/accent";
import { PAPER_TOKENS } from "$lib/features/front-page/paper/tokens";
import { editionView, KIND_INKS, SECTION_IDS, sectionsFor, type DispatchViewDeps } from "./edition-view";

const CATALOG: Record<string, string> = {
    "dispatch.masthead.name": "Deadlock+ Dispatch",
    "dispatch.masthead.edition_weekly": "Weekly Edition",
    "dispatch.masthead.edition_monthly": "Monthly Edition",
    "dispatch.masthead.edition_live": "This week so far",
    "dispatch.masthead.edition_collectors": "{season} · Collector's Copy",
    "dispatch.masthead.edition_year_end": "Year-End Special",
    "dispatch.stamp.collectors": "Collector's Copy",
    "dispatch.masthead.issue": "Vol. {volume} · No. {number}",
    "dispatch.masthead.issue_live": "Vol. {volume}",
    "dispatch.player_fallback": "Unnamed player",
    "stats.hero_fallback": "Hero {id}",
    "dispatch.paper_label": "{name}, {edition}, {date}",
    "dispatch.section.stories": "Also inside",
    "dispatch.section.numbers": "By the numbers",
    "dispatch.section.best_game_weekly": "Game of the week",
    "dispatch.section.best_game_monthly": "Game of the month",
    "dispatch.section.best_game_collectors": "Game of the season",
    "dispatch.section.best_game_year_end": "Game of the year",
    "dispatch.section.heroes": "Hero report",
    "dispatch.section.people": "The company you keep",
    "dispatch.numbers.matches": "Matches",
    "dispatch.numbers.record": "Record",
    "dispatch.numbers.winrate": "Win rate",
    "dispatch.numbers.playtime": "Time played",
    "dispatch.numbers.kda": "K/D/A a game",
    "dispatch.numbers.playtime_value": "{hours} h",
    "dispatch.numbers.record_value": "{wins}-{losses}",
    "dispatch.people.mate_line_one": "{count} match together, {wins} won",
    "dispatch.people.mate_line_other": "{count} matches together, {wins} won",
    "dispatch.people.nemesis_line_one": "Beat you once in {matches}",
    "dispatch.people.nemesis_line_other": "Beat you {count} times in {matches}",
    "dispatch.photo_caption_one": "{hero}, {count} game this edition",
    "dispatch.photo_caption_other": "{hero}, {count} games this edition",
    "dispatch.story.record.headline_winning": "Winning ways: {wins}-{losses}",
    "dispatch.story.record.deck_one": "{count} match played, {winrate} won.",
    "dispatch.story.record.deck_other": "{count} matches played, {winrate} won.",
    "dispatch.story.hours.headline_other": "{count} hours on the clock",
    "dispatch.story.hours.deck": "{playtime} spent in matches, start to finish.",
    "dispatch.story.top_hero.headline": "{hero} runs the show",
    "dispatch.story.top_hero.deck_other": "{hero} took {share} of your matches: {count} games.",
    "dispatch.story.nemesis.headline": "Wanted: {player}",
    "dispatch.story.nemesis.deck_other": "Beat you {count} times in {matches} meetings.",
    "dispatch.story.best_game.headline": "{hero} steals the show",
    "dispatch.story.best_game.deck_graded": "{kills}/{deaths}/{assists} on {date}. The critics gave it {letter}.",
    "dispatch.story.rank_move.headline_up": "Climbing to {to}",
    "dispatch.story.rank_move.deck_up": "Up from {from}, peaking at {peak}.",
    "dispatch.story.busiest_month.headline_other": "Peak season: {count} matches in {month}",
};

/**
 * Story lines resolve to the kind-free fixture lines above (`dispatch.story.record.weekly.deck_2` reads
 * `dispatch.story.record.deck`), and kickers and tails to nothing, so these tests pin the params, not the words.
 */
const STORY_LINE =
    /^(dispatch\.story\.\w+)\.\w+\.(\w+?)_(?:\d+|name|num|ask|shout|quote|label|pair|plain)(_one|_other)?$/;
const lookup = (key: string) => {
    if (key.startsWith("dispatch.story.voice.")) return "";
    const m = STORY_LINE.exec(key);
    return CATALOG[m ? `${m[1]}.${m[2]}${m[3] ?? ""}` : key] ?? key;
};
const t = (key: string, params?: Record<string, string | number>) => interpolate(lookup(key), params);
const tn = (key: string, count: number, params?: Record<string, string | number>) =>
    interpolate(lookup(`${key}_${count === 1 ? "one" : "other"}`), { count, ...params });

const HEROES: Record<number, string> = { 1: "Infernus", 2: "Haze", 3: "Seven" };

const deps: DispatchViewDeps = {
    t,
    tn,
    number: (n) => new Intl.NumberFormat("en").format(n),
    hero: (id) => (HEROES[id] ? { name: HEROES[id], art: `art/${id}.png` } : undefined),
    day: (s, tz) => `${new Date(s * 1000).toISOString().slice(0, 10)}@${tz}`,
    dayRange: (a, b, tz) =>
        `${new Date(a * 1000).toISOString().slice(0, 10)}..${new Date(b * 1000).toISOString().slice(0, 10)}@${tz}`,
    month: (s, tz) => `${new Date(s * 1000).toISOString().slice(0, 7)}@${tz}`,
    percent: (v) => `${Math.round(v * 100)}%`,
    duration: (s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`,
    netWorth: (n) => `${Math.round(n / 1000)}k`,
    rank: (badge) => `Badge ${badge}`,
};

const TZ = "Europe/Berlin";
// Monday 2026-10-05 00:00 UTC, a week long.
const START = 1791158400;
const END = START + 7 * 86400;

function story(kind: DispatchStory["kind"], score: number, extra: Partial<DispatchStory> = {}): DispatchStory {
    return {
        kind,
        score,
        headline: { key: `dispatch.story.${kind}.headline` },
        deck: { key: `dispatch.story.${kind}.deck` },
        params: {},
        ...extra,
    };
}

const recordStory = story("record", 50, {
    headline: { key: "dispatch.story.record.headline_winning" },
    deck: { key: "dispatch.story.record.deck", count: 14 },
    params: {
        wins: { type: "number", value: 9 },
        losses: { type: "number", value: 5 },
        winrate: { type: "percent", value: 9 / 14 },
    },
});

function edition(extra: Partial<Edition> = {}): Edition {
    return {
        schema: 1,
        id: "weekly-2026-10-05",
        window: { kind: "weekly", id: "weekly-2026-10-05", startS: START, endS: END, tz: TZ },
        accountId: 42,
        number: 4,
        volume: 2026,
        issuedAt: END + 60,
        stats: {
            matches: 14,
            wins: 9,
            losses: 5,
            unscored: 0,
            winrate: 9 / 14,
            playtimeS: 7 * 3600 + 20 * 60,
            kills: 112,
            deaths: 42,
            assists: 140,
            netWorth: 400000,
            longestMatchS: 2900,
            longestSession: null,
            busiestDay: null,
            nightShare: null,
            daysPlayed: 5,
            busiestMonth: null,
        },
        heroes: [
            { heroId: 2, games: 8, wins: 6, playtimeS: 4 * 3600 },
            { heroId: 1, games: 4, wins: 2, playtimeS: 2 * 3600 },
            { heroId: 3, games: 2, wins: 1, playtimeS: 3600 },
        ],
        newHeroes: [],
        bestGame: {
            matchId: 77,
            heroId: 2,
            kills: 15,
            deaths: 2,
            assists: 11,
            netWorth: 41200,
            startTime: START + 3 * 86400,
            letter: "A+",
            place: 1,
        },
        longestWin: 2,
        rank: null,
        season: null,
        mates: [
            { accountId: 501, name: "Rook", matches: 6, wins: 4 },
            { accountId: 502, name: null, matches: 3, wins: 1 },
            { accountId: 503, name: "Wren", matches: 2, wins: 2 },
            { accountId: 504, name: "Fifth", matches: 1, wins: 0 },
        ],
        nemesis: { accountId: 900, name: "Grim", matches: 4, wins: 1 },
        combat: null,
        stories: [recordStory],
        ...extra,
    };
}

describe("editionView masthead", () => {
    it("names the paper, the weekly edition, its issue and the week's local dates", () => {
        const view = editionView(edition(), deps);
        expect(view.live).toBe(false);
        expect(view.masthead).toEqual({
            name: "Deadlock+ Dispatch",
            edition: "Weekly Edition",
            issue: "Vol. 2026 · No. 4",
            date: `2026-10-05..2026-10-11@${TZ}`,
        });
    });

    it("dates a monthly edition by its month", () => {
        const view = editionView(
            edition({
                id: "monthly-2026-09",
                window: { kind: "monthly", id: "monthly-2026-09", startS: 1788220800, endS: 1790812800, tz: TZ },
            }),
            deps,
        );
        expect(view.masthead.edition).toBe("Monthly Edition");
        expect(view.masthead.date).toBe(`2026-09@${TZ}`);
        expect(view.titles.best_game).toBe("Game of the month");
    });

    it("labels the paper and titles each section", () => {
        const view = editionView(edition(), deps);
        expect(view.label).toBe(`Deadlock+ Dispatch, Weekly Edition, 2026-10-05..2026-10-11@${TZ}`);
        expect(view.titles).toEqual({
            front: "Deadlock+ Dispatch",
            stories: "Also inside",
            numbers: "By the numbers",
            best_game: "Game of the week",
            heroes: "Hero report",
            people: "The company you keep",
        });
    });

    it("shows a live edition as this week so far, without an issue number", () => {
        const view = editionView(edition({ number: null, issuedAt: null }), deps);
        expect(view.live).toBe(true);
        expect(view.masthead.edition).toBe("This week so far");
        expect(view.masthead.issue).toBe("Vol. 2026");
    });
});

describe("editionView specials", () => {
    const SEASON = { id: "season_1", name: "Beta Season 1", startS: 1785430800, endS: 1793916000 };
    const collectors = () =>
        edition({
            id: "collectors-season_1",
            window: { kind: "collectors", id: "collectors-season_1", startS: SEASON.startS, endS: SEASON.endS, tz: TZ },
            season: SEASON,
        });
    // 2026-01-01 to 2026-12-01, both 00:00 UTC.
    const yearEnd = () =>
        edition({
            id: "year_end-2026",
            window: { kind: "year_end", id: "year_end-2026", startS: 1767225600, endS: 1796083200, tz: TZ },
        });

    it("names a Collector's Copy after its season and stamps it with the season's foil seal", () => {
        const view = editionView(collectors(), deps);
        expect(view.kind).toBe("collectors");
        expect(view.masthead.edition).toBe("Beta Season 1 · Collector's Copy");
        expect(view.masthead.date).toBe(`2026-07-30..2026-11-05@${TZ}`);
        expect(view.titles.best_game).toBe("Game of the season");
        expect(view.seal).toEqual({ title: "Collector's Copy", season: "Beta Season 1" });
    });

    it("still names a Collector's Copy whose season went missing", () => {
        const view = editionView(edition({ ...collectors(), season: null }), deps);
        expect(view.masthead.edition).toBe("Collector's Copy");
        expect(view.seal).toEqual({ title: "Collector's Copy" });
    });

    it("prints the Year-End Special from January 1 to November 30 with the game of the year", () => {
        const view = editionView(yearEnd(), deps);
        expect(view.masthead.edition).toBe("Year-End Special");
        expect(view.masthead.date).toBe(`2026-01-01..2026-11-30@${TZ}`);
        expect(view.titles.best_game).toBe("Game of the year");
        expect(view.seal).toBeUndefined();
    });

    it("gives weekly and monthly editions no seal", () => {
        expect(editionView(edition(), deps).seal).toBeUndefined();
    });

    it("inks the specials in gold, with gold that stays readable as text on the paper", () => {
        expect(KIND_INKS.weekly).toBe("");
        expect(KIND_INKS.monthly).toBe("");
        for (const kind of ["collectors", "year_end"] as const) {
            expect(KIND_INKS[kind]).toContain(`--fp-spot: ${PAPER_TOKENS["hk-ink"]}`);
            expect(KIND_INKS[kind]).toMatch(/--dp-rule: oklch\(/);
        }
        for (const bg of ["paper", "paper-edge", "highlight"] as const) {
            expect(contrast(PAPER_TOKENS["hk-ink"], PAPER_TOKENS[bg])).toBeGreaterThanOrEqual(MIN_CONTRAST);
        }
    });
});

describe("editionView stories", () => {
    const ranked = ["record", "hours", "top_hero", "nemesis", "best_game", "rank_move", "night_owl"] as const;
    const many = ranked.map((kind, i) => story(kind, 60 - i));

    it("puts the top story in the banner, the next four in columns and the rest in brief", () => {
        const e = edition({ stories: many });
        const order = arrangeStories(many, editionSignals(e), copySeed(e.accountId, e.id)).map((s) => s.kind);
        const view = editionView(e, deps);
        expect(view.stories!.map((s) => s.kind)).toEqual(order);
        expect(view.banner?.kind).toBe(order[0]);
        expect(view.columns.map((s) => s.kind)).toEqual(order.slice(1, 5));
        expect(view.briefs.map((b) => b.id)).toEqual([`${order[5]}-5`, `${order[6]}-6`]);
    });

    it("orders the page by what stands out, not only by the frozen scores", () => {
        const orders = new Set(
            ["weekly-2026-10-05", "weekly-2026-10-12", "weekly-2026-10-19", "weekly-2026-10-26"].map((id) =>
                editionView(edition({ id, stories: many }), deps)
                    .stories!.map((s) => s.kind)
                    .join(),
            ),
        );
        expect(orders.size).toBeGreaterThan(1);
    });

    it("leaves the briefs empty when the stories run out in the columns", () => {
        const view = editionView(edition({ stories: many.slice(0, 3) }), deps);
        expect(view.columns).toHaveLength(2);
        expect(view.briefs).toEqual([]);
    });

    it("has no banner when the edition has no stories", () => {
        const view = editionView(edition({ stories: [] }), deps);
        expect(view.banner).toBeUndefined();
        expect(view.columns).toEqual([]);
    });

    it("fills plural decks with their count and formats numbers and percents", () => {
        const view = editionView(edition({ stories: [recordStory] }), deps);
        expect(view.banner?.headline).toBe("Winning ways: 9-5");
        expect(view.banner?.deck).toBe("14 matches played, 64% won.");
    });

    it("formats hero, player, duration, date, grade and rank params", () => {
        const stories: DispatchStory[] = [
            story("best_game", 70, {
                deck: { key: "dispatch.story.best_game.deck_graded" },
                matchId: 77,
                params: {
                    hero: { type: "hero", heroId: 2 },
                    kills: { type: "number", value: 15 },
                    deaths: { type: "number", value: 2 },
                    assists: { type: "number", value: 11 },
                    date: { type: "date", unixS: START + 86400 },
                    letter: { type: "grade", letter: "A+" },
                },
            }),
            story("hours", 60, {
                headline: { key: "dispatch.story.hours.headline", count: 7 },
                params: {
                    hours: { type: "number", value: 7 },
                    playtime: { type: "duration", seconds: 7 * 3600 + 1200 },
                },
            }),
            story("nemesis", 50, {
                deck: { key: "dispatch.story.nemesis.deck", count: 3 },
                params: {
                    player: { type: "player", accountId: 900, name: null },
                    matches: { type: "number", value: 1200 },
                },
            }),
            story("top_hero", 40, { params: { hero: { type: "hero", heroId: 99 } } }),
            story("rank_move", 30, {
                headline: { key: "dispatch.story.rank_move.headline_up" },
                deck: { key: "dispatch.story.rank_move.deck_up" },
                params: {
                    from: { type: "rank", badge: 73 },
                    to: { type: "rank", badge: 81 },
                    peak: { type: "rank", badge: 82 },
                },
            }),
        ];
        const view = editionView(edition({ stories, nemesis: null, heroes: [] }), deps);
        const byKind = Object.fromEntries(view.stories!.map((s) => [s.kind, s]));
        expect(byKind.best_game).toMatchObject({
            headline: "Haze steals the show",
            deck: `15/2/11 on 2026-10-06@${TZ}. The critics gave it A+.`,
            matchId: 77,
        });
        expect(["hours", "nemesis", "top_hero", "rank_move"].map((k) => [byKind[k].headline, byKind[k].deck])).toEqual([
            ["7 hours on the clock", "7h 20m spent in matches, start to finish."],
            ["Wanted: Unnamed player", "Beat you 3 times in 1,200 meetings."],
            ["Hero 99 runs the show", expect.stringMatching(/^dispatch\.story\.top_hero\.weekly\.deck_[1-3]$/)],
            ["Climbing to Badge 81", "Up from Badge 73, peaking at Badge 82."],
        ]);
    });

    it("names a month param by its month in the edition's time zone", () => {
        const busiest = story("busiest_month", 50, {
            headline: { key: "dispatch.story.busiest_month.headline", count: 41 },
            params: { month: { type: "month", unixS: 1772323200 } },
        });
        expect(editionView(edition({ stories: [busiest] }), deps).banner?.headline).toBe(
            `Peak season: 41 matches in 2026-03@${TZ}`,
        );
    });

    it("names a known player by name", () => {
        const nemesis = story("nemesis", 50, { params: { player: { type: "player", accountId: 9, name: "Grim" } } });
        expect(editionView(edition({ stories: [nemesis], nemesis: null }), deps).banner?.headline).toBe("Wanted: Grim");
    });
});

describe("editionView photo", () => {
    it("shows the banner story's hero", () => {
        const banner = story("top_hero", 70, { params: { hero: { type: "hero", heroId: 1 } } });
        const view = editionView(edition({ stories: [banner] }), deps);
        expect(view.photo).toEqual({ src: "art/1.png", alt: "Infernus", caption: "Infernus, 4 games this edition" });
    });

    it("falls back to the most played hero when the banner has none", () => {
        expect(editionView(edition(), deps).photo).toMatchObject({ src: "art/2.png", alt: "Haze" });
    });

    it("is left out when the edition has no heroes", () => {
        expect(editionView(edition({ heroes: [], stories: [] }), deps).photo).toBeUndefined();
    });
});

describe("editionView numbers", () => {
    it("lists matches, record, win rate, time played and K/D/A a game", () => {
        expect(editionView(edition(), deps).numbers).toEqual([
            { id: "matches", label: "Matches", value: "14" },
            { id: "record", label: "Record", value: "9-5" },
            { id: "winrate", label: "Win rate", value: "64%" },
            { id: "playtime", label: "Time played", value: "7.3 h" },
            { id: "kda", label: "K/D/A a game", value: "8/3/10" },
        ]);
    });

    it("rounds time played to whole hours from 100 hours up, so the value stays short", () => {
        const base = edition();
        const playtime = (playtimeS: number) =>
            editionView(edition({ stats: { ...base.stats, playtimeS } }), deps).numbers.find((n) => n.id === "playtime")
                ?.value;
        expect(playtime(99.94 * 3600)).toBe("99.9 h");
        expect(playtime(125.5 * 3600)).toBe("126 h");
        expect(playtime(20 * 60)).toBe("0.3 h");
    });

    it("leaves the win rate out when no match was scored", () => {
        const base = edition();
        const view = editionView(edition({ stats: { ...base.stats, wins: 0, losses: 0, winrate: null } }), deps);
        expect(view.numbers.map((n) => n.id)).not.toContain("winrate");
    });

    it("is empty when the edition has no matches", () => {
        const base = edition();
        expect(editionView(edition({ stats: { ...base.stats, matches: 0 } }), deps).numbers).toEqual([]);
    });
});

describe("editionView best game", () => {
    it("shows the hero, line, net worth, grade and local date", () => {
        expect(editionView(edition(), deps).bestGame).toEqual({
            matchId: 77,
            hero: "Haze",
            art: "art/2.png",
            kda: "15/2/11",
            netWorth: "41k",
            grade: "A+",
            date: `2026-10-08@${TZ}`,
        });
    });

    it("has no grade when the game was not graded", () => {
        const base = edition();
        const view = editionView(edition({ bestGame: { ...base.bestGame!, letter: null } }), deps);
        expect(view.bestGame?.grade).toBeNull();
    });

    it("is left out without a best game", () => {
        expect(editionView(edition({ bestGame: null }), deps).bestGame).toBeUndefined();
    });
});

describe("editionView heroes", () => {
    it("lists the most played heroes with games, wins and time", () => {
        expect(editionView(edition(), deps).heroes[0]).toEqual({
            id: 2,
            hero: "Haze",
            games: "8",
            wins: "6",
            playtime: "4h 0m",
        });
    });

    it("keeps at most five heroes", () => {
        const heroes = Array.from({ length: 8 }, (_, i) => ({ heroId: i + 1, games: 8 - i, wins: 1, playtimeS: 60 }));
        expect(editionView(edition({ heroes }), deps).heroes).toHaveLength(5);
    });
});

describe("editionView people", () => {
    it("names the top three mates and the nemesis", () => {
        expect(editionView(edition(), deps).people).toEqual({
            mates: [
                { id: 501, name: "Rook", line: "6 matches together, 4 won" },
                { id: 502, name: "Unnamed player", line: "3 matches together, 1 won" },
                { id: 503, name: "Wren", line: "2 matches together, 2 won" },
            ],
            nemesis: { id: 900, name: "Grim", line: "Beat you 3 times in 4" },
        });
    });

    it("keeps the nemesis when no mate played along", () => {
        const view = editionView(edition({ mates: [] }), deps);
        expect(view.people?.mates).toEqual([]);
        expect(view.people?.nemesis?.name).toBe("Grim");
    });

    it("is left out with neither mates nor a nemesis", () => {
        expect(editionView(edition({ mates: [], nemesis: null }), deps).people).toBeUndefined();
    });
});

describe("sectionsFor", () => {
    it("lists every section of a full edition in paper order", () => {
        const stories = [recordStory, story("hours", 10)];
        expect(sectionsFor(editionView(edition({ stories }), deps))).toEqual([...SECTION_IDS]);
    });

    it("lists only the sections that have content", () => {
        const sparse = edition({ stories: [recordStory], bestGame: null, mates: [], nemesis: null, heroes: [] });
        expect(sectionsFor(editionView(sparse, deps))).toEqual(["front", "numbers"]);
    });
});
