import { afterEach, describe, expect, it, vi } from "vitest";
import type { AbilityProperty } from "@deadlock-plus/ipc-types/AbilityProperty";
import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
import type { AbilityUpgrade } from "@deadlock-plus/ipc-types/AbilityUpgrade";
import type { HeroStatsData } from "@deadlock-plus/ipc-types/HeroStatsData";
import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import { onGameArtChanged } from "$lib/features/gamedata/art-refresh";
import { loadAbilityTooltips } from "$lib/features/gamedata/vdata";
import type { ShopItem } from "./catalog";
import type { OrderStep } from "./editor/ability-order";
import { itemDetails, type StatCatalog } from "./hero-stats";

vi.mock("$lib/features/gamedata/vdata", () => ({ loadAbilityTooltips: vi.fn() }));
vi.mock("$lib/features/gamedata/art-refresh", () => ({ onGameArtChanged: vi.fn() }));

const load = vi.mocked(loadAbilityTooltips);
const artChanged = vi.mocked(onGameArtChanged);

async function adapter() {
    vi.resetModules();
    return import("./ability-tooltip");
}

afterEach(() => {
    vi.clearAllMocks();
});

const upgrade = (tier: number): AbilityUpgrade => ({
    tier,
    description: `Tier ${tier}`,
    values: {},
    bonuses: [],
});

function ability(abilityId: number, name: string): AbilityTooltip {
    return {
        abilityId,
        className: `citadel_ability_${abilityId}`,
        name,
        header: [],
        charges: null,
        chargeCooldown: null,
        cooldown: null,
        sections: [],
        upgrades: [upgrade(1), upgrade(2), upgrade(3)],
    };
}

const step = (abilityId: number, tier: number): OrderStep => ({ abilityId, tier, level: null });

describe("upgradeStates", () => {
    it("draws every card unaffordable while the ability is locked", async () => {
        const { upgradeStates } = await adapter();
        expect(upgradeStates(null)).toEqual(["cantAfford", "cantAfford", "cantAfford"]);
    });

    it("draws unbought tiers as the game does with no points to spend", async () => {
        const { upgradeStates } = await adapter();
        expect(upgradeStates(0)).toEqual(["cantAfford", "cantAfford", "cantAfford"]);
    });

    it("marks trained tiers as had", async () => {
        const { upgradeStates } = await adapter();
        expect(upgradeStates(2)).toEqual(["has", "has", "cantAfford"]);
        expect(upgradeStates(3)).toEqual(["has", "has", "has"]);
    });
});

describe("recommendedAfter", () => {
    it("recommends the tier the build's next step buys on the same ability", async () => {
        const { recommendedAfter } = await adapter();
        const steps = [step(1, 0), step(1, 1), step(1, 2)];
        expect(recommendedAfter(steps, 0)).toBe(1);
        expect(recommendedAfter(steps, 1)).toBe(2);
    });

    it("recommends nothing when the next step is another ability, an unlock or missing", async () => {
        const { recommendedAfter } = await adapter();
        const steps = [step(1, 0), step(2, 0), step(2, 1)];
        expect(recommendedAfter(steps, 0)).toBeNull();
        expect(recommendedAfter(steps, 2)).toBeNull();
        expect(recommendedAfter([step(1, 0), step(1, 0)], 0)).toBeNull();
    });
});

