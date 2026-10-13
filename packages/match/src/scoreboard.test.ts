import { describe, expect, it } from "vitest";
import type { IdVisual } from "./deep-dive/catalog";
import type { MatchDetail, MatchItem, MatchPlayer, MatchTeam } from "./detail";
import {
    BOARD_ROWS,
    BOARD_COLUMN_MIN_REM,
    BOARD_LABEL_REM,
    ITEM_GAP_PX,
    ITEM_TILE_PX,
    anyRanked,
    boardMinWidth,
    rankArtVars,
    ITEM_GRID_COLUMNS,
    MIN_ITEM_SLOTS,
    STAT_ROWS,
    boardTeams,
    columnName,
    gridSlots,
    headerSummary,
    heldItems,
    itemGridSize,
    itemSlots,
} from "./scoreboard";

function player(slot: number, team: MatchTeam, over: Partial<MatchPlayer> = {}): MatchPlayer {
    return {
        slot,
        accountId: 1000 + slot,
        team,
        heroId: 1,
        level: 1,
        kills: 0,
        deaths: 0,
        assists: 0,
        souls: 0,
        lastHits: 0,
        denies: 0,
        playerDamage: 0,
        healing: 0,
        outcome: "unscored",
        items: [],
        deathLog: [],
        series: [],
        abilities: [],
        accolades: [],
        ...over,
    };
}

function detail(over: Partial<MatchDetail> = {}, hk: MatchPlayer[] = [], am: MatchPlayer[] = []): MatchDetail {
    return {
        source: "api",
        matchId: 7,
        startTime: 1_700_000_000,
        durationS: 1800,
        matchMode: 4,
        gameMode: 1,
        notScored: false,
        bans: [],
        teams: [
            { team: "hidden-king", score: 10, players: hk },
            { team: "archmother", score: 20, players: am },
        ],
        objectives: [],
        midBoss: [],
        damageMatrix: { sampleTimesS: [], sources: [], entries: [] },
        ...over,
    };
}

describe("boardTeams", () => {
    it("lists the Hidden King first when the user is absent", () => {
        const d = detail({}, [player(1, "hidden-king")], [player(7, "archmother")]);
        expect(boardTeams(d, null).map((t) => t.team)).toEqual(["hidden-king", "archmother"]);
    });

    it("puts the user's team first", () => {
        const d = detail({}, [player(1, "hidden-king")], [player(7, "archmother")]);
        expect(boardTeams(d, 1007).map((t) => t.team)).toEqual(["archmother", "hidden-king"]);
    });

    it("sorts players by souls, then slot", () => {
        const d = detail(
            {},
            [
                player(3, "hidden-king", { souls: 100 }),
                player(2, "hidden-king", { souls: 900 }),
                player(1, "hidden-king", { souls: 100 }),
            ],
            [],
        );
        expect(boardTeams(d, null)[0].columns.map((r) => r.player.slot)).toEqual([2, 1, 3]);
    });

    it("flags only the user's row", () => {
        const d = detail({}, [player(1, "hidden-king"), player(2, "hidden-king")], []);
        const rows = boardTeams(d, 1002)[0].columns;
        expect(rows.map((r) => r.own)).toEqual([false, true]);
    });

    it("marks the winning team", () => {
        const d = detail({ winningTeam: "archmother" });
        expect(boardTeams(d, null).map((t) => t.won)).toEqual([false, true]);
    });

    it("reports a player's badge or null", () => {
        const rank = {
            displayRank: 63,
            progressBefore: 0,
            progressAfter: 0,
            progressChange: 0,
            calibrationGamesLeft: 0,
            demotionProtectionGamesLeft: 0,
            consumedDemotionProtection: false,
            winStreak: 0,
        };
        const d = detail({}, [player(1, "hidden-king", { rank }), player(2, "hidden-king")], []);
        expect(boardTeams(d, null)[0].columns.map((r) => r.badge)).toEqual([63, null]);
    });

    it("does not treat the zero rank as a badge", () => {
        const rank = {
            displayRank: 0,
            progressBefore: 0,
            progressAfter: 0,
            progressChange: 0,
            calibrationGamesLeft: 0,
            demotionProtectionGamesLeft: 0,
            consumedDemotionProtection: false,
            winStreak: 0,
        };
        const d = detail({}, [player(1, "hidden-king", { rank })], []);
        expect(boardTeams(d, null)[0].columns[0].badge).toBeNull();
    });
});

