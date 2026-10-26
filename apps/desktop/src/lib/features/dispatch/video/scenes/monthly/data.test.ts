import { describe, expect, it } from "vitest";
import { interpolate } from "$lib/core/i18n.svelte";
import type { DispatchStory, Edition, EditionDay } from "@deadlock-plus/stats/dispatch/types";
import { editionView, type DispatchViewDeps } from "../../../edition-view";
import { buildMagazine, type MagazineDeps } from "../../../kinds/monthly/magazine";
import { heroPalette } from "../../../kinds/monthly/palette";
import { monthlyVideo, presentSections, rankImages } from "./data";

const CATALOG: Record<string, string> = {
    "dispatch.masthead.name": "Deadlock+ Dispatch",
    "dispatch.monthly.brand": "Deadlock+",
    "dispatch.monthly.masthead": "Dispatch",
    "dispatch.monthly.cover_line": "The Monthly · {month} · No. {number}",
    "dispatch.monthly.folio": "{name} · {month}",
    "dispatch.monthly.kicker.best_game": "Game of the month",
    "dispatch.monthly.kicker.top_hero": "Cover star",
    "dispatch.monthly.kicker.rank_move": "Rank report",
    "dispatch.monthly.cover_star_line_other": "{count} games, {share} of your {month}",
    "dispatch.monthly.section.numbers": "By the numbers",
    "dispatch.monthly.section.cover_story": "Cover story",
    "dispatch.monthly.people.title": "The company you keep",
    "dispatch.monthly.people.most_wanted": "Most wanted",
    "dispatch.monthly.next_label": "Next issue",
    "dispatch.monthly.next_line": "{month}, out {date}",
    "dispatch.video.monthly.cta": "Get your own Monthly",
};

const t = (key: string, params?: Record<string, string | number>) => interpolate(CATALOG[key] ?? key, params);
const tn = (key: string, count: number, params?: Record<string, string | number>) => {
    const full = `${key}_${count === 1 ? "one" : "other"}`;
    return interpolate(CATALOG[full] ?? full, { count, ...params });
};
const HEROES: Record<number, string> = { 1: "Infernus", 4: "Lash", 5: "Ivy", 6: "Abrams" };
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
    hero: (id) =>
        HEROES[id] ? { name: HEROES[id], icon: `icon/${id}.png`, art: `card/${id}.png`, colour: "#4174BB" } : undefined,
    rank: (b) => ({ name: `Badge ${b}`, image: `rank/${Math.floor(b / 10)}.png` }),
};

const TZ = "UTC";
const START = Date.UTC(2026, 8, 1) / 1000;
const END = Date.UTC(2026, 9, 1) / 1000;
const days: EditionDay[] = Array.from({ length: 30 }, (_, i) => ({
    dayStartS: START + i * 86400,
    matches: i === 4 ? 4 : 0,
    wins: i === 4 ? 3 : 0,
}));
const story = (kind: DispatchStory["kind"]): DispatchStory => ({
    kind,
    score: 1,
    headline: { key: `dispatch.story.${kind}.headline` },
    deck: { key: `dispatch.story.${kind}.deck` },
    params: {},
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
            longestSession: null,
            busiestDay: null,
            nightShare: null,
            daysPlayed: 22,
            busiestMonth: null,
        },
        heroes: [
            { heroId: 4, games: 15, wins: 8, playtimeS: 8 * 3600 },
            { heroId: 6, games: 10, wins: 7, playtimeS: 5 * 3600 },
            { heroId: 1, games: 7, wins: 3, playtimeS: 4 * 3600 },
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
        mates: [{ accountId: 7, name: "Copperhead", matches: 19, wins: 9 }],
        nemesis: { accountId: 9, name: "Fennick", matches: 9, wins: 3 },
        combat: null,
        stories: [story("best_game"), story("top_hero"), story("hours"), story("rank_move")],
        days,
        ...extra,
    };
}

function build(e: Edition) {
    const view = editionView(e, viewDeps);
    const mag = buildMagazine(e, view, deps);
    return { mag, video: monthlyVideo(e, mag, { t, locale: "en-US", site: "deadlockplus.app" }) };
}

describe("monthlyVideo", () => {
    it("takes its colours from the magazine, so the video follows the cover's palette", () => {
        const { mag, video } = build(edition());
        expect(video.palette).toBe(mag.palette);
        expect(video.palette).toEqual(heroPalette("#4174BB"));
    });

    it("prints the same cover the magazine does", () => {
        const { mag, video } = build(edition());
        expect(video.cover.masthead).toBe("Dispatch");
        expect(video.cover.issueLine).toBe(mag.issueLine);
        expect(video.cover.star).toMatchObject({ heroId: 4, name: "Lash", kicker: "Cover star" });
        expect(video.cover.lead?.headline).toBe(mag.lead?.headline);
        expect(video.cover.lines).toHaveLength(mag.coverlines.length);
        expect(video.cover.sticker).toEqual(mag.sticker);
    });

    it("carries the raw numbers each count-up lands on", () => {
        const { video } = build(edition());
        expect(video.numbers.matches).toBe(52);
        expect(video.numbers.won?.share).toBe(0.5);
        expect(video.heroes?.share).toBeCloseTo(15 / 52, 6);
        expect(video.best?.counts).toEqual({ kills: 8, deaths: 1, assists: 10 });
        expect(video.best?.heroId).toBe(5);
    });

    it("folios each page with the page the magazine prints it on", () => {
        const { video } = build(edition());
        expect(video.pages).toEqual({ numbers: 2, calendar: 2, heroes: 3, best: 4, people: 5, rank: 5 });
    });

    it("ends on the back cover with the next issue and the site", () => {
        const { mag, video } = build(edition());
        expect(video.end).toEqual({
            cta: "Get your own Monthly",
            url: "deadlockplus.app",
            nextLabel: "Next issue",
            next: mag.next,
        });
    });

    it("names the rank badge art the scene needs by its own keys", () => {
        const { video } = build(edition());
        expect(rankImages(video)).toEqual({ "rank:start": "rank/9.png", "rank:end": "rank/9.png" });
    });
});

describe("presentSections", () => {
    it("lists every spread a full edition has, in the magazine's order", () => {
        expect(presentSections(build(edition()).video)).toEqual([
            "numbers",
            "calendar",
            "heroes",
            "best",
            "people",
            "rank",
        ]);
    });

    it("leaves out the spreads an edition has nothing for", () => {
        const bare = build(edition({ days: undefined, bestGame: null, mates: [], nemesis: null, rank: null }));
        expect(presentSections(bare.video)).toEqual(["numbers", "heroes"]);
    });
});
