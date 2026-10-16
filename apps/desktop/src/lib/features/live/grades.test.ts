import { describe, expect, it } from "vitest";
import {
    DeadlockApiError,
    type PerformanceCurvePoint,
    type PlayerRank,
    type StatDistribution,
} from "@deadlock-plus/deadlock-api";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { LivePlayer } from "@deadlock-plus/ipc-types/LivePlayer";
import type { LiveState } from "@deadlock-plus/ipc-types/LiveState";
import {
    apiGameMode,
    failureReason,
    gradeDisplay,
    gradesShown,
    groupSource,
    heroMatches,
    liveValues,
    toTargets,
    unrankedBadge,
    yourPlayer,
} from "./grades";

const STEAM64_OFFSET = 76561197960265728n;
const steamId = (accountId: number) => (BigInt(accountId) + STEAM64_OFFSET).toString();

function player(over: Partial<LivePlayer> = {}): LivePlayer {
    return {
        key: 0,
        side: "amber",
        name: null,
        steamId: null,
        heroId: null,
        rank: null,
        souls: null,
        kills: null,
        deaths: null,
        assists: null,
        heroDamage: null,
        objectiveDamage: null,
        healing: null,
        selfHealing: null,
        isYou: false,
        ...over,
    };
}

const you = (over: Partial<LivePlayer> = {}) =>
    player({ key: 1, heroId: 7, steamId: steamId(100), isYou: true, ...over });

function match(over: Partial<LiveMatch> = {}, players: LivePlayer[] = [you()]): LiveMatch {
    return {
        clockSecs: 300,
        paused: false,
        matchMode: "ranked",
        gameMode: "normal",
        perspective: "playing",
        yourSide: "amber",
        teams: [
            { side: "amber", souls: 0, players: players.filter((p) => p.side === "amber") },
            { side: "sapphire", souls: 0, players: players.filter((p) => p.side === "sapphire") },
        ],
        queue: null,
        ...over,
    };
}

const state = (phase: LiveState["phase"]): LiveState => ({ phase, matchPresent: true });

describe("yourPlayer", () => {
    it("finds the player marked as you on either team", () => {
        const me = you({ side: "sapphire" });
        expect(yourPlayer(match({}, [player({ key: 2 }), me]))).toBe(me);
    });

    it("is null with no match or no row marked as you", () => {
        expect(yourPlayer(null)).toBeNull();
        expect(yourPlayer(match({}, [player()]))).toBeNull();
    });
});

describe("gradesShown", () => {
    it("shows in a ranked or unranked normal or Street Brawl match you play", () => {
        for (const matchMode of ["ranked", "unranked"] as const) {
            for (const gameMode of ["normal", "streetBrawl"] as const) {
                expect(gradesShown(state("inMatch"), match({ matchMode, gameMode }))).toBe(true);
            }
        }
    });

    it("shows from pregame on", () => {
        expect(gradesShown(state("pregame"), match({ clockSecs: null }))).toBe(true);
    });

    it("hides once the match has ended and outside a match", () => {
        for (const phase of ["postMatch", "menus", "gameClosed", "queuing"] as const) {
            expect(gradesShown(state(phase), match())).toBe(false);
        }
        expect(gradesShown(null, match())).toBe(false);
        expect(gradesShown(state("inMatch"), null)).toBe(false);
    });

    it("hides in bot matches, private lobbies and the tutorial", () => {
        for (const matchMode of ["coopBot", "privateLobby", "tutorial", "other", null] as const) {
            expect(gradesShown(state("inMatch"), match({ matchMode }))).toBe(false);
        }
    });

    it("hides in Sandbox, Explore NYC and other game modes", () => {
        for (const gameMode of ["sandbox", "exploreNyc", "other", null] as const) {
            expect(gradesShown(state("inMatch"), match({ gameMode }))).toBe(false);
        }
    });

    it("hides while spectating", () => {
        expect(gradesShown(state("inMatch"), match({ perspective: "spectating" }))).toBe(false);
    });

    it("hides until your hero is known", () => {
        expect(gradesShown(state("pregame"), match({}, [you({ heroId: null })]))).toBe(false);
        expect(gradesShown(state("pregame"), match({}, [you({ heroId: 0 })]))).toBe(false);
        expect(gradesShown(state("pregame"), match({}, [player({ heroId: 7 })]))).toBe(false);
    });
});