describe("board columns", () => {
    it("flags the best value of each row across both teams, with ties", () => {
        const d = detail(
            {},
            [
                player(1, "hidden-king", { kills: 5, deaths: 2, souls: 100 }),
                player(2, "hidden-king", { kills: 3, deaths: 9 }),
            ],
            [player(7, "archmother", { kills: 5, deaths: 4, souls: 50 })],
        );
        const [hk, am] = boardTeams(d, null);
        const flag = (key: (typeof STAT_ROWS)[number]["key"]) =>
            [...hk.columns, ...am.columns].filter((c) => c.best[key]).map((c) => c.player.slot);
        expect(flag("kills")).toEqual([1, 7]);
        expect(flag("deaths")).toEqual([1]);
        expect(flag("souls")).toEqual([1]);
    });

    it("flags nothing in a row where every player is equal", () => {
        const d = detail({}, [player(1, "hidden-king"), player(2, "hidden-king")], [player(7, "archmother")]);
        const flags = boardTeams(d, null).flatMap((t) => t.columns.map((c) => c.best.healing));
        expect(flags).toEqual([false, false, false]);
    });

    it("totals each team's kills, souls and player damage", () => {
        const d = detail(
            {},
            [
                player(1, "hidden-king", { kills: 2, souls: 100, playerDamage: 10 }),
                player(2, "hidden-king", { kills: 3, souls: 50, playerDamage: 5 }),
            ],
            [],
        );
        expect(boardTeams(d, null)[0].totals).toEqual({ kills: 5, souls: 150, playerDamage: 15 });
    });

    it("reports each team's result, or none when unscored", () => {
        const won = detail({ winningTeam: "archmother" });
        expect(boardTeams(won, null).map((t) => t.result)).toEqual(["loss", "win"]);
        expect(boardTeams(detail({ winningTeam: "archmother", notScored: true }), null).map((t) => t.result)).toEqual([
            null,
            null,
        ]);
        expect(boardTeams(detail(), null).map((t) => t.result)).toEqual([null, null]);
    });
});

describe("board columns mvp", () => {
    const mvps = (d: MatchDetail) => boardTeams(d, null).map((t) => t.columns.map((c) => c.mvp));

    it("is null for everyone when no player has a rank", () => {
        const d = detail({}, [player(1, "hidden-king"), player(2, "hidden-king")], [player(7, "archmother")]);
        expect(mvps(d)).toEqual([[null, null], [null]]);
    });

    it("maps rank 1 to mvp and ranks 2 and 3 to key", () => {
        const d = detail(
            {},
            [
                player(1, "hidden-king", { souls: 400, mvpRank: 1 }),
                player(2, "hidden-king", { souls: 300, mvpRank: 2 }),
                player(3, "hidden-king", { souls: 200, mvpRank: 3 }),
            ],
            [],
        );
        expect(mvps(d)[0]).toEqual(["mvp", "key", "key"]);
    });

    it("leaves rank 4 and above, and rank 0, as null", () => {
        const d = detail(
            {},
            [player(1, "hidden-king", { souls: 3, mvpRank: 4 }), player(2, "hidden-king", { souls: 2, mvpRank: 0 })],
            [player(7, "archmother", { mvpRank: 12 })],
        );
        expect(mvps(d)).toEqual([[null, null], [null]]);
    });

    it("works when only one team carries ranks", () => {
        const d = detail(
            {},
            [player(1, "hidden-king")],
            [player(7, "archmother", { souls: 9, mvpRank: 1 }), player(8, "archmother", { mvpRank: 2 })],
        );
        expect(mvps(d)).toEqual([[null], ["mvp", "key"]]);
    });
});

