import { describe, expect, it } from "vitest";
import { interpolate } from "$lib/core/i18n.svelte";
import type { DispatchStory, Edition, EditionDay } from "@deadlock-plus/stats/dispatch/types";
import { editionView, type DispatchViewDeps } from "../../edition-view";
import { buildMagazine, type MagazineDeps } from "./magazine";
import { MONTH_PALETTES, heroPalette } from "./palette";

const CATALOG: Record<string, string> = {
    "dispatch.masthead.name": "Deadlock+ Dispatch",
    "dispatch.monthly.cover_line": "The Monthly · {month} · No. {number}",
    "dispatch.monthly.cover_line_preview": "The Monthly · {month}",
    "dispatch.monthly.folio": "{name} · {month}",
    "dispatch.monthly.kicker.record": "The record",
    "dispatch.monthly.kicker.hours": "Time served",
    "dispatch.monthly.kicker.best_game": "Game of the month",
    "dispatch.monthly.kicker.rank_move": "Rank report",
    "dispatch.monthly.kicker.played_with": "Duo of the month",
    "dispatch.monthly.kicker.top_hero": "Cover star",
    "dispatch.monthly.page_ref": "p. {page}",
    "dispatch.monthly.cover_star_line_other": "{count} games, {share} of your {month}",
    "dispatch.monthly.sticker.top": "Inside",
    "dispatch.monthly.sticker.grade": "Best game grade",
    "dispatch.monthly.sticker.kda": "Best game",
    "dispatch.monthly.next_line": "{month}, out {date}",
    "dispatch.monthly.fact.days_played": "Days played",
    "dispatch.monthly.fact.days_played_note_other": "of {count} in the month",
};

const t = (key: string, params?: Record<string, string | number>) => interpolate(CATALOG[key] ?? key, params);
const tn = (key: string, count: number, params?: Record<string, string | number>) => {
    const full = `${key}_${count === 1 ? "one" : "other"}`;
    return interpolate(CATALOG[full] ?? full, { count, ...params });
};
const HEROES: Record<number, string> = { 1: "Infernus", 2: "Haze", 3: "Seven", 4: "Lash", 5: "Ivy", 6: "Abrams" };
const number = (n: number) => new Intl.NumberFormat("en").format(n);
const percent = (v: number) => `${Math.round(v * 100)}%`;

const viewDeps: DispatchViewDeps = {
    t,
    tn,
    number,
    hero: (id) => (HEROES[id] ? { name: HEROES[id], art: `card/${id}.png` } : undefined),
    day: (s) => new Date(s * 1000).toISOString().slice(0, 10),
    dayRange: () => "",
    month: (s, tz) => new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: tz }).format(s * 1000),
    percent,
    duration: (s) => `${Math.floor(s / 3600)}h`,
    netWorth: (n) => `${Math.round(n / 1000)}K`,
    rank: (b) => `Badge ${b}`,
};

const deps: MagazineDeps = {
    t,
    tn,
    number,
    percent,
    percentParts: (v) => [
        { value: String(Math.round(v * 100)), sign: false },
        { value: "%", sign: true },
    ],
    duration: viewDeps.duration,
    date: (s, tz, options) => new Intl.DateTimeFormat("en", { ...options, timeZone: tz }).format(s * 1000),
    hero: (id) => (HEROES[id] ? { name: HEROES[id], icon: `icon/${id}.png`, art: `card/${id}.png` } : undefined),
    rank: (b) => ({ name: `Badge ${b}`, image: `rank/${Math.floor(b / 10)}.png` }),
};

const TZ = "Europe/Berlin";
// September 2026 in Berlin (CEST, UTC+2); Sep 1 is a Tuesday.
const START = Date.UTC(2026, 7, 31, 22) / 1000;
const END = Date.UTC(2026, 8, 30, 22) / 1000;