describe("abilityTooltipAt", () => {
    it("draws the cards as the build stands at that point", async () => {
        const { abilityTooltipAt } = await adapter();
        const model = abilityTooltipAt(ability(7, "Lightning Ball"), 1, 2);
        expect(model.name).toBe("Lightning Ball");
        expect(model.upgrades.map((u) => [u.tier, u.state, u.recommended])).toEqual([
            [1, "has", false],
            [2, "cantAfford", true],
            [3, "cantAfford", false],
        ]);
    });

    it("prices each tier as the build model charges it", async () => {
        const { abilityTooltipAt } = await adapter();
        const model = abilityTooltipAt(ability(7, "Lightning Ball"), 0);
        expect(model.upgrades.map((u) => u.cost)).toEqual(["1", "2", "5"]);
    });

    it("scales values by the hero's stats and draws the hero on boon markers", async () => {
        const { abilityTooltipAt } = await adapter();
        const scaled = (key: string, stat: string, factor: number): AbilityProperty => ({
            key,
            value: 30,
            unit: null,
            label: key,
            signed: false,
            cssClass: null,
            displayType: null,
            scale: { stat, factor, function: "scale_function_tech_damage" },
            statusEffect: false,
        });
        const burn = {
            ...ability(7, "Spirit Burn"),
            header: [scaled("Damage", "ETechPower", 0.5), scaled("Heal", "ELevelUpBoons", 2)],
        };
        const model = abilityTooltipAt(burn, 1, null, {
            stats: { ETechPower: 20, ELevelUpBoons: 4 },
            icon: "seven.png",
        });
        expect(model.chips.map((c) => c.value.number)).toEqual(["40", "38"]);
        expect(model.chips[1]!.scaling?.heroIcon).toBe("seven.png");
    });

    it("recommends nothing by default", async () => {
        const { abilityTooltipAt } = await adapter();
        const model = abilityTooltipAt(ability(7, "Lightning Ball"), null);
        expect(model.upgrades.every((u) => !u.recommended && u.state === "cantAfford")).toBe(true);
    });
});