describe("headerSummary", () => {
    it("takes the user's outcome and the badge from the players' ranks", () => {
        const rank = (displayRank: number) => ({
            displayRank,
            progressBefore: 0,
            progressAfter: 0,
            progressChange: 0,
            calibrationGamesLeft: 0,
            demotionProtectionGamesLeft: 0,
            consumedDemotionProtection: false,
            winStreak: 0,
        });
        const d = detail(
            { winningTeam: "hidden-king", bans: [5, 6] },
            [player(1, "hidden-king", { outcome: "win", rank: rank(61) })],
            [player(7, "archmother", { outcome: "loss", rank: rank(71) })],
        );
        const s = headerSummary(d, 1001);
        expect(s.outcome).toBe("win");
        expect(s.winner).toBe("hidden-king");
        expect(s.averageBadge).toBe(64);
        expect(s.bans).toEqual([5, 6]);
        expect(s.mode).toBe("ranked");
        expect("scores" in s).toBe(false);
    });

    it("averages players by position in the tier ladder, never onto a missing sub-tier", () => {
        const rank = (displayRank: number) => ({
            displayRank,
            progressBefore: 0,
            progressAfter: 0,
            progressChange: 0,
            calibrationGamesLeft: 0,
            demotionProtectionGamesLeft: 0,
            consumedDemotionProtection: false,
            winStreak: 0,
        });
        const side = (team: "hidden-king" | "archmother", base: number, ranks: number[]) =>
            ranks.map((r, i) => player(base + i, team, { rank: rank(r) }));
        const cases: [number[], number[]][] = [
            [
                [91, 85],
                [91, 85],
            ],
            [
                [91, 91, 85],
                [11, 66],
            ],
            [
                [91, 92, 93, 94, 95, 96],
                [11, 21, 31, 41],
            ],
            [
                [16, 21],
                [61, 71],
            ],
        ];
        for (const [a, b] of cases) {
            const s = headerSummary(detail({}, side("hidden-king", 1, a), side("archmother", 7, b)), null);
            const sub = s.averageBadge! % 10;
            expect(sub).toBeGreaterThanOrEqual(1);
            expect(sub).toBeLessThanOrEqual(6);
        }
        const same = headerSummary(detail({}, side("hidden-king", 1, [91, 85]), []), null);
        expect(same.averageBadge).toBe(86);
    });

    it("has no outcome when the user is not in the match", () => {
        const d = detail({}, [player(1, "hidden-king", { outcome: "win" })], []);
        expect(headerSummary(d, 42).outcome).toBeNull();
        expect(headerSummary(d, null).outcome).toBeNull();
    });

    it("has no average badge without any rank", () => {
        expect(headerSummary(detail({}, [player(1, "hidden-king")], []), null).averageBadge).toBeNull();
    });
});

describe("heldItems", () => {
    const item = (itemId: number, boughtS: number, soldS?: number): MatchItem => ({
        itemId,
        boughtS,
        soldS,
        upgradeId: 0,
    });

    it("drops sold items and repeats, ordered by purchase", () => {
        const items = [item(5, 300), item(1, 10), item(2, 20, 90), item(1, 40)];
        expect(heldItems(items).map((i) => i.itemId)).toEqual([1, 5]);
    });
});

describe("itemSlots", () => {
    const visuals = new Map<number, IdVisual>([
        [1, { name: "A", src: "a.png", kind: "item" }],
        [2, { name: "B", src: "b.png", kind: "ability" }],
        [3, { name: "C", kind: "item" }],
    ]);
    const item = (itemId: number, boughtS: number): MatchItem => ({ itemId, boughtS, upgradeId: 0 });

    it("leaves out ids the game files as abilities", () => {
        const slots = itemSlots([item(2, 5), item(1, 10)], visuals);
        expect(slots).toEqual([{ itemId: 1, name: "A", src: "a.png" }]);
    });

    it("keeps unknown ids as unnamed slots", () => {
        expect(itemSlots([item(99, 1)], visuals)).toEqual([{ itemId: 99, name: null, src: null }]);
    });

    it("keeps a known item without art", () => {
        expect(itemSlots([item(3, 1)], visuals)).toEqual([{ itemId: 3, name: "C", src: null }]);
    });
});

describe("itemGridSize", () => {
    it("never goes below the shop's twelve slots", () => {
        expect(itemGridSize([0, 3, 7])).toBe(MIN_ITEM_SLOTS);
        expect(itemGridSize([])).toBe(MIN_ITEM_SLOTS);
    });

    it("grows in whole rows when a player holds more", () => {
        expect(itemGridSize([13])).toBe(16);
        expect(itemGridSize([12, 14])).toBe(16);
        expect(MIN_ITEM_SLOTS % ITEM_GRID_COLUMNS).toBe(0);
    });
});

