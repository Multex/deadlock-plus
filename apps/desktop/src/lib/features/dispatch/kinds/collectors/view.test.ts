import { describe, expect, it } from "vitest";
import type { Edition, RankPoint } from "@deadlock-plus/stats/dispatch/types";
import type { RankTier } from "@deadlock-plus/stats/rank";
import { collectorsView, type CollectorsDeps } from "./view";

const DAY = 86_400;
const START = Date.UTC(2026, 6, 30) / 1000;
const END = Date.UTC(2026, 10, 5, 22) / 1000;

const TIERS: RankTier[] = [
    { tier: 6, name: "Emissary", color: "#6a8f5a", image: "emissary.png" },
    { tier: 7, name: "Archon", color: "#5a6f9a", image: "archon.png" },
    { tier: 8, name: "Oracle", color: "#8a6aa8", image: "oracle.png" },
    { tier: 9, name: "Phantom", color: "#4b3a7a", image: null },
];

const fmt = (key: string, params?: Record<string, string | number>) =>
    // The view marks the player's name with a NUL; JSON would escape it.
    params ? `${key}${JSON.stringify(params).replace("\\u0000", "\u0000")}` : key;

const deps: CollectorsDeps = {
    t: fmt,
    tn: (key, count, params) => fmt(`${key}_${count === 1 ? "one" : "other"}`, { count, ...params }),
    number: (n) => String(n),
    percent: (share) => `${Math.round(share * 100)}%`,
    dayRange: () => "Jul 30 – Nov 5, 2026",
    day: (s) => `day:${s}`,
    month: (s) => new Date(s * 1000).toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    tiers: TIERS,
    hero: (id) => (id === 7 ? { name: "Lash", art: "lash.png" } : undefined),
};

const point = (day: number, badge: number): RankPoint => ({ startS: START + day * DAY, badge, outcome: "win" });
const SERIES = [point(0, 64), point(20, 66), point(50, 81), point(80, 93), point(90, 86)];

function edition(over: Partial<Edition> = {}): Edition {
    return {
        schema: 1,
        id: "collectors-season_1",
        window: { kind: "collectors", id: "collectors-season_1", startS: START, endS: END, tz: "UTC" },
        accountId: 90000001,
        number: 4,
        volume: 2026,
        issuedAt: END + 60,
        stats: {
            matches: 114,
            wins: 66,
            losses: 48,
            unscored: 0,
            winrate: 66 / 114,
            playtimeS: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
            netWorth: 0,
            longestMatchS: 0,
            longestSession: null,
            busiestDay: null,
            nightShare: null,
            daysPlayed: 40,
            busiestMonth: null,
        },
        heroes: [
            { heroId: 7, games: 33, wins: 17, playtimeS: 1 },
            { heroId: 1, games: 1, wins: 1, playtimeS: 1 },
            { heroId: 2, games: 18, wins: 9, playtimeS: 1 },
            { heroId: 3, games: 16, wins: 11, playtimeS: 1 },
        ],
        newHeroes: [],
        bestGame: null,
        longestWin: 9,
        rank: { startBadge: 64, endBadge: 86, peakBadge: 93, delta: 0 },
        season: { id: "season_1", name: "Beta Season 1", startS: START, endS: END },
        mates: [],
        nemesis: null,
        combat: null,
        stories: [],
        playerName: "Lantern",
        rankSeries: SERIES,
        ...over,
    };
}

