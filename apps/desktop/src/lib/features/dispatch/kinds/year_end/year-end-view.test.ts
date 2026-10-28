import { describe, expect, it } from "vitest";
import { interpolate } from "$lib/core/i18n.svelte";
import type { Edition, EditionMonth } from "@deadlock-plus/stats/dispatch/types";
import { editionView } from "../../edition-view";
import { BAR_MAX, monthBars, splitTitle, yearEndView, type YearEndDeps } from "./year-end-view";

const CATALOG: Record<string, string> = {
    "dispatch.masthead.name": "Deadlock+ Dispatch",
    "dispatch.masthead.edition_year_end": "Year-End Special",
    "dispatch.masthead.issue": "Vol. {volume} · No. {number}",
    "dispatch.numbers.matches": "Matches",
    "dispatch.numbers.record": "Record",
    "dispatch.numbers.record_value": "{wins}-{losses}",
    "dispatch.numbers.winrate": "Win rate",
    "dispatch.numbers.kda": "K/D/A a game",
    "dispatch.section.best_game_year_end": "Game of the year",
    "dispatch.year_end.player_of_the_year": "Player of the Year",
    "dispatch.year_end.title": "{year}: the year of {player}",
    "dispatch.year_end.title_anonymous": "{year}: the year in review",
    "dispatch.year_end.cover.matches_one": "Match",
    "dispatch.year_end.cover.matches_other": "Matches",
    "dispatch.year_end.cover.hours_one": "Hour",
    "dispatch.year_end.cover.hours_other": "Hours",
    "dispatch.year_end.streak_line_one": "win in a row",
    "dispatch.year_end.streak_line_other": "wins in a row",
    "dispatch.year_end.cover.days_one": "Day played",
    "dispatch.year_end.cover.days_other": "Days played",
    "dispatch.year_end.cover.star_one": "{hero} · {count} game",
    "dispatch.year_end.cover.star_other": "{hero} · {count} games",
    "dispatch.year_end.numbers.hours": "Hours",
    "dispatch.year_end.numbers.days": "Days played",
    "dispatch.year_end.numbers.heroes": "Heroes tried",
    "dispatch.heroes.wins": "Won",
    "dispatch.year_end.numbers.longest_match": "Longest match",
    "dispatch.year_end.numbers.longest_session": "Longest session",
    "dispatch.year_end.numbers.session_value_one": "{count} game",
    "dispatch.year_end.numbers.session_value_other": "{count} games",
    "dispatch.year_end.month.busiest": "Busiest · {count}",
};

const t = (key: string, params?: Record<string, string | number>) => interpolate(CATALOG[key] ?? key, params);
const tn = (key: string, count: number, params?: Record<string, string | number>) =>
    t(`${key}_${count === 1 ? "one" : "other"}`, { count, ...params });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const deps: YearEndDeps = {
    t,
    tn,
    number: (n) => n.toLocaleString("en-US"),
    hero: (id) => ({ name: `Hero${id}`, art: `art/${id}.png` }),
    day: (s) => `day ${s}`,
    dayRange: (a, b, tz) =>
        new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz })
            .formatRange(a * 1000, b * 1000)
            .replace(/\s/g, " "),
    month: (s) => `month ${s}`,
    percent: (v) => `${Math.round(v * 100)}%`,
    duration: (s) => `${Math.floor(s / 60)}m`,
    netWorth: (n) => `${n}`,
    rank: (b) => `rank ${b}`,
    monthShort: (s) => MONTHS[new Date(s * 1000).getUTCMonth()],
};

/** Month `m` of the Year-End window: 0 is Dec 2025, 11 is Nov 2026. */
const monthStart = (m: number) => Date.UTC(2025, 11 + m, 1) / 1000;
const months = (counts: number[]): EditionMonth[] =>
    counts.map((matches, m) => ({ monthStartS: monthStart(m), matches, wins: Math.floor(matches / 2) }));

function edition(over: Partial<Edition> = {}): Edition {
    return {
        schema: 1,
        id: "year_end-2026",
        window: { kind: "year_end", id: "year_end-2026", startS: monthStart(0), endS: monthStart(12), tz: "UTC" },
        accountId: 1,
        number: 4,
        volume: 2026,
        issuedAt: monthStart(12),
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
            longestSession: { matches: 6, startS: 0, durationS: 4 * 3600 },
            busiestDay: null,
            nightShare: null,
            daysPlayed: 197,
            busiestMonth: null,
        },
        heroes: [
            { heroId: 2, games: 71, wins: 30, playtimeS: 3600 * 40 },
            { heroId: 1, games: 104, wins: 55, playtimeS: 3600 * 56 + 100 },
            { heroId: 3, games: 54, wins: 20, playtimeS: 3600 * 30 },
        ],
        newHeroes: [],
        bestGame: null,
        longestWin: 11,
        rank: null,
        season: null,
        mates: [],
        nemesis: null,
        combat: null,
        stories: [],
        playerName: "Lantern",
        months: months([48, 37, 43, 36, 41, 35, 41, 41, 51, 52, 56, 23]),
        ...over,
    };
}

const build = (e: Edition) => yearEndView(e, editionView(e, deps), deps);