describe("gridSlots", () => {
    it("pads with empty placeholders up to the grid size", () => {
        const slots = [{ itemId: 1, name: "A", src: null }];
        const out = gridSlots(slots, 12);
        expect(out).toHaveLength(12);
        expect(out[0]).toBe(slots[0]);
        expect(out.slice(1).every((s) => s === null)).toBe(true);
    });

    it("keeps every slot when the grid is smaller", () => {
        const slots = [1, 2, 3].map((itemId) => ({ itemId, name: null, src: null }));
        expect(gridSlots(slots, 2)).toHaveLength(3);
    });
});

describe("columnName", () => {
    it("collapses whitespace and keeps the full name", () => {
        expect(columnName("  Baron \n Von  Bun ", "P1")).toBe("Baron Von Bun");
    });

    it("falls back when the name is missing or blank", () => {
        expect(columnName(null, "Player 3")).toBe("Player 3");
        expect(columnName("   ", "Player 3")).toBe("Player 3");
    });
});

describe("BOARD_ROWS", () => {
    it("lists items, then every stat row, each with a label key", () => {
        expect(BOARD_ROWS.map((r) => r.key)).toEqual(["items", ...STAT_ROWS.map((r) => r.key)]);
        expect(BOARD_ROWS.every((r) => r.labelKey.length > 0)).toBe(true);
        expect(new Set(BOARD_ROWS.map((r) => r.labelKey)).size).toBe(BOARD_ROWS.length);
    });
});

describe("boardMinWidth", () => {
    const CONTENT_WIDTH = 1200;
    const NARROW_CONTENT_WIDTH = 1000;

    it("adds the label column to one minimum width per player column", () => {
        expect(boardMinWidth(12, 16)).toBe((12 * BOARD_COLUMN_MIN_REM + BOARD_LABEL_REM) * 16);
        expect(boardMinWidth(2, 10)).toBe((2 * BOARD_COLUMN_MIN_REM + BOARD_LABEL_REM) * 10);
    });

    it("fits twelve columns in the 1200px content width at a 16px root", () => {
        expect(boardMinWidth(12, 16)).toBeLessThanOrEqual(CONTENT_WIDTH);
    });

    it("fits twelve columns in 1000px at the app's 15px root", () => {
        expect(boardMinWidth(12, 15)).toBeLessThanOrEqual(NARROW_CONTENT_WIDTH);
    });
});

describe("rankArtVars", () => {
    it("scales padded tiers up and leaves unknown tiers alone", () => {
        expect(rankArtVars(9)).toBe("--rank-art-scale:1.28;--rank-art-x:-0.4%;--rank-art-y:-10%");
        expect(rankArtVars(8)).toContain("--rank-art-scale:0.9");
        expect(rankArtVars(99)).toBe("");
        expect(rankArtVars(null)).toBe("");
    });
});

describe("anyRanked", () => {
    const rank = (displayRank: number) => ({ displayRank }) as NonNullable<MatchPlayer["rank"]>;

    it("is false when no player has a rank", () => {
        const d = detail({}, [player(1, "hidden-king")], [player(7, "archmother", { rank: rank(0) })]);
        expect(anyRanked(boardTeams(d, null))).toBe(false);
    });

    it("is true when one player has a rank", () => {
        const d = detail({}, [player(1, "hidden-king")], [player(7, "archmother", { rank: rank(54) })]);
        expect(anyRanked(boardTeams(d, null))).toBe(true);
    });
});

describe("item tile size", () => {
    it("is a whole pixel size that fits a player column of the full board", () => {
        const BOARD_INNER_PX = 1198;
        const CELL_PADDING_PX = 12;
        const column = (BOARD_INNER_PX - BOARD_LABEL_REM * 16) / 12 - CELL_PADDING_PX;
        const grid = ITEM_GRID_COLUMNS * ITEM_TILE_PX + (ITEM_GRID_COLUMNS - 1) * ITEM_GAP_PX;
        expect(Number.isInteger(ITEM_TILE_PX)).toBe(true);
        expect(grid).toBeLessThanOrEqual(column);
        expect(grid + ITEM_GRID_COLUMNS).toBeGreaterThan(column);
    });
});