const days: EditionDay[] = Array.from({ length: 30 }, (_, i) => ({
    dayStartS: START + i * 86400,
    matches: i === 4 ? 4 : i === 11 ? 2 : 0,
    wins: i === 4 ? 3 : i === 11 ? 1 : 0,
}));

const story = (kind: DispatchStory["kind"], extra: Partial<DispatchStory> = {}): DispatchStory => ({
    kind,
    score: 1,
    headline: { key: `dispatch.story.${kind}.headline` },
    deck: { key: `dispatch.story.${kind}.deck` },
    params: {},
    ...extra,
});

function edition(extra: Partial<Edition> = {}): Edition {
    return {
        schema: 1,
        id: "monthly-2026-09",
        window: { kind: "monthly", id: "monthly-2026-09", startS: START, endS: END, tz: TZ },
        accountId: 42,
        number: 2,
        volume: 2026,
        issuedAt: END + 60,
        stats: {
            matches: 52,
            wins: 26,
            losses: 26,
            unscored: 0,
            winrate: 0.5,
            playtimeS: 28.4 * 3600,
            kills: 508,
            deaths: 322,
            assists: 551,
            netWorth: 2_000_000,
            longestMatchS: 2700,
            longestSession: { matches: 5, startS: START + 29 * 86400, durationS: 3 * 3600 + 42 * 60 },
            busiestDay: { dayStartS: START + 25 * 86400, matches: 5 },
            nightShare: 0.1,
            daysPlayed: 22,
            busiestMonth: null,
        },
        heroes: [
            { heroId: 4, games: 15, wins: 8, playtimeS: 8 * 3600 },
            { heroId: 6, games: 10, wins: 7, playtimeS: 5 * 3600 },
            { heroId: 1, games: 7, wins: 3, playtimeS: 4 * 3600 },
            { heroId: 2, games: 4, wins: 2, playtimeS: 2 * 3600 },
            { heroId: 3, games: 3, wins: 2, playtimeS: 3600 },
            { heroId: 5, games: 2, wins: 1, playtimeS: 1800 },
        ],
        newHeroes: [],
        bestGame: {
            matchId: 9,
            heroId: 5,
            kills: 8,
            deaths: 1,
            assists: 10,
            netWorth: 44_800,
            startTime: START + 11 * 86400,
            letter: "S+",
            place: 1,
        },
        longestWin: 5,
        rank: { startBadge: 91, endBadge: 95, peakBadge: 95, delta: 4 },
        season: null,
        mates: [],
        nemesis: null,
        combat: null,
        stories: [
            story("best_game"),
            story("top_hero"),
            story("hours"),
            story("rank_move"),
            story("played_with"),
            story("record"),
        ],
        days,
        ...extra,
    };
}

const build = (e: Edition) => buildMagazine(e, editionView(e, viewDeps), deps);