describe("abilityChanges", () => {
    const property = (key: string, over: Partial<AbilityProperty> = {}): AbilityProperty => ({
        key,
        value: 30,
        unit: null,
        label: `${key} label`,
        signed: false,
        cssClass: "tech_damage",
        displayType: null,
        scale: { stat: "ETechPower", factor: 0.5, function: "scale_function_tech_damage" },
        statusEffect: false,
        ...over,
    });

    const burn: AbilityTooltip = {
        ...ability(7, "Spirit Burn"),
        header: [property("Radius", { value: 5, unit: "m", cssClass: "radius", scale: null })],
        cooldown: property("AbilityCooldown", { value: 20, unit: "s", cssClass: null, scale: null }),
        sections: [
            {
                description: null,
                values: {},
                groups: [{ title: null, cells: [property("Damage")] }],
                properties: [
                    property("Heal", { scale: { stat: "ELevelUpBoons", factor: 2, function: "boon" } }),
                    property("Slow", {
                        value: 10,
                        unit: "%",
                        cssClass: null,
                        scale: { ...property("x").scale!, factor: 0.01 },
                    }),
                    property("BonusDamage", { value: 0, requiredTier: 2 }),
                ],
                requiredTier: null,
            },
        ],
        upgrades: [
            {
                tier: 1,
                description: null,
                values: {},
                bonuses: [{ property: property("Damage", { value: 0.25 }), kind: "addToScale" }],
            },
            upgrade(2),
            upgrade(3),
        ],
    };

    it("lists the values that grow with spirit power and change, as the game shows them", async () => {
        const { abilityChanges } = await adapter();
        const before = { ETechPower: 20, ELevelUpBoons: 1 };
        expect(abilityChanges(burn, 0, before, { ETechPower: 30, ELevelUpBoons: 2 })).toEqual([
            { key: "ability:7:Damage", label: "Damage label", before: 40, after: 45, decimals: 1, postfix: null },
            { key: "ability:7:Slow", label: "Slow label", before: 10.2, after: 10.3, decimals: 1, postfix: "%" },
        ]);
    });

    it("scales by the tiers trained, and shows values a trained tier unlocks", async () => {
        const { abilityChanges } = await adapter();
        const changes = abilityChanges(burn, 2, { ETechPower: 20 }, { ETechPower: 30 });
        expect(changes.map((c) => [c.key, c.before, c.after])).toEqual([
            ["ability:7:Damage", 45, 52],
            ["ability:7:Slow", 10.2, 10.3],
            ["ability:7:BonusDamage", 10, 15],
        ]);
    });

    it("is empty when neither spirit power nor cooldown reduction changes", async () => {
        const { abilityChanges } = await adapter();
        const hero = { ETechPower: 20, ETechCooldown: 40 };
        expect(abilityChanges(burn, 3, hero, { ...hero, EMaxHealth: 900 })).toEqual([]);
    });

    it("keeps a value whose shown number does not move", async () => {
        const { abilityChanges } = await adapter();
        const changes = abilityChanges(burn, 0, { ETechPower: 20 }, { ETechPower: 21 });
        expect(changes.find((c) => c.key === "ability:7:Slow")).toMatchObject({ before: 10.2, after: 10.2 });
    });

    // Enchanter's Emblem on Graves (capture 9Rl7z9P8wb): 158 -> 173 spirit, 40% -> 43% ability cooldown.
    const cdr = (factor: number | null) => ({ stat: "ETechCooldown", factor, function: "scale_function_single_stat" });
    const jar: AbilityTooltip = {
        ...ability(8, "Jar of Dead"),
        cooldown: property("AbilityCooldown", { value: 20, unit: "s", cssClass: "cooldown", scale: cdr(null) }),
        sections: [
            {
                description: null,
                values: {},
                groups: [
                    {
                        title: null,
                        cells: [
                            property("Damage", {
                                value: 16,
                                scale: { ...burn.sections[0]!.groups[0]!.cells[0]!.scale!, factor: 0.25 },
                            }),
                        ],
                    },
                ],
                properties: [property("ResourceCost", { value: 120, cssClass: null, scale: cdr(1) })],
                requiredTier: null,
            },
        ],
        upgrades: [upgrade(1), upgrade(2), upgrade(3)],
    };

    it("shows cooldowns and other cooldown-scaled values shrinking with cooldown reduction, the cooldown last", async () => {
        const { abilityChanges } = await adapter();
        const changes = abilityChanges(
            jar,
            0,
            { ETechPower: 158, ETechCooldown: 40 },
            { ETechPower: 173, ETechCooldown: 43 },
        );
        const rounded = changes.map((c) => [c.key, c.before.toFixed(c.decimals), c.after.toFixed(c.decimals)]);
        expect(rounded).toEqual([
            ["ability:8:Damage", "56.0", "59.0"],
            ["ability:8:ResourceCost", "72.0", "68.4"],
            ["ability:8:AbilityCooldown", "12.0", "11.4"],
        ]);
        expect(changes[2]).toMatchObject({ label: "AbilityCooldown label", postfix: "s", decimals: 1 });
    });

    // Superior Cooldown on Graves with Compress Cooldown owned (capture nUeFQZwFv9): Death Required 120 -> 96,
    // Grasping Hands' cooldown 28 -> 27s, Borrowed Decree's 140 -> 112s. Values from `scripts/abilities.vdata_c`.
    describe("Superior Cooldown on Graves", () => {
        const COMPRESS = 1;
        const SUPERIOR = 2;
        const shopItem = (id: number, tier: 2 | 3, componentIds: number[], imbue: boolean): ShopItem => ({
            id,
            className: `upgrade_${id}`,
            name: `Item ${id}`,
            slot: "spirit",
            tier,
            cost: tier === 2 ? 1600 : 3200,
            active: false,
            shopable: true,
            disabled: false,
            imbue,
            shopFilters: [],
            disabledShopFilters: [],
            componentIds,
        });
        const itemStat = (key: string, value: number, provides: string, flat: boolean): ItemStat => ({
            key,
            value,
            unit: null,
            label: key,
            flat,
            provides,
            section: "passive",
        });
        const cdrProvided = "MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE";
        // As dp-gamedata reads them: Compress Cooldown's 18% applies only to the imbued ability.
        const catalog: StatCatalog = {
            byId: new Map([
                [COMPRESS, shopItem(COMPRESS, 2, [], true)],
                [SUPERIOR, shopItem(SUPERIOR, 3, [COMPRESS], false)],
            ]),
            statsById: new Map([
                [COMPRESS, [{ ...itemStat("CooldownReduction", 18, cdrProvided, false), onlyIfImbued: true }]],
                [
                    SUPERIOR,
                    [
                        itemStat("CooldownReduction", 20, cdrProvided, true),
                        itemStat("OutOfCombatHealthRegen", 4, "MODIFIER_VALUE_OUT_OF_COMBAT_HEALTH_REGEN", true),
                    ],
                ],
            ]),
        };
        const graves: HeroStatsData = {
            heroId: 1,
            base: {},
            perLevel: {},
            investment: { weapon: [], spirit: [], vitality: [] },
            bulletDamage: null,
        };
        const cooldown = (value: number) =>
            property("AbilityCooldown", { value, unit: "s", cssClass: "cooldown", scale: cdr(null) });
        // Jar of Dead has charges: no cooldown, and a charge delay no stat scales.
        const jarOfDead: AbilityTooltip = {
            ...ability(11, "Jar of Dead"),
            charges: property("AbilityCharges", { value: 4, cssClass: "cast", scale: null }),
            chargeCooldown: property("AbilityCooldownBetweenCharge", {
                value: 13,
                unit: "s",
                cssClass: "charge_cooldown",
                scale: null,
            }),
            sections: [
                {
                    description: null,
                    values: {},
                    groups: [],
                    properties: [
                        property("ResourceCost", {
                            value: 120,
                            label: "Death Required",
                            cssClass: "cast",
                            scale: cdr(1),
                        }),
                    ],
                    requiredTier: null,
                },
            ],
        };
        const hands: AbilityTooltip = { ...ability(12, "Grasping Hands"), cooldown: cooldown(34) };
        const theft: AbilityTooltip = ability(13, "Essence Theft");
        const decree: AbilityTooltip = { ...ability(14, "Borrowed Decree"), cooldown: cooldown(140) };

        const round = (n: number) => Math.round(n * 100) / 100;

        async function rows(imbues: ReadonlyMap<number, number>) {
            const { abilityChanges } = await adapter();
            const details = itemDetails({
                hero: graves,
                level: 20,
                ownedIds: [COMPRESS],
                itemId: SUPERIOR,
                catalog,
                label: (stat) => stat,
                imbues,
                abilityGroups: (heroFor) =>
                    [jarOfDead, hands, theft, decree].flatMap((a) => {
                        const { before, after, imbued } = heroFor(a.abilityId);
                        const changes = abilityChanges(a, 0, before, after);
                        return changes.length > 0 ? [{ kind: "ability" as const, icon: a.name, imbued, changes }] : [];
                    }),
            })!;
            return details.groups.map((g) => [
                g.icon,
                g.imbued,
                g.changes.map((c) => [c.label, round(c.before), round(c.after)]),
            ]);
        }

        // The game shows Grasping Hands 28 -> 27s: 34 x 0.82 = 27.88 while Compress Cooldown is imbued on it, and
        // 34 x 0.8 = 27.2 once Superior Cooldown has used Compress Cooldown up. No imbued background after. The tooltip
        // model rounds a cooldown to one decimal, so 27.88 reads 27.9 here; the whole-number display is not modelled.
        it("lists each value the purchase changes, counting the imbued 18% on Grasping Hands until it is used up", async () => {
            expect(await rows(new Map([[COMPRESS, hands.abilityId]]))).toEqual([
                ["Jar of Dead", false, [["Death Required", 120, 96]]],
                ["Grasping Hands", false, [["AbilityCooldown label", 27.9, 27.2]]],
                ["Borrowed Decree", false, [["AbilityCooldown label", 140, 112]]],
            ]);
        });

        it("counts Compress Cooldown's 18% on no ability when it is imbued on none", async () => {
            const hands = (await rows(new Map())).find(([icon]) => icon === "Grasping Hands");
            expect(hands).toEqual(["Grasping Hands", false, [["AbilityCooldown label", 34, 27.2]]]);
        });
    });
});