describe("collectorsView", () => {
    const v = collectorsView(edition(), deps);

    it("names the season, the dates and the copy number on the cover", () => {
        expect(v.season).toBe("Beta Season 1");
        expect(v.dates).toBe("Jul 30 – Nov 5, 2026");
        expect(v.serial).toMatch(/^\d{6}$/);
        expect(v.code).toBe(`2026 · S1 · ${v.serial}`);
        expect(collectorsView(edition(), deps).serial).toBe(v.serial);
    });

    it("stars the season peak with its tier's art and colour", () => {
        expect(v.peak).toEqual({ label: "Phantom 3", image: null, color: "#4b3a7a" });
        expect(v.start).toEqual({ label: "Emissary 4", image: "emissary.png", color: "#6a8f5a" });
        expect(v.end?.label).toBe("Oracle 6");
    });

    it("dates the peak from the series and says which match it was", () => {
        expect(v.peakLine).toBe(`dispatch.collectors.peak_reached{"date":"day:${START + 80 * DAY}"}`);
        expect(v.reached).toBe(`dispatch.collectors.reached{"date":"day:${START + 80 * DAY}"}`);
        expect(v.matchOf).toBe('dispatch.collectors.match_of{"n":"4","total":"5"}');
    });

    it("counts the climb in subranks", () => {
        expect(v.climb).toBe('dispatch.collectors.climb_up_other{"count":14}');
        const down = collectorsView(edition({ rank: { startBadge: 86, endBadge: 85, peakBadge: 86, delta: 0 } }), deps);
        expect(down.climb).toBe('dispatch.collectors.climb_down_one{"count":1}');
        const held = collectorsView(edition({ rank: { startBadge: 86, endBadge: 86, peakBadge: 86, delta: 0 } }), deps);
        expect(held.climb).toBe("dispatch.collectors.climb_held");
    });

    it("prints the record, win rate and best streak", () => {
        expect(v.record).toBe('dispatch.collectors.record_value{"wins":"66","losses":"48"}');
        expect(v.winrate).toBe("58%");
        expect(v.streak).toBe("9");
    });

    it("lists the three most played heroes with their art when known", () => {
        expect(v.heroes.map((h) => h.id)).toEqual([7, 2, 3]);
        expect(v.heroes[0]).toMatchObject({ name: "Lash", art: "lash.png" });
        expect(v.heroes[1]).toMatchObject({ name: 'stats.hero_fallback{"id":2}', art: null });
        expect(v.heroes[0].line).toBe(
            'dispatch.collectors.hero_games_other{"count":33} · dispatch.collectors.hero_wins_other{"count":17}',
        );
    });

    it("draws the climb chart with tier art on each tier rule", () => {
        expect(v.chart).not.toBeNull();
        expect(v.moves).toEqual({ ups: "3", downs: "1" });
        expect(v.tierArt[8]).toBe("oracle.png");
        expect(v.callout).not.toBeNull();
    });

    it("leaves the chart, moves and peak date out of a copy frozen without a series", () => {
        const old = collectorsView(edition({ rankSeries: undefined }), deps);
        expect(old.chart).toBeNull();
        expect(old.moves).toBeNull();
        expect(old.callout).toBeNull();
        expect(old.reached).toBeNull();
        expect(old.matchOf).toBeNull();
        expect(old.peakLine).toBe("dispatch.collectors.peak_label");
        expect(old.peak?.label).toBe("Phantom 3");
    });

    it("signs the certificate with the frozen player name, or without a name", () => {
        expect(v.certificate.name).toBe("Lantern");
        expect(v.certificate.before).toBe('dispatch.collectors.cert_body_other{"count":114,"name":"');
        expect(v.certificate.after).toBe('","season":"Beta Season 1"}');
        const anon = collectorsView(edition({ playerName: undefined }), deps);
        expect(anon.certificate.name).toBeNull();
        expect(anon.certificate.before).toBe(
            'dispatch.collectors.cert_body_anon_other{"count":114,"season":"Beta Season 1"}',
        );
    });

    it("goes round the medal ring with the season line", () => {
        expect(v.arc).toBe(`${'dispatch.collectors.arc{"season":"Beta Season 1"} '.repeat(v.arcRepeats)}`.trim());
        expect(v.arcRepeats).toBeGreaterThanOrEqual(1);
    });

    it("shows an unranked star when the season has no ranked badge", () => {
        const none = collectorsView(edition({ rank: null, rankSeries: [] }), deps);
        expect(none.peak).toBeNull();
        expect(none.peakName).toBe("dispatch.collectors.unranked");
        expect(none.climb).toBeNull();
    });
});
