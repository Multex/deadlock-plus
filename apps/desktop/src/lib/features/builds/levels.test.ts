import type { AssetHero, AssetLevelInfo } from "@deadlock-plus/deadlock-api";
import type { LevelInfo } from "@deadlock-plus/ipc-types/LevelInfo";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLevelTable, createProgressionTable, loadLevelTable, netWorthFor, type LevelTable } from "./levels";

const { command } = vi.hoisted(() => ({ command: vi.fn() }));
vi.mock("$lib/core/tauri", () => ({ command }));

beforeEach(() => {
    command.mockReset();
});

const CACHE = join(process.cwd(), "e2e/.cache/game-data/v1");

function cachedHeroes(): AssetHero[] | null {
    if (!existsSync(CACHE)) return null;
    for (const file of readdirSync(CACHE)) {
        const text = readFileSync(join(CACHE, file), "utf8");
        const cut = text.indexOf("\n");
        if (cut < 0 || !text.slice(0, cut).includes("/assets/heroes")) continue;
        return JSON.parse(text.slice(cut + 1)) as AssetHero[];
    }
    return null;
}

const unlock = (required_gold: number): AssetLevelInfo => ({ required_gold, bonus_currencies: ["EAbilityUnlocks"] });
const point = (required_gold: number): AssetLevelInfo => ({ required_gold, bonus_currencies: ["EAbilityPoints"] });

const small = createLevelTable({
    "3": unlock(500),
    "1": unlock(0),
    "2": point(200),
    "4": point(900),
});

