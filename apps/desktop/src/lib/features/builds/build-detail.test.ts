import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { describe, expect, it, vi } from "vitest";
import type { ShopItem } from "./catalog";
import type { Level } from "./levels";

vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), listen: vi.fn(), fileSrc: (p: string) => p }));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("$lib/core/i18n.svelte", () => ({ i18n: { locale: "en" }, t: (key: string) => key }));
vi.mock("$lib/core/errors", () => ({ failureText: (_e: unknown, fallback: string) => fallback }));
vi.mock("$lib/features/gamedata/gamedata", () => ({ loadAbilityArt: vi.fn(), loadItemArt: vi.fn() }));
vi.mock("$lib/features/heroes/heroes", () => ({ loadHeroes: vi.fn() }));
vi.mock("$lib/features/match-history/names", () => ({ playerNames: { resolve: vi.fn() } }));

import {
    abilitySteps,
    chipFor,
    costLine,
    knownWarnings,
    localStatus,
    parseTarget,
    pickLocal,
} from "./build-detail.svelte";

function view(fields: Partial<BuildView> = {}): BuildView {
    return {
        heroBuildId: 3,
        heroId: 1,
        authorAccountId: 7,
        lastUpdatedTimestamp: null,
        name: "",
        description: "",
        language: 0,
        version: 0,
        originBuildId: null,
        modCategories: [],
        abilityOrder: [],
        tags: [],
        developmentBuild: false,
        publishTimestamp: null,
        favorited: false,
        ...fields,
    };
}

function local(section: LocalBuild["section"], id: number): LocalBuild {
    return { section, build: view({ heroBuildId: id }), base: `${section}-${id}`, warnings: [] };
}

function item(id: number, cost: number, fields: Partial<ShopItem> = {}): ShopItem {
    return {
        id,
        className: `item_${id}`,
        name: `Item ${id}`,
        slot: "spirit",
        tier: 1,
        cost,
        active: false,
        componentIds: [],
        shopable: true,
        disabled: false,
        ...fields,
    };
}

function category(ids: number[], optional = false): ModCategoryView {
    return {
        mods: ids.map((abilityId) => ({
            abilityId,
            annotation: null,
            requiredFlexSlots: null,
            sellPriority: null,
            imbueTargetAbilityId: null,
        })),
        name: "",
        description: "",
        width: null,
        height: null,
        optional,
    };
}

describe("parseTarget", () => {
    it("reads the source and a positive whole id", () => {
        expect(parseTarget(new URLSearchParams("source=public&id=381204"))).toEqual({ source: "public", id: 381204 });
        expect(parseTarget(new URLSearchParams("source=local&id=3"))).toEqual({ source: "local", id: 3 });
    });

    it("gives null for a bare URL, an unknown source or a bad id", () => {
        expect(parseTarget(new URLSearchParams(""))).toBeNull();
        expect(parseTarget(new URLSearchParams("source=other&id=3"))).toBeNull();
        expect(parseTarget(new URLSearchParams("source=local&id=abc"))).toBeNull();
        expect(parseTarget(new URLSearchParams("source=local&id=-2"))).toBeNull();
        expect(parseTarget(new URLSearchParams("source=local&id=1.5"))).toBeNull();
        expect(parseTarget(new URLSearchParams("source=local"))).toBeNull();
    });
});

describe("pickLocal", () => {
    it("prefers the build's own section over a favourite of it", () => {
        const builds = [local("Favorites", 3), local("Unpublished", 3), local("SavedLastUsed", 402117)];
        expect(pickLocal(builds, 3)?.section).toBe("Unpublished");
        expect(pickLocal(builds, 402117)?.section).toBe("SavedLastUsed");
        expect(pickLocal(builds, 9)).toBeUndefined();
    });
});

describe("localStatus", () => {
    it("is waiting for the game while a save of that build is queued", () => {
        expect(localStatus(local("Unpublished", 7), [{ buildId: 7 }])).toBe("waiting");
        expect(localStatus(local("SavedLastUsed", 402117), [{ buildId: 402117 }])).toBe("waiting");
    });

    it("is in game for a local build, wherever the file keeps it", () => {
        expect(localStatus(local("Unpublished", 7), [{ buildId: 5 }])).toBe("inGame");
        expect(localStatus(local("Favorites", 12), [])).toBe("inGame");
    });

    it("is published for a build with a published id", () => {
        expect(localStatus(local("SavedLastUsed", 402117), [])).toBe("published");
        expect(localStatus(local("Favorites", 381204), [])).toBe("published");
    });
});

