import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import type { LevelInfo } from "@deadlock-plus/ipc-types/LevelInfo";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopItem } from "./catalog";
import type { Level } from "./levels";

const mocks = vi.hoisted(() => ({
    command: vi.fn(),
    heroes: vi.fn(),
    items: vi.fn(),
    builds: vi.fn(),
}));
vi.mock("$lib/core/tauri", () => ({ command: mocks.command, listen: vi.fn(), fileSrc: (p: string) => p }));
vi.mock("$lib/core/deadlock-api", () => ({
    deadlockApi: { heroes: mocks.heroes, items: mocks.items, builds: mocks.builds },
}));
vi.mock("$lib/core/i18n.svelte", () => ({ i18n: { locale: "en" }, t: (key: string) => key }));
vi.mock("$lib/core/errors", () => ({ failureText: (_e: unknown, fallback: string) => fallback }));
vi.mock("$lib/features/gamedata/gamedata", () => ({ loadAbilityArt: vi.fn(async () => ({})), loadItemArt: vi.fn() }));
vi.mock("$lib/features/heroes/heroes", () => ({ loadHeroes: vi.fn(async () => ({})) }));
vi.mock("$lib/features/match-history/names", () => ({ playerNames: { resolve: vi.fn(async () => new Map()) } }));

import {
    BuildDetail,
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

    it("reads a draft's id as text, and needs one", () => {
        expect(parseTarget(new URLSearchParams("source=draft&id=d%201"))).toEqual({ source: "draft", id: "d 1" });
        expect(parseTarget(new URLSearchParams("source=draft&id="))).toBeNull();
        expect(parseTarget(new URLSearchParams("source=draft"))).toBeNull();
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
        [4, item(4, 800, { imbue: true })],
    ]);

    it("draws a shop item and leaves out items the shop no longer sells", () => {
        expect(chipFor(byId, 1)).toEqual({
            id: 1,
            name: "Item 1",
            slot: "spirit",
            tier: 2,
            cost: 800,
            active: true,
            imbue: false,
        });
        expect(chipFor(byId, 2)).toBeUndefined();
        expect(chipFor(byId, 3)).toBeUndefined();
        expect(chipFor(byId, 99)).toBeUndefined();
    });

    it("marks imbue items, which the card labels on the art", () => {
        expect(chipFor(byId, 4)?.imbue).toBe(true);
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

    it("prices a listed duplicate once and still counts it", () => {
        const build = view({ modCategories: [category([10, 12, 10]), category([10, 11])] });
        expect(costLine(build, byId)).toEqual({ total: 800 + 500 + 800, items: 5, removed: 0 });
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

describe("BuildDetail", () => {
    const PUBLISHED = 381204;
    const gameLevels: LevelInfo[] = [
        { level: 1, souls: 0, ap: 0, unlocks: 1 },
        { level: 2, souls: 321, ap: 1, unlocks: 0 },
    ];
    let answers: Record<string, unknown>;

    function stored(source: DraftView["source"]): DraftView {
        return { id: "d1", updatedAt: 300, heroId: 1, source, build: view({ name: "Renamed" }) };
    }

    function listed(builds: LocalBuild[] = []): LocalBuilds {
        return { accountId: 7, exists: true, gameRunning: false, builds, lastUsed: [], queue: [], nextLocalId: 4 };
    }

    function apiRow(id: number) {
        return {
            hero_build: {
                hero_id: 1,
                hero_build_id: id,
                author_account_id: 9,
                name: "Published",
                language: 0,
                version: 2,
                origin_build_id: 0,
                details: { mod_categories: [] },
            },
            num_favorites: 12,
        };
    }

    async function loaded(target: ConstructorParameters<typeof BuildDetail>[0]): Promise<BuildDetail> {
        const detail = new BuildDetail(target);
        await detail.load();
        return detail;
    }

    const sent = (name: string) => mocks.command.mock.calls.filter(([n]) => n === name).map(([, args]) => args);

    beforeEach(() => {
        answers = {
            builds_drafts: [stored({ kind: "local", section: "Unpublished", buildId: 3, base: "Unpublished-3" })],
            builds_local: listed(),
            builds_save: { kind: "written", buildId: 4, backup: null },
            builds_favourite: { kind: "written", buildId: PUBLISHED, backup: null },
            builds_unfavourite: { kind: "written", buildId: PUBLISHED, backup: null },
            builds_draft_delete: true,
            game_hero_progression: { levels: gameLevels },
        };
        mocks.command.mockReset().mockImplementation(async (name: string) => {
            if (name in answers) return answers[name];
            throw new Error(`unexpected ${name}`);
        });
        mocks.heroes
            .mockReset()
            .mockResolvedValue([
                { id: 1, items: {}, level_info: { "1": { required_gold: 0, bonus_currencies: ["EAbilityUnlocks"] } } },
            ]);
        mocks.items.mockReset().mockResolvedValue([]);
        mocks.builds.mockReset().mockResolvedValue([apiRow(PUBLISHED)]);
    });

    it("shows a stored draft's build with a Draft badge", async () => {
        const detail = await loaded({ source: "draft", id: "d1" });
        expect(detail.status).toBe("ready");
        expect(detail.build?.name).toBe("Renamed");
        expect(detail.badge).toBe("draft");
        expect(detail.canFavourite).toBe(false);
    });

    it("says an unknown draft is missing", async () => {
        expect((await loaded({ source: "draft", id: "gone" })).status).toBe("missing");
    });

    it("copies a draft of a saved build from that build's base, with the draft's changes", async () => {
        const detail = await loaded({ source: "draft", id: "d1" });
        await detail.copyAsNew();
        expect(sent("builds_save")).toEqual([
            { request: { kind: "copy", source: "Unpublished-3", build: view({ name: "builds.mine.copy_name" }) } },
        ]);
        expect(detail.copy).toEqual({ kind: "written", buildId: 4 });
    });

    it("copies a draft of a new build from its view", async () => {
        answers.builds_drafts = [stored({ kind: "new" })];
        const detail = await loaded({ source: "draft", id: "d1" });
        await detail.copyAsNew();
        expect(sent("builds_save")).toMatchObject([{ request: { kind: "copyView" } }]);
    });

    it("discards the draft by its id", async () => {
        const detail = await loaded({ source: "draft", id: "d1" });
        await detail.discardDraft();
        expect(sent("builds_draft_delete")).toEqual([{ id: "d1" }]);
    });

    it("takes the hero's levels from the game files before the Deadlock API", async () => {
        const detail = await loaded({ source: "draft", id: "d1" });
        await vi.waitFor(() => expect(detail.kit).not.toBeNull());
        expect(detail.kit!.levels.map((l) => l.souls)).toEqual([0, 321]);
    });

    it("still reads the hero's kit when the game's level table answers null", async () => {
        answers.game_hero_progression = null;
        const detail = await loaded({ source: "draft", id: "d1" });
        await vi.waitFor(() => expect(detail.kit).not.toBeNull());
        expect(detail.kit!.failed).toBeUndefined();
        expect(detail.kit!.levels.map((l) => l.souls)).toEqual([0]);
    });

    it("marks the kit failed, not loading, when the hero's abilities cannot be read, and reads it again on retry", async () => {
        mocks.items.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        const detail = await loaded({ source: "draft", id: "d1" });
        await vi.waitFor(() => expect(detail.kit?.failed).toBeDefined());
        expect(detail.kit!.abilities.size).toBe(0);
        detail.kit!.failed!.retry();
        expect(detail.kit).toBeNull();
        await vi.waitFor(() => expect(detail.kit).not.toBeNull());
        expect(detail.kit!.failed).toBeUndefined();
    });

    it("favourites a public build by its view, then unfavourites it by id", async () => {
        const detail = await loaded({ source: "public", id: PUBLISHED });
        expect(detail.badge).toBeNull();
        expect(detail.canFavourite).toBe(true);
        expect(detail.favourited).toBe(false);

        await detail.toggleFavourite();
        expect(sent("builds_favourite")).toEqual([{ base: null, id: null, view: detail.build }]);
        expect(detail.favourited).toBe(true);

        await detail.toggleFavourite();
        expect(sent("builds_unfavourite")).toEqual([{ id: PUBLISHED }]);
        expect(detail.favourited).toBe(false);
    });

    it("knows a public build the file already holds as a favourite", async () => {
        answers.builds_local = listed([local("Favorites", PUBLISHED)]);
        expect((await loaded({ source: "public", id: PUBLISHED })).favourited).toBe(true);
    });

    it("says a queued favourite saves when the game closes and leaves it unfavourited", async () => {
        answers.builds_favourite = { kind: "queued", id: "q", buildId: PUBLISHED };
        const detail = await loaded({ source: "public", id: PUBLISHED });
        await detail.toggleFavourite();
        expect(detail.favourite).toEqual({ kind: "queued" });
        expect(detail.favourited).toBe(false);
    });

    it("favourites a local published build from its base, and offers no favourite for a local-only build", async () => {
        answers.builds_local = listed([local("SavedLastUsed", 402117), local("Unpublished", 3)]);
        const published = await loaded({ source: "local", id: 402117 });
        expect(published.canFavourite).toBe(true);
        await published.toggleFavourite();
        expect(sent("builds_favourite")).toEqual([{ base: "SavedLastUsed-402117", id: null, view: null }]);
        expect((await loaded({ source: "local", id: 3 })).canFavourite).toBe(false);
    });
});
