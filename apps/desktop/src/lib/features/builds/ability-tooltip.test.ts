import { afterEach, describe, expect, it, vi } from "vitest";
import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
import type { AbilityUpgrade } from "@deadlock-plus/ipc-types/AbilityUpgrade";
import { loadAbilityTooltips } from "$lib/features/gamedata/vdata";
import type { OrderStep } from "./editor/ability-order";

vi.mock("$lib/features/gamedata/vdata", () => ({ loadAbilityTooltips: vi.fn() }));

const load = vi.mocked(loadAbilityTooltips);

async function adapter() {
    vi.resetModules();
    return import("./ability-tooltip");
}

afterEach(() => {
    vi.clearAllMocks();
});

const upgrade = (tier: number, cost: number): AbilityUpgrade => ({
    tier,
    cost,
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
        upgrades: [upgrade(1, 1), upgrade(2, 2), upgrade(3, 5)],
    };
}

const step = (abilityId: number, tier: number): OrderStep => ({ abilityId, tier, level: null });

describe("upgradeStates", () => {
    it("shows every card untrained while the ability is locked", async () => {
        const { upgradeStates } = await adapter();
        expect(upgradeStates(null)).toEqual(["notTrained", "notTrained", "notTrained"]);
    });

    it("offers tier 1 once the ability is unlocked", async () => {
        const { upgradeStates } = await adapter();
        expect(upgradeStates(0)).toEqual(["available", "notTrained", "notTrained"]);
    });

    it("marks trained tiers and offers the next one", async () => {
        const { upgradeStates } = await adapter();
        expect(upgradeStates(2)).toEqual(["has", "has", "available"]);
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
            [2, "available", true],
            [3, "notTrained", false],
        ]);
    });

    it("recommends nothing by default", async () => {
        const { abilityTooltipAt } = await adapter();
        const model = abilityTooltipAt(ability(7, "Lightning Ball"), null);
        expect(model.upgrades.every((u) => !u.recommended && u.state === "notTrained")).toBe(true);
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
});