describe("groupSource", () => {
    it("takes the lobby average of the ranks the reader sees in ranked", () => {
        const players = [you({ rank: 56 }), player({ key: 2, rank: 61 }), player({ key: 3, rank: 0 })];
        expect(groupSource(match({ matchMode: "ranked" }, players))).toEqual({ kind: "ranked", badge: 61 });
    });

    it("has no badge in ranked when no rank is known", () => {
        expect(groupSource(match({ matchMode: "ranked" }, [you({ rank: null })]))).toEqual({
            kind: "ranked",
            badge: null,
        });
    });

    it("lists every non-bot account, yours included, in unranked", () => {
        const players = [
            you({ steamId: steamId(100) }),
            player({ key: 2, steamId: steamId(5) }),
            player({ key: 3, steamId: null }),
            player({ key: 4, side: "sapphire", steamId: steamId(42) }),
        ];
        expect(groupSource(match({ matchMode: "unranked" }, players))).toEqual({
            kind: "unranked",
            accountIds: [5, 42, 100],
            you: 100,
        });
    });

    it("uses no rank in Street Brawl, ranked or not", () => {
        for (const matchMode of ["ranked", "unranked"] as const) {
            expect(groupSource(match({ matchMode, gameMode: "streetBrawl" }, [you({ rank: 56 })]))).toEqual({
                kind: "streetBrawl",
            });
        }
    });
});

describe("unrankedBadge", () => {
    const NOW = 1_800_000_000;
    const row = (account_id: number, badge: number, daysAgo = 1): PlayerRank => ({
        account_id,
        badge,
        rank: Math.floor(badge / 10),
        subrank: badge % 10,
        last_match: { start_time: NOW - daysAgo * 86_400 },
    });

    it("averages the lobby's usable ranks", () => {
        const rows = [row(1, 51), row(2, 51), row(3, 53), row(4, 53), row(100, 0)];
        expect(unrankedBadge(rows, 100, NOW)).toBe(52);
    });

    it("falls back to your own badge from the reply when too few ranks are usable", () => {
        const rows = [row(1, 51), row(2, 51, 40), row(100, 84)];
        expect(unrankedBadge(rows, 100, NOW)).toBe(84);
    });

    it("is null when neither the lobby nor you have a usable rank", () => {
        expect(unrankedBadge([row(1, 51)], 100, NOW)).toBeNull();
        expect(unrankedBadge([], null, NOW)).toBeNull();
    });
});

describe("apiGameMode", () => {
    it("names the API's game modes", () => {
        expect(apiGameMode("normal")).toBe("normal");
        expect(apiGameMode("streetBrawl")).toBe("street_brawl");
    });
});

const METRICS = ["kills", "deaths", "assists", "net_worth", "player_damage", "boss_damage", "player_healing"];

function curvePoint(game_time: number, base: number): PerformanceCurvePoint {
    const point: Record<string, number> = { game_time };
    METRICS.forEach((m, i) => {
        point[`${m}_avg`] = base * (i + 1);
        point[`${m}_std`] = base * (i + 1) * 0.5;
    });
    return point as PerformanceCurvePoint;
}

function distribution(avg: number): StatDistribution {
    return {
        avg,
        std: avg / 2,
        percentile1: avg * 0.1,
        percentile5: avg * 0.2,
        percentile10: avg * 0.3,
        percentile25: avg * 0.6,
        percentile50: avg,
        percentile75: avg * 1.3,
        percentile90: avg * 1.6,
        percentile95: avg * 1.8,
        percentile99: avg * 2.2,
    };
}

const METRIC_KEYS = [
    "kills",
    "deaths",
    "assists",
    "net_worth_per_min",
    "player_damage_per_min",
    "boss_damage_per_min",
    "player_healing_per_min",
];
const allMetrics = () =>
    Object.fromEntries([...METRIC_KEYS, "healing_per_min"].map((k, i) => [k, distribution((i + 1) * 10)]));