describe("chipFor", () => {
    const byId = new Map([
        [1, item(1, 800, { active: true, tier: 2 })],
        [2, item(2, 800, { shopable: false })],
        [3, item(3, 800, { disabled: true })],
    ]);

    it("draws a shop item and leaves out items the shop no longer sells", () => {
        expect(chipFor(byId, 1)).toEqual({ name: "Item 1", slot: "spirit", tier: 2, active: true });
        expect(chipFor(byId, 2)).toBeUndefined();
        expect(chipFor(byId, 3)).toBeUndefined();
        expect(chipFor(byId, 99)).toBeUndefined();
    });
});

describe("costLine", () => {
    const byId = new Map([
        [10, item(10, 800)],
        [11, item(11, 1600, { componentIds: [10] })],
        [12, item(12, 500)],
        [13, item(13, 3000)],
        [14, item(14, 1250, { disabled: true })],
    ]);

    it("sums the Quick Buy order with owned components discounting their upgrades", () => {
        const build = view({ modCategories: [category([10, 12]), category([11])] });
        expect(costLine(build, byId)).toEqual({ total: 800 + 500 + 800, items: 3, removed: 0 });
    });

    it("leaves out optional categories", () => {
        const build = view({ modCategories: [category([12]), category([13], true)] });
        expect(costLine(build, byId)).toEqual({ total: 500, items: 1, removed: 0 });
    });

    it("counts items the shop no longer sells and does not price them", () => {
        const build = view({ modCategories: [category([12, 14, 99]), category([14], true)] });
        expect(costLine(build, byId)).toEqual({ total: 500, items: 1, removed: 3 });
    });
});

describe("abilitySteps", () => {
    const level = (souls: number, ap: number, unlocks: number): Level => ({
        level: 0,
        souls,
        ap,
        unlocks,
        apGained: 0,
        unlocksGained: 0,
    });
    const levels = [level(0, 0, 1), level(200, 1, 1), level(500, 1, 2), level(900, 2, 2), level(1400, 3, 3)];
    const unlock = (abilityId: number): CurrencyChangeView => ({
        abilityId,
        currencyType: 2,
        delta: -1,
        annotation: null,
    });
    const ap = (abilityId: number, delta: number): CurrencyChangeView => ({
        abilityId,
        currencyType: 1,
        delta,
        annotation: null,
    });

    it("numbers unlocks and tiers with the net worth each step needs", () => {
        const steps = abilitySteps([unlock(1), ap(1, -1), unlock(2), ap(2, -1), ap(1, -2)], levels);
        expect(steps).toEqual([
            { abilityId: 1, kind: "unlock", tier: 0, cost: 1, netWorth: 600 },
            { abilityId: 1, kind: "upgrade", tier: 1, cost: 1, netWorth: 800 },
            { abilityId: 2, kind: "unlock", tier: 0, cost: 1, netWorth: 1100 },
            { abilityId: 2, kind: "upgrade", tier: 1, cost: 1, netWorth: 1500 },
            { abilityId: 1, kind: "upgrade", tier: 2, cost: 2, netWorth: null },
        ]);
    });

    it("reads an unlock stored with no points spent as an unlock", () => {
        expect(abilitySteps([{ ...unlock(1), delta: 0 }], levels)[0]).toMatchObject({ kind: "unlock", cost: 1 });
    });

    it("drops the leftover tail from a tier past 3 on, valid-looking steps after it included", () => {
        const order = [unlock(1), ap(1, -1), ap(1, -2), ap(1, -5), ap(1, -5), unlock(2), ap(2, -1)];
        expect(abilitySteps(order, levels).map((s) => [s.abilityId, s.kind, s.tier])).toEqual([
            [1, "unlock", 0],
            [1, "upgrade", 1],
            [1, "upgrade", 2],
            [1, "upgrade", 3],
        ]);
    });

    it("drops the leftover tail from a repeated or fifth unlock on", () => {
        const repeated = [unlock(1), unlock(2), unlock(1), unlock(3)];
        expect(abilitySteps(repeated, levels).map((s) => s.abilityId)).toEqual([1, 2]);
        const fifth = [unlock(1), unlock(2), unlock(3), unlock(4), unlock(5), ap(1, -1)];
        expect(abilitySteps(fifth, levels).map((s) => s.abilityId)).toEqual([1, 2, 3, 4]);
    });

    it("skips points on a locked ability", () => {
        expect(abilitySteps([ap(3, -1), unlock(1), ap(1, -1)], levels).map((s) => s.kind)).toEqual([
            "unlock",
            "upgrade",
        ]);
    });
});

describe("knownWarnings", () => {
    it("keeps the backend's warning codes it has text for, once each, in order", () => {
        expect(knownWarnings(["leftover", "free_unlock", "something_new", "leftover"])).toEqual([
            "leftover",
            "free_unlock",
        ]);
    });
});
