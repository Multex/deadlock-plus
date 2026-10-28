import type { Outcome } from "../stats";
import { detectDispatchStories } from "./stories";
import { EDITION_SCHEMA, type Edition, type EditionKind, type EditionWindow, type TapeMatch } from "./types";

const at = (y: number, mo: number, d: number, h = 0) => Date.UTC(y, mo - 1, d, h) / 1000;
const october = (d: number, h = 0) => at(2026, 10, d, h);

export type Persona = "P1" | "P2" | "P3";
export const PERSONAS: readonly Persona[] = ["P1", "P2", "P3"];
export const PERSONA_HEROES: Record<number, string> = {
    1: "Infernus",
    2: "Haze",
    3: "Seven",
    4: "Vindicta",
    5: "Ivy",
    6: "Holliday",
    7: "Paradox",
    8: "Mo & Krill",
    9: "Viscous",
    10: "Wraith",
    11: "Pocket",
    12: "Lash",
};

const tapeOf = (outcomes: Outcome[]): TapeMatch[] =>
    outcomes.map((o, i) => [october(1, 18) + i * 2400, 1, o, 5, 3, 7, 20000, 1800]);

const WINDOWS: Record<EditionKind, (n: number) => EditionWindow> = {
    weekly: (n) => ({
        kind: "weekly",
        id: `weekly-2026-${String(1 + n).padStart(2, "0")}`,
        startS: october(5),
        endS: october(12),
        tz: "UTC",
    }),
    monthly: (n) => ({
        kind: "monthly",
        id: `monthly-${2026 + n}-10`,
        startS: october(1),
        endS: at(2026, 11, 1),
        tz: "UTC",
    }),
    collectors: (n) => ({
        kind: "collectors",
        id: `collectors-season_${n + 1}`,
        startS: at(2026, 6, 1),
        endS: at(2026, 11, 1),
        tz: "UTC",
    }),
    year_end: (n) => ({
        kind: "year_end",
        id: `year_end-${2026 + n}`,
        startS: at(2025, 12, 1),
        endS: at(2026, 12, 1),
        tz: "UTC",
    }),
};

/** The three demo personas of the video rethink: one-trick climber, explorer in a slump, duo comeback. */
export function personaEdition(persona: Persona, kind: EditionKind, n = 0): Edition {
    const window = WINDOWS[kind](n);
    const L: Outcome = "loss";
    const W: Outcome = "win";
    const common = {
        schema: EDITION_SCHEMA as typeof EDITION_SCHEMA,
        id: window.id,
        window,
        number: n + 1,
        volume: 2026,
        issuedAt: window.endS,
        newHeroes: [] as number[],
        season:
            kind === "collectors"
                ? { id: `season_${n + 1}`, name: `Season ${n + 1}`, startS: window.startS, endS: window.endS }
                : null,
        combat: null,
        stories: [],
        rivals: [],
        months:
            kind === "year_end"
                ? Array.from({ length: 12 }, (_, i) => ({
                      monthStartS: at(2025, 12 + i, 1),
                      matches: i === 9 ? 23 : 0,
                      wins: i === 9 ? 12 : 0,
                  }))
                : undefined,
    };
    const stats = {
        unscored: 0,
        kills: 110,
        deaths: 66,
        assists: 154,
        netWorth: 440000,
        longestMatchS: 2400,
        busiestDay: { dayStartS: october(4), matches: 5 },
        daysPlayed: 16,
        busiestMonth: { monthStartS: october(1), matches: 23 },
    };
    let e: Omit<Edition, "stories">;
    if (persona === "P1") {
        e = {
            ...common,
            accountId: 101,
            playerName: "Lantern",
            stats: {
                ...stats,
                matches: 23,
                wins: 15,
                losses: 8,
                winrate: 15 / 23,
                playtimeS: 23 * 1900,
                longestSession: { matches: 4, startS: october(4, 21), durationS: 9000 },
                nightShare: 0.1,
            },
            heroes: [
                { heroId: 12, games: 12, wins: 9, playtimeS: 12 * 1900 },
                { heroId: 2, games: 6, wins: 3, playtimeS: 6 * 1900 },
                { heroId: 3, games: 5, wins: 3, playtimeS: 5 * 1900 },
            ],
            longestWin: 8,
            rank: { startBadge: 23, endBadge: 34, peakBadge: 34, delta: 4 },
            bestGame: {
                matchId: 11,
                heroId: 12,
                kills: 14,
                deaths: 1,
                assists: 17,
                netWorth: 41000,
                startTime: october(4, 22),
                letter: "S-",
                place: 1,
            },
            mates: [],
            nemesis: null,
            tape: tapeOf([W, W, W, W, W, W, W, W, L, W, L, W, L, W, W, L, W, L, W, L, W, L, L]),
        };
    } else if (persona === "P2") {
        e = {
            ...common,
            accountId: 202,
            playerName: "Moth",
            stats: {
                ...stats,
                matches: 22,
                wins: 9,
                losses: 13,
                winrate: 9 / 22,
                playtimeS: 22 * 2100,
                longestSession: { matches: 3, startS: october(9, 1), durationS: 6000 },
                nightShare: 0.38,
                longestMatchS: 50 * 60,
            },
            heroes: Array.from({ length: 12 }, (_, i) => ({
                heroId: i + 1,
                games: i < 10 ? 2 : 1,
                wins: 1,
                playtimeS: 4000,
            })),
            newHeroes: [9, 10, 11, 12],
            longestWin: 2,
            rank: { startBadge: 41, endBadge: 35, peakBadge: 41, delta: -3 },
            bestGame: {
                matchId: 21,
                heroId: 4,
                kills: 9,
                deaths: 4,
                assists: 12,
                netWorth: 30000,
                startTime: october(9, 2),
                letter: "B",
                place: 4,
            },
            mates: [{ accountId: 7, name: "Gloam", matches: 3, wins: 1 }],
            nemesis: null,
            tape: tapeOf(Array.from({ length: 22 }, (_, i) => (i % 5 < 2 ? W : L))),
        };
    } else {
        e = {
            ...common,
            accountId: 303,
            playerName: "Kettle",
            stats: {
                ...stats,
                matches: 23,
                wins: 12,
                losses: 11,
                winrate: 12 / 23,
                playtimeS: 23 * 2000,
                longestSession: { matches: 7, startS: october(10, 15), durationS: 5 * 3600 },
                nightShare: 0.05,
            },
            heroes: [
                { heroId: 9, games: 8, wins: 5, playtimeS: 8 * 2000 },
                { heroId: 8, games: 8, wins: 4, playtimeS: 8 * 2000 },
                { heroId: 1, games: 7, wins: 3, playtimeS: 7 * 2000 },
            ],
            longestWin: 4,
            rank: { startBadge: 33, endBadge: 34, peakBadge: 35, delta: 1 },
            bestGame: {
                matchId: 31,
                heroId: 8,
                kills: 6,
                deaths: 3,
                assists: 24,
                netWorth: 28000,
                startTime: october(10, 16),
                letter: "A",
                place: 2,
            },
            mates: [{ accountId: 9, name: "Copperhead", matches: 14, wins: 9 }],
            nemesis: { accountId: 8, name: "Saltmarsh", matches: 4, wins: 1 },
            tape: tapeOf([W, L, W, L, L, L, L, L, L, W, W, W, L, W, W, W, W, L, W, L, W, L, W]),
        };
    }
    return { ...e, stories: detectDispatchStories(e) } as Edition;
}