describe("toTargets", () => {
    it("maps each stat to its curve metric", () => {
        const targets = toTargets([curvePoint(180, 1), curvePoint(360, 2)], allMetrics());
        expect(targets?.curves.kills).toEqual([
            { t: 180, avg: 1, std: 0.5 },
            { t: 360, avg: 2, std: 1 },
        ]);
        expect(targets?.curves.souls[0]).toEqual({ t: 180, avg: 4, std: 2 });
        expect(targets?.curves.damage[0].avg).toBe(5);
        expect(targets?.curves.objectiveDamage[0].avg).toBe(6);
        expect(targets?.curves.healing[0].avg).toBe(7);
    });

    it("maps each stat to its metrics key, never healing_per_min", () => {
        const targets = toTargets([curvePoint(180, 1)], allMetrics());
        expect(targets?.metrics.kills).toEqual({
            avg: 10,
            percentiles: { 1: 1, 5: 2, 10: 3, 25: 6, 50: 10, 75: 13, 90: 16, 95: 18, 99: 22 },
        });
        expect(targets?.metrics.souls.avg).toBe(40);
        expect(targets?.metrics.damage.avg).toBe(50);
        expect(targets?.metrics.objectiveDamage.avg).toBe(60);
        expect(targets?.metrics.healing.avg).toBe(70);
    });

    it("has no targets for an empty curve", () => {
        expect(toTargets([], allMetrics())).toBeNull();
    });

    it("has no targets when the filter matched nothing (all nulls)", () => {
        const empty = { ...curvePoint(180, 1) } as Record<string, number | null>;
        for (const k of Object.keys(empty)) if (k !== "game_time") empty[k] = null;
        expect(toTargets([empty as PerformanceCurvePoint], allMetrics())).toBeNull();
    });

    it("has no targets when any curve value is null", () => {
        const point = { ...curvePoint(180, 1), boss_damage_std: null };
        expect(toTargets([point], allMetrics())).toBeNull();
    });

    it("has no targets when a metrics key is missing, null or has no positive average", () => {
        const missing = allMetrics();
        delete missing.player_healing_per_min;
        expect(toTargets([curvePoint(180, 1)], missing)).toBeNull();

        const nullPct = allMetrics();
        nullPct.kills = { ...nullPct.kills, percentile50: null };
        expect(toTargets([curvePoint(180, 1)], nullPct)).toBeNull();

        const zeroAvg = allMetrics();
        zeroAvg.boss_damage_per_min = { ...zeroAvg.boss_damage_per_min, avg: 0 };
        expect(toTargets([curvePoint(180, 1)], zeroAvg)).toBeNull();
    });
});

describe("liveValues", () => {
    it("reads your live counters, null as 0", () => {
        const me = you({
            kills: 4,
            deaths: null,
            assists: 9,
            souls: 12000,
            heroDamage: 8000,
            objectiveDamage: 3000,
            healing: 900,
        });
        expect(liveValues(me)).toEqual({
            kills: 4,
            deaths: 0,
            assists: 9,
            souls: 12000,
            damage: 8000,
            objectiveDamage: 3000,
            healing: 900,
        });
    });
});

describe("gradeDisplay", () => {
    it("shows totals and per-minute values, and splits healing into self and teammates", () => {
        const me = you({
            kills: 2,
            souls: 6000,
            heroDamage: 3000,
            objectiveDamage: 600,
            healing: 900,
            selfHealing: 700,
        });
        expect(gradeDisplay(me, 120)).toEqual({
            values: { kills: 2, deaths: 0, assists: 0, souls: 3000, damage: 1500, objectiveDamage: 300, healing: 900 },
            selfHeal: 700,
            healingTeammates: 200,
        });
    });

    it("counts all healing as teammates' while self healing is unknown", () => {
        const display = gradeDisplay(you({ healing: 500, selfHealing: null }), 120);
        expect(display.selfHeal).toBe(0);
        expect(display.healingTeammates).toBe(500);
    });

    it("never shows negative teammate healing", () => {
        expect(gradeDisplay(you({ healing: 100, selfHealing: 150 }), 120).healingTeammates).toBe(0);
    });
});

describe("heroMatches", () => {
    it("reads your hero's row, 0 when it is absent", () => {
        const rows = [
            { hero_id: 3, matches: 50 },
            { hero_id: 7, matches: 420 },
        ];
        expect(heroMatches(rows, 7)).toBe(420);
        expect(heroMatches(rows, 9)).toBe(0);
    });
});

describe("failureReason", () => {
    it("tells rate limits, API errors and a dropped connection apart", () => {
        expect(failureReason(new DeadlockApiError(429))).toBe("rateLimited");
        expect(failureReason(new DeadlockApiError(503))).toBe("apiDown");
        expect(failureReason(new DeadlockApiError(400))).toBe("apiDown");
        expect(failureReason(new TypeError("Failed to fetch"))).toBe("offline");
        expect(failureReason(new SyntaxError("Unexpected token"))).toBe("apiDown");
    });
});