describe("buildMagazine cover", () => {
    it("takes the cover colour from the cover hero's own colour", () => {
        const coloured: MagazineDeps = {
            ...deps,
            hero: (id) => {
                const h = deps.hero(id);
                return h && { ...h, colour: id === 4 ? "#4174BB" : "#C93C26" };
            },
        };
        const e = edition();
        expect(buildMagazine(e, editionView(e, viewDeps), coloured).palette).toEqual(heroPalette("#4174BB"));
    });

    it("takes the cover colour from the cover hero's backdrop art before the hero's own colour", () => {
        const sampled: MagazineDeps = {
            ...deps,
            hero: (id) => {
                const h = deps.hero(id);
                return h && { ...h, colour: "#2092AE", artColour: id === 4 ? "#cf5f26" : "#319826" };
            },
        };
        const e = edition();
        expect(buildMagazine(e, editionView(e, viewDeps), sampled).palette).toEqual(heroPalette("#cf5f26"));
    });

    it("falls back to the month's colour when the cover hero has none, and teases the next month in its own", () => {
        const m = build(edition());
        expect(m.palette).toBe(MONTH_PALETTES[8]);
        expect(m.nextPalette).toBe(MONTH_PALETTES[9]);
        expect(m.next).toBe("October 2026, out November 1");
    });

    it("puts the top hero on the cover and leaves the top-hero story off the coverlines", () => {
        const m = build(edition());
        expect(m.coverHero).toMatchObject({ heroId: 4, name: "Lash", line: "15 games, 29% of your September" });
        expect(m.lead?.kind).toBe("best_game");
        expect(m.coverlines.map((c) => c.kind)).toEqual(["hours", "rank_move", "played_with"]);
        expect(m.coverlines.map((c) => c.pageRef)).toEqual(["p. 2", "p. 5", "p. 5"]);
        expect(m.lead?.kicker).toBe("Game of the month");
    });

    it("prints the issue line and the grade on the sticker", () => {
        const m = build(edition());
        expect(m.issueLine).toBe("The Monthly · September 2026 · No. 2");
        expect(m.sticker).toEqual({ top: "Inside", big: "S+", bottom: "Best game grade", long: false });
    });

    it("puts the K/D/A on a smaller sticker when the best game has no grade", () => {
        const e = edition();
        const m = build(edition({ bestGame: { ...e.bestGame!, letter: null } }));
        expect(m.sticker).toEqual({ top: "Inside", big: "8/1/10", bottom: "Best game", long: true });
        expect(build(edition({ bestGame: null })).sticker).toBeNull();
    });

    it("draws a stable decorative barcode from the edition id", () => {
        expect(build(edition()).barcode).toEqual(build(edition()).barcode);
        expect(build(edition({ id: "monthly-2026-08" })).barcode).not.toEqual(build(edition()).barcode);
    });
});

describe("buildMagazine calendar", () => {
    it("lays out every day of the month from the frozen days, Monday first", () => {
        const cal = build(edition()).calendar!;
        expect(cal.lead).toBe(1);
        expect(cal.days).toHaveLength(30);
        expect(cal.days[0]).toMatchObject({ day: "1", matches: 0 });
        expect(cal.days[4]).toMatchObject({ day: "5", matches: 4, won: true });
        expect(cal.days[11]).toMatchObject({ day: "12", matches: 2, won: false });
        expect(cal.weekdays).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
    });

    it("sizes each day's mark by its matches, the busiest day the largest", () => {
        const cal = build(edition()).calendar!;
        expect(cal.days[4]!.size).toBeGreaterThan(cal.days[11]!.size);
        expect(cal.days[0]!.size).toBe(0);
    });

    it("is left out when the edition was frozen without days", () => {
        expect(build(edition({ days: undefined })).calendar).toBeNull();
    });
});

describe("buildMagazine inside", () => {
    it("lists six facts, days played against the days in the month", () => {
        const facts = build(edition()).facts;
        expect(facts).toHaveLength(6);
        expect(facts.find((f) => f.id === "days_played")).toEqual({
            id: "days_played",
            label: "Days played",
            value: "22",
            note: "of 30 in the month",
        });
    });

    it("ranks five heroes by games with each one's share of the bar", () => {
        const heroes = build(edition()).heroes;
        expect(heroes.map((h) => h.name)).toEqual(["Lash", "Abrams", "Infernus", "Haze", "Seven"]);
        expect(heroes[0]!.bar).toBe(1);
        expect(heroes[1]!.bar).toBeCloseTo(10 / 15, 6);
    });

    it("splits the best game's line into kills, deaths and assists", () => {
        const best = build(edition()).best!;
        expect([best.kills, best.deaths, best.assists]).toEqual(["8", "1", "10"]);
        expect(best.grade).toBe("S+");
    });

    it("leaves the rank report out with no ranked games", () => {
        expect(build(edition()).rank?.end.name).toBe("Badge 95");
        expect(build(edition({ rank: null })).rank).toBeNull();
    });
});
