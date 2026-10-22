import { afterEach, describe, expect, it, vi } from "vitest";
import type { AbilityProperty } from "@deadlock-plus/ipc-types/AbilityProperty";
import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
import type { AbilityUpgrade } from "@deadlock-plus/ipc-types/AbilityUpgrade";
import { onGameArtChanged } from "$lib/features/gamedata/art-refresh";
import { loadAbilityTooltips } from "$lib/features/gamedata/vdata";
import type { OrderStep } from "./editor/ability-order";

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

describe("heroAbilityTooltips", () => {
    it("keys the game's ability tooltips by ability id", async () => {
        const { heroAbilityTooltips } = await adapter();
        load.mockResolvedValue([ability(7, "Lightning Ball"), ability(9, "Static Charge")]);
        const tooltips = await heroAbilityTooltips("english");
        expect(load).toHaveBeenCalledWith("english");
        expect(tooltips.get(9)?.name).toBe("Static Charge");
        expect(tooltips.get(8)).toBeUndefined();
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
