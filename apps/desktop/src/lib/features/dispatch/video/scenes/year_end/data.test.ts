import { describe, expect, it } from "vitest";
import { interpolate } from "$lib/core/i18n.svelte";
import type { Edition, EditionMonth } from "@deadlock-plus/stats/dispatch/types";
import { editionView } from "../../../edition-view";
import { fillCount, presentSections, yearEndVideo, type YearEndVideoDeps } from "./data";

const CATALOG: Record<string, string> = {
    "dispatch.masthead.name": "Deadlock+ Dispatch",
    "dispatch.masthead.edition_year_end": "Year-End Special",
    "dispatch.masthead.issue": "Vol. {volume} · No. {number}",
    "dispatch.numbers.matches": "Matches",
    "dispatch.numbers.record": "Record",
    "dispatch.numbers.record_value": "{wins}-{losses}",
    "dispatch.numbers.winrate": "Win rate",
    "dispatch.people.nemesis": "Most wanted",
    "dispatch.year_end.player_of_the_year": "Player of the Year",
    "dispatch.year_end.title": "{year}: the year of {player}",
    "dispatch.year_end.numbers.hours": "Hours",
    "dispatch.year_end.numbers.days": "Days played",
    "dispatch.year_end.numbers.heroes": "Heroes tried",
    "dispatch.year_end.numbers.longest_match": "Longest match",
    "dispatch.year_end.month.busiest": "Busiest · {count}",
    "dispatch.video.year_end.cta": "Get your own Year-End Special",
};

const t = (key: string, params?: Record<string, string | number>) => interpolate(CATALOG[key] ?? key, params);
const tn = (key: string, count: number, params?: Record<string, string | number>) =>
    t(`${key}_${count === 1 ? "one" : "other"}`, { count, ...params });

const deps: YearEndVideoDeps = {
    t,
    tn,
    number: (n) => n.toLocaleString("en-US"),
    hero: (id) => ({ name: `Hero${id}`, art: `art/${id}.png` }),
    day: (s) => `day ${s}`,
    dayRange: () => "Jan 1 – Nov 30, 2026",
    month: (s) => `month ${s}`,
    percent: (v) => `${Math.round(v * 100)}%`,
    duration: (s) => `${Math.floor(s / 60)}m`,
    netWorth: (n) => `${n}`,
    rank: (b) => `rank ${b}`,
    monthShort: (s) => ["Jan", "Feb", "Mar"][new Date(s * 1000).getUTCMonth()] ?? "?",
    locale: "en-US",
};

const monthStart = (m: number) => Date.UTC(2026, m, 1) / 1000;
const months = (counts: number[]): EditionMonth[] =>
    counts.map((matches, m) => ({ monthStartS: monthStart(m), matches, wins: 0 }));

function edition(over: Partial<Edition> = {}): Edition {
    return {
        schema: 1,
        id: "year_end-2026",
        window: { kind: "year_end", id: "year_end-2026", startS: monthStart(0), endS: monthStart(11), tz: "UTC" },
        accountId: 1,
        number: 4,
        volume: 2026,
        issuedAt: monthStart(11),
        stats: {
            matches: 456,
            wins: 264,
            losses: 192,
            unscored: 0,
            winrate: 0.58,
            playtimeS: 247 * 3600 + 1200,
            kills: 4013,
            deaths: 2873,
            assists: 5198,
            netWorth: 0,
            longestMatchS: 45 * 60,
            longestSession: null,
            busiestDay: null,
            nightShare: null,
            daysPlayed: 197,
            busiestMonth: null,
        },
        heroes: [
            { heroId: 2, games: 71, wins: 30, playtimeS: 3600 * 40 },
            { heroId: 1, games: 104, wins: 55, playtimeS: 3600 * 56 },
        ],
        newHeroes: [],
        bestGame: null,
        longestWin: 11,
        rank: null,
        season: null,
        mates: [],
        nemesis: { accountId: 9, name: "Saltmarsh", matches: 55, wins: 5 },
        combat: null,
        stories: [],
        playerName: "Lantern",
        months: months([10, 40, 20]),
        ...over,
    };
}

const build = (e: Edition) => yearEndVideo(e, editionView(e, deps), deps);

describe("yearEndVideo", () => {
    it("carries the raw numbers each tile counts up to, beside the text it lands on", () => {
        const tiles = build(edition()).numbers.tiles;
        expect(tiles.map((c) => [c.id, c.value, c.count])).toEqual([
            ["matches", "456", { template: "{0}", values: [456], percent: false }],
            ["hours", "247", { template: "{0}", values: [247], percent: false }],
            ["days", "197", { template: "{0}", values: [197], percent: false }],
            ["heroes", "2", { template: "{0}", values: [2], percent: false }],
            ["record", "264-192", { template: "{0}-{1}", values: [264, 192], percent: false }],
            ["winrate", "58%", { template: "{0}", values: [0.58], percent: true }],
            ["longest_match", "45m", null],
        ]);
    });

    it("titles the nemesis Most wanted", () => {
        expect(build(edition()).people?.nemesis?.title).toBe("Most wanted");
    });

    it("gives each month its share of the busiest one and flags that month", () => {
        const bars = build(edition()).months!.bars;
        expect(bars.slice(0, 3).map((b) => [b.share, b.busiest])).toEqual([
            [0.25, false],
            [1, true],
            [0.5, false],
        ]);
        expect(bars.map((b) => b.value)).toEqual(["10", "40", "20"]);
    });

    it("keeps the year as digits and the streak as a number for the scene to count", () => {
        const v = build(edition());
        expect(v.year).toBe("2026");
        expect(v.streak).toMatchObject({ count: 11, value: "11" });
        expect(v.cover.player).toBe("Lantern");
        expect(v.end.url).toBe("deadlockplus.app");
    });

    it("lists only the sections the edition has", () => {
        expect(presentSections(build(edition()))).toEqual(["numbers", "heroes", "months", "highlights", "people"]);
        const bare = build(edition({ months: undefined, longestWin: 0, nemesis: null }));
        expect(presentSections(bare)).toEqual(["numbers", "heroes"]);
    });
});

describe("fillCount", () => {
    it("formats each counted value in the edition's locale into the template", () => {
        const fmt = (n: number) => n.toLocaleString("en-US");
        expect(fillCount("{0}-{1}", [1234, 5], fmt)).toBe("1,234-5");
    });
});
