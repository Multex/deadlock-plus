import type { AssetHero, AssetLevelInfo } from "@deadlock-plus/deadlock-api";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLevelTable, netWorthFor } from "./levels";

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

    it("unlocks the abilities at 0, 500, 1400 and 3200 souls", () => {
        for (const { name, table } of tables) {
            const at = table.levels.filter((l) => l.unlocksGained > 0).map((l) => l.souls);
            expect(at, name).toEqual([0, 500, 1400, 3200]);
            expect(table.unlocksAt(499), name).toBe(1);
            expect(table.unlocksAt(500), name).toBe(2);
            expect(table.unlocksAt(1400), name).toBe(3);
            expect(table.unlocksAt(3199), name).toBe(3);
            expect(table.unlocksAt(3200), name).toBe(4);
        }
    });

    it("gives 1 ability point on every other level and 32 in total at 48,600 souls", () => {
        for (const { name, table } of tables) {
            for (const l of table.levels) {
                expect(l.apGained, `${name} L${l.level}`).toBe(l.unlocksGained > 0 ? 0 : 1);
            }
            expect(table.apAt(48600), name).toBe(32);
            expect(table.apAt(48599), name).toBe(31);
            expect(table.levelAt(48600), name).toBe(36);
        }
    });

    it("grants one thing per level and nothing beyond the fixed currencies", () => {
        for (const { name, table } of tables) {
            for (const l of table.levels) expect(l.apGained + l.unlocksGained, `${name} L${l.level}`).toBe(1);
        }
    });
});