describe("heroAbilityTooltips", () => {
    it("keys the game's ability tooltips by ability id", async () => {
        const { heroAbilityTooltips } = await adapter();
        load.mockResolvedValue([ability(7, "Lightning Ball"), ability(9, "Static Charge")]);
        const tooltips = await heroAbilityTooltips("english");
        expect(load).toHaveBeenCalledWith("english");
        expect(tooltips.get(9)?.name).toBe("Static Charge");
        expect(tooltips.get(8)).toBeUndefined();
    });

    it("answers no tooltips when the game answers null or drifted rows", async () => {
        const { heroAbilityTooltips } = await adapter();
        load.mockResolvedValueOnce(null as never);
        expect((await heroAbilityTooltips("english")).size).toBe(0);
        load.mockResolvedValueOnce([null, { name: "no id" }, ability(7, "Lightning Ball")] as never);
        expect([...(await heroAbilityTooltips("english")).keys()]).toEqual([7]);
    });

    it("answers no tooltips and asks again when the read rejects", async () => {
        const { heroAbilityTooltips } = await adapter();
        load.mockRejectedValueOnce(new Error("gone")).mockResolvedValueOnce([ability(7, "Lightning Ball")]);
        expect((await heroAbilityTooltips("english")).size).toBe(0);
        expect((await heroAbilityTooltips("english")).size).toBe(1);
    });

    it("reads each locale once", async () => {
        const { heroAbilityTooltips } = await adapter();
        load.mockResolvedValue([ability(7, "Lightning Ball")]);
        await heroAbilityTooltips("english");
        await heroAbilityTooltips("english");
        await heroAbilityTooltips("german");
        expect(load.mock.calls).toEqual([["english"], ["german"]]);
    });

    it("asks again after a read that found nothing, as the game may not be readable yet", async () => {
        const { heroAbilityTooltips } = await adapter();
        load.mockResolvedValueOnce([]).mockResolvedValueOnce([ability(7, "Lightning Ball")]);
        expect((await heroAbilityTooltips("english")).size).toBe(0);
        expect((await heroAbilityTooltips("english")).size).toBe(1);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("reads the locales it holds again after a game update", async () => {
        const { heroAbilityTooltips } = await adapter();
        let build = 6805;
        load.mockImplementation(async (locale) => [ability(7, `${locale} ${build}`)]);
        await heroAbilityTooltips("english");
        expect(artChanged).toHaveBeenCalledTimes(1);
        build = 6810;
        await artChanged.mock.calls[0]![0]();
        expect((await heroAbilityTooltips("english")).get(7)?.name).toBe("english 6810");
        await heroAbilityTooltips("german");
        expect(artChanged).toHaveBeenCalledTimes(1);
        expect(load.mock.calls).toEqual([["english"], ["english"], ["german"]]);
    });

    it("bumps its revision once a game update's re-read lands", async () => {
        const { heroAbilityTooltips, abilityTooltipsRevision } = await adapter();
        load.mockResolvedValue([ability(7, "Lightning Ball")]);
        await heroAbilityTooltips("english");
        const before = abilityTooltipsRevision();
        let land!: () => void;
        load.mockImplementationOnce(
            () => new Promise((resolve) => (land = () => resolve([ability(7, "Lightning Ball, updated")]))),
        );
        const refresh = artChanged.mock.calls[0]![0]();
        expect(abilityTooltipsRevision()).toBe(before);
        land();
        await refresh;
        expect(abilityTooltipsRevision()).toBe(before + 1);
    });
});