describe("monthBars", () => {
    it("scales every bar from zero against the busiest month, so heights compare honestly", () => {
        const bars = monthBars(months([10, 40, 20]), "UTC", deps);
        expect(bars.slice(0, 3).map((b) => b.height)).toEqual([BAR_MAX / 4, BAR_MAX, BAR_MAX / 2]);
    });

    it("fills each bar with its wins on the same scale, so the gold reads against every month", () => {
        const bars = monthBars(
            [
                { monthStartS: monthStart(0), matches: 40, wins: 30 },
                { monthStartS: monthStart(1), matches: 20, wins: 5 },
            ],
            "UTC",
            deps,
        );
        expect(bars.map((b) => b.winHeight)).toEqual([(BAR_MAX * 3) / 4, BAR_MAX / 8]);
    });

    it("gives an empty month no bar at all", () => {
        const [empty] = monthBars(months([0, 12]), "UTC", deps);
        expect([empty.height, empty.winHeight]).toEqual([0, 0]);
    });

    it("marks only the first of two equally busy months", () => {
        const bars = monthBars(months([30, 30, 5]), "UTC", deps);
        expect(bars.map((b) => b.busiest)).toEqual([true, false, false]);
        expect(bars[0].count).toBe("Busiest · 30");
        expect(bars[1].count).toBe("30");
    });

    it("runs the strip Dec to Nov, one bar per month and nothing after", () => {
        const bars = monthBars(months(Array(12).fill(5)), "UTC", deps);
        expect(bars.map((b) => b.label)).toEqual(["Dec", ...MONTHS.slice(0, 11)]);
    });

    it("adds no slot for the month the issue comes out in, which the next special covers", () => {
        const bars = monthBars(months([37, 43, 36, 41, 35, 41, 41, 51, 52, 56, 23]), "UTC", deps);
        expect(bars).toHaveLength(11);
    });
});

describe("splitTitle", () => {
    it("cuts the title around the player so the name can be set in gold", () => {
        expect(splitTitle("{year}: the year of {player}", "2026", "Lantern")).toEqual({
            before: "2026: the year of ",
            player: "Lantern",
            after: "",
        });
    });

    it("keeps a translation that puts the name first", () => {
        expect(splitTitle("{player}: {year}", "2026", "Lantern")).toEqual({
            before: "",
            player: "Lantern",
            after: ": 2026",
        });
    });
});

describe("yearEndView", () => {
    it("puts the year, the player and three big numbers on the cover", () => {
        const { cover } = build(edition());
        expect(cover.year).toBe("2026");
        expect(cover.issue).toBe("Vol. 2026 · No. 4");
        expect(cover.span).toBe("Dec 1, 2025 – Nov 30, 2026");
        const { poster } = build(edition());
        expect(poster.title).toEqual({ before: "2026: the year of ", player: "Lantern", after: "" });
        expect(poster.kicker.span).toBe("Dec 1, 2025 – Nov 30, 2026");
        expect(cover.player).toBe("Lantern");
        expect(cover.title).toBe("Player of the Year");
        expect(cover.lines.map((l) => [l.value, l.label])).toEqual([
            ["456", "Matches"],
            ["247", "Hours"],
            ["11", "wins in a row"],
        ]);
    });

    it("stars the most played hero", () => {
        expect(build(edition()).cover.star).toEqual({ heroId: 1, line: "Hero1 · 104 games" });
    });

    it("drops the name line when the edition has no player name", () => {
        const { cover, poster } = build(edition({ playerName: undefined }));
        expect(cover.player).toBeNull();
        expect(poster.title).toEqual({ before: "2026: the year in review", player: "", after: "" });
    });

    it("shows days played instead of a streak of nothing", () => {
        expect(build(edition({ longestWin: 0 })).cover.lines[2]).toMatchObject({ value: "197", label: "Days played" });
        expect(build(edition({ longestWin: 0 })).poster.streak).toBeNull();
    });

    it("fills the year in numbers, leaving out what the edition does not know", () => {
        const cells = build(edition()).poster.cells.map((c) => [c.label, c.value]);
        expect(cells).toEqual([
            ["Matches", "456"],
            ["Hours", "247"],
            ["Days played", "197"],
            ["Heroes tried", "3"],
            ["Record", "264-192"],
            ["Win rate", "58%"],
            ["Longest match", "45m"],
            ["Longest session", "6 games"],
        ]);
        const bare = edition();
        bare.stats = { ...bare.stats, winrate: null, longestSession: null };
        expect(build(bare).poster.cells.map((c) => c.id)).not.toContain("winrate");
        expect(build(bare).poster.cells.map((c) => c.id)).not.toContain("session");
    });

    it("averages K/D/A per game to one decimal", () => {
        expect(build(edition()).poster.kda?.value).toBe("8.8 / 6.3 / 11.4");
    });

    it("leaves the month strip out of an edition frozen before months were stored", () => {
        expect(build(edition({ months: undefined })).poster.months).toBeNull();
        expect(build(edition()).poster.months?.bars.map((b) => b.label)).toEqual(["Dec", ...MONTHS.slice(0, 11)]);
    });

    it("keys the gold share of the month strip as wins", () => {
        expect(build(edition()).poster.months?.won).toBe("Won");
    });
});