describe("createLevelTable", () => {
    it("orders levels by number whatever the key order", () => {
        expect(small.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
        expect(small.levels.map((l) => l.souls)).toEqual([0, 200, 500, 900]);
    });

    it("finds the level reached at a souls total", () => {
        expect(small.levelAt(0)).toBe(1);
        expect(small.levelAt(199)).toBe(1);
        expect(small.levelAt(200)).toBe(2);
        expect(small.levelAt(899)).toBe(3);
        expect(small.levelAt(99999)).toBe(4);
    });

    it("counts ability points and unlocks gained up to a souls total", () => {
        expect(small.apAt(0)).toBe(0);
        expect(small.apAt(200)).toBe(1);
        expect(small.apAt(500)).toBe(1);
        expect(small.apAt(900)).toBe(2);
        expect(small.unlocksAt(0)).toBe(1);
        expect(small.unlocksAt(499)).toBe(1);
        expect(small.unlocksAt(500)).toBe(2);
    });

    it("clamps negative souls to the first level", () => {
        expect(small.levelAt(-5)).toBe(1);
        expect(small.apAt(-5)).toBe(0);
    });

    it("keeps per-level gains", () => {
        expect(small.levels[1]).toEqual({ level: 2, souls: 200, ap: 1, unlocks: 1, apGained: 1, unlocksGained: 0 });
        expect(small.levels[2]).toMatchObject({ unlocksGained: 1, apGained: 0, unlocks: 2 });
    });

    it("rejects an empty table", () => {
        expect(() => createLevelTable({})).toThrow();
    });
});

/** `hero_base.m_mapLevelInfo` of `scripts/heroes.vdata_c` on game build 6805, as `game_hero_progression` returns it. */
const SOULS_6805 = [
    0, 200, 500, 900, 1400, 2000, 2600, 3200, 3900, 4600, 5300, 6000, 6800, 7600, 8400, 9200, 10100, 11000, 11900,
    12800, 13800, 14900, 16100, 17400, 18900, 20600, 22500, 24600, 26900, 29400, 32100, 35000, 38100, 41400, 44900,
    48600,
];
const UNLOCK_LEVELS_6805 = [1, 3, 5, 8];
const PROGRESSION_6805: LevelInfo[] = SOULS_6805.map((souls, i) => {
    const unlock = UNLOCK_LEVELS_6805.includes(i + 1);
    return { level: i + 1, souls, ap: unlock ? 0 : 1, unlocks: unlock ? 1 : 0 };
});

/** The plan's level facts: unlocks at 0/500/1400/3200 souls, 1 AP on every other level, 32 AP at 48,600. */
function expectKnownLevelFacts(table: LevelTable, name: string) {
    expect(
        table.levels.filter((l) => l.unlocksGained > 0).map((l) => l.souls),
        name,
    ).toEqual([0, 500, 1400, 3200]);
    expect(table.unlocksAt(499), name).toBe(1);
    expect(table.unlocksAt(500), name).toBe(2);
    expect(table.unlocksAt(1400), name).toBe(3);
    expect(table.unlocksAt(3199), name).toBe(3);
    expect(table.unlocksAt(3200), name).toBe(4);
    for (const l of table.levels) {
        expect(l.apGained, `${name} L${l.level}`).toBe(l.unlocksGained > 0 ? 0 : 1);
        expect(l.apGained + l.unlocksGained, `${name} L${l.level}`).toBe(1);
    }
    expect(table.apAt(48600), name).toBe(32);
    expect(table.apAt(48599), name).toBe(31);
    expect(table.levelAt(48600), name).toBe(36);
}

describe("createProgressionTable", () => {
    it("matches the known level facts on the game's own table", () => {
        expectKnownLevelFacts(createProgressionTable(PROGRESSION_6805), "game 6805");
    });

    it("adds up what each level gains, whatever the order", () => {
        const table = createProgressionTable([
            { level: 2, souls: 200, ap: 2, unlocks: 0 },
            { level: 1, souls: 0, ap: 0, unlocks: 1 },
            { level: 3, souls: 500, ap: 1, unlocks: 1 },
        ]);
        expect(table.levels).toEqual([
            { level: 1, souls: 0, ap: 0, unlocks: 1, apGained: 0, unlocksGained: 1 },
            { level: 2, souls: 200, ap: 2, unlocks: 1, apGained: 2, unlocksGained: 0 },
            { level: 3, souls: 500, ap: 3, unlocks: 2, apGained: 1, unlocksGained: 1 },
        ]);
    });

    it("rejects an empty table", () => {
        expect(() => createProgressionTable([])).toThrow();
    });
});

describe("loadLevelTable", () => {
    const assetInfo = { "1": unlock(0), "2": point(300) };

    it("prefers the game's level table over the hero asset", async () => {
        command.mockResolvedValue({ levels: PROGRESSION_6805 });
        const table = await loadLevelTable(assetInfo);
        expect(command).toHaveBeenCalledWith("game_hero_progression");
        expect(table?.levels.map((l) => l.souls)).toEqual(SOULS_6805);
    });

    it("falls back to the hero asset when the game has no levels", async () => {
        command.mockResolvedValue({ levels: [] });
        expect((await loadLevelTable(assetInfo))?.levels.map((l) => l.souls)).toEqual([0, 300]);
    });

    it("falls back to the hero asset when the game cannot be asked", async () => {
        command.mockRejectedValue(new Error("no backend"));
        expect((await loadLevelTable(assetInfo))?.levels.map((l) => l.souls)).toEqual([0, 300]);
    });

    it("is null when neither source has levels", async () => {
        command.mockResolvedValue({ levels: [] });
        expect(await loadLevelTable()).toBeNull();
        expect(await loadLevelTable({})).toBeNull();
    });
});

describe("netWorthFor", () => {
    it("adds the 600 starting souls to a threshold", () => {
        expect(netWorthFor(0)).toBe(600);
        expect(netWorthFor(500)).toBe(1100);
        expect(netWorthFor(48600)).toBe(49200);
    });
});

const heroes = cachedHeroes();

describe.skipIf(heroes === null)("level table of the cached hero data", () => {
    const withLevels = (heroes ?? []).filter((h) => h.level_info !== undefined);
    const tables = withLevels.map((h) => ({ name: h.name, table: createLevelTable(h.level_info!) }));

    it("is present on every hero", () => {
        expect(withLevels.length).toBe(heroes?.length);
    });

    it("matches the known level facts on every hero", () => {
        for (const { name, table } of tables) expectKnownLevelFacts(table, name);
    });

    it("agrees with the game's own table", () => {
        const game = createProgressionTable(PROGRESSION_6805).levels;
        for (const { name, table } of tables) expect(table.levels, name).toEqual(game);
    });
});
