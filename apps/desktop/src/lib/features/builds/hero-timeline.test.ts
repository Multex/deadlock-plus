import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { HeroStatsData } from "@deadlock-plus/ipc-types/HeroStatsData";
import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), fileSrc: (p: string) => p }));
vi.mock("$lib/features/gamedata/gamedata", () => ({ loadItemArt: vi.fn() }));

import type { ShopItem, ShopSlot } from "./catalog";
import type { OrderStep } from "./editor/ability-order";
import type { StatCatalog } from "./hero-stats";
import { heroStatsAtNetWorth, heroStatsAtStep, heroTimeline } from "./hero-timeline";
import type { Level } from "./levels";

const tier = (souls: number, bonus: number) => ({ souls, bonus, percentOnGraph: 7 });

const SEVEN: HeroStatsData = {
    heroId: 2,
    base: { EMaxHealth: 730 },
    perLevel: { MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL: 0.24, MODIFIER_VALUE_TECH_POWER: 1.1 },
    investment: { weapon: [tier(800, 9)], spirit: [tier(800, 7)], vitality: [tier(800, 9)] },
    bulletDamage: 10.8,
};

const item = (id: number, slot: ShopSlot, cost: number): ShopItem => ({
    id,
    className: `upgrade_${id}`,
    name: `Item ${id}`,
    slot,
    tier: 1,
    cost,
    active: false,
    componentIds: [],
    shopable: true,
    disabled: false,
});

const stat = (provides: string, value: number, flat = true): ItemStat => ({
    key: provides,
    value,
    unit: null,
    label: provides,
    flat,
    provides,
    section: "innate",
});

const HEADSHOT_BOOSTER = 1;
const EXTRA_SPIRIT = 2;

const CATALOG: StatCatalog = {
    byId: new Map([
        [HEADSHOT_BOOSTER, item(HEADSHOT_BOOSTER, "weapon", 800)],
        [EXTRA_SPIRIT, item(EXTRA_SPIRIT, "spirit", 800)],
    ]),
    statsById: new Map([
        [HEADSHOT_BOOSTER, [stat("MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE", 40, false)]],
        [EXTRA_SPIRIT, [stat("MODIFIER_VALUE_TECH_POWER", 10)]],
    ]),
};

const level = (n: number, souls: number): Level => ({
    level: n,
    souls,
    ap: 0,
    unlocks: 0,
    apGained: 0,
    unlocksGained: 0,
});

// Net worth is souls earned plus the 600 every hero starts with: 600, 800, 1100, 1500, 2000.
const LEVELS = [level(1, 0), level(2, 200), level(3, 500), level(4, 900), level(5, 1400)];

const BUILD: BuildView = {
    heroBuildId: 1,
    heroId: 2,
    authorAccountId: 1,
    lastUpdatedTimestamp: null,
    name: "B",
    description: "",
    language: 0,
    version: 1,
    originBuildId: null,
    tags: [],
    developmentBuild: false,
    publishTimestamp: null,
    favorited: false,
    abilityOrder: [],
    modCategories: [
        {
            mods: [HEADSHOT_BOOSTER, EXTRA_SPIRIT].map((abilityId) => ({
                abilityId,
                annotation: null,
                requiredFlexSlots: null,
                sellPriority: null,
                imbueTargetAbilityId: null,
            })),
            name: "C",
            description: "",
            width: null,
            height: null,
            optional: false,
        },
    ],
};

const timeline = heroTimeline(SEVEN, BUILD, CATALOG, LEVELS);

describe("heroStatsAtNetWorth", () => {
    it("is the hero at the level reached with the Quick Buy items bought by then", () => {
        // Level 3, Headshot Booster bought: 800 weapon souls give the first 9% investment tier.
        const stats = heroStatsAtNetWorth(timeline, 1100);
        expect(stats.EBulletDamage).toBeCloseTo((10.8 + 0.24 * 2) * 1.09);
        expect(stats.ETechPower).toBeCloseTo(2.2);
    });

    it("counts spirit items and spirit investment once they are bought", () => {
        const stats = heroStatsAtNetWorth(timeline, 2000);
        expect(stats.ETechPower).toBeCloseTo(1.1 * 4 + 10 + 7);
    });
});

describe("heroStatsAtStep", () => {
    const steps: OrderStep[] = [
        { abilityId: 7, tier: 0, level: 1 },
        { abilityId: 7, tier: 1, level: 3 },
        { abilityId: 7, tier: 2, level: 5 },
        { abilityId: 7, tier: 3, level: null },
    ];

    it("is the hero when the build reaches the step's level", () => {
        expect(heroStatsAtStep(timeline, steps, 0)?.EBulletDamage).toBeCloseTo(10.8);
        expect(heroStatsAtStep(timeline, steps, 1)?.EBulletDamage).toBeCloseTo((10.8 + 0.48) * 1.09);
        expect(heroStatsAtStep(timeline, steps, 2)?.ETechPower).toBeCloseTo(21.4);
    });

    it("is the hero at the start of the match for an ability no step trains", () => {
        expect(heroStatsAtStep(timeline, steps, null)).toEqual(heroStatsAtNetWorth(timeline, 600));
    });

    it("is unknown for a step past the level table", () => {
        expect(heroStatsAtStep(timeline, steps, 3)).toBeUndefined();
        expect(heroStatsAtStep(timeline, steps, 9)).toBeUndefined();
    });
});
