import type { Build } from "@deadlock-plus/deadlock-api";
import type { BuildSection } from "@deadlock-plus/ipc-types/BuildSection";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ConflictView } from "@deadlock-plus/ipc-types/ConflictView";
import type { FlushView } from "@deadlock-plus/ipc-types/FlushView";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import type { QueuedSaveView } from "@deadlock-plus/ipc-types/QueuedSaveView";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    builds: vi.fn(),
    buildsLocal: vi.fn(),
    buildsFlush: vi.fn(),
    buildsDelete: vi.fn(),
    buildsQueueResolve: vi.fn(),
    onFlushed: vi.fn(),
}));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: { builds: mocks.builds } }));
vi.mock("./api", () => ({
    buildsLocal: mocks.buildsLocal,
    buildsFlush: mocks.buildsFlush,
    buildsDelete: mocks.buildsDelete,
    buildsQueueResolve: mocks.buildsQueueResolve,
    onFlushed: mocks.onFlushed,
    buildsSave: vi.fn(),
    buildsFavourite: vi.fn(),
    buildsUnfavourite: vi.fn(),
    buildsQueueCancel: vi.fn(),
}));

import { MyBuildsStore } from "./my-builds.svelte";

import {
    canDelete,
    conflictSides,
    conflictsOf,
    copyRequest,
    deleteTargets,
    favouriteAction,
    flushFailure,
    mergeMine,
    noDrafts,
    openHref,
    viewOfPublished,
    waitingCount,
    type Draft,
    type MineInput,
    type MineRow,
} from "./my-builds";

const ME = 4242;
const OTHER = 777;

function view(over: Partial<BuildView> = {}): BuildView {
    return {
        heroBuildId: 3,
        heroId: 1,
        authorAccountId: ME,
        lastUpdatedTimestamp: 100,
        name: "Build",
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
        ...over,
    };
}

function local(section: BuildSection, over: Partial<BuildView> = {}): LocalBuild {
    const build = view(over);
    return { section, build, base: `${section}-${build.heroBuildId}`, warnings: [] };
}

function api(over: Partial<Build["hero_build"]> = {}): Build {
    return {
        hero_build: {
            hero_id: 1,
            hero_build_id: 5000,
            author_account_id: ME,
            name: "Published",
            language: 0,
            version: 2,
            origin_build_id: 0,
            details: { mod_categories: [] },
            last_updated_timestamp: 50,
            publish_timestamp: 40,
            tags: [],
            ...over,
        },
    };
}

function queued(buildId: number, over: Partial<QueuedSaveView> = {}): QueuedSaveView {
    return { id: `q-${buildId}`, queuedAt: 200, label: "Queued", buildId, ...over };
}

function input(over: Partial<MineInput>): MineInput {
    return { accountId: ME, local: [], queue: [], published: [], drafts: [], ...over };
}

function rows(over: Partial<MineInput>): MineRow[] {
    return mergeMine(input(over)).flatMap((g) => g.rows);
}

function only(over: Partial<MineInput>): MineRow {
    const all = rows(over);
    expect(all).toHaveLength(1);
    return all[0]!;
}

describe("mergeMine status", () => {
    it("shows an Unpublished build as in game", () => {
        const row = only({ local: [local("Unpublished")] });
        expect(row.status).toBe("inGame");
        expect(row.published).toBe(false);
        expect(row.favorited).toBe(false);
    });

    it("shows an own local build kept only in Favorites as in game and favourited", () => {
        const row = only({ local: [local("Favorites", { heroBuildId: 8, favorited: true })] });
        expect(row).toMatchObject({ status: "inGame", favorited: true, published: false, buildId: 8 });
    });

    it("leaves out other players' favourites and last-used builds", () => {
        expect(
            rows({
                local: [
                    local("Favorites", { heroBuildId: 6000, authorAccountId: OTHER }),
                    local("SavedLastUsed", { heroBuildId: 6001, authorAccountId: OTHER }),
                ],
            }),
        ).toEqual([]);
    });

    it("shows an own build from the API as published", () => {
        const row = only({ published: [api()] });
        expect(row).toMatchObject({ status: "published", published: true, edited: false, buildId: 5000 });
    });

    it("ignores API rows by another author", () => {
        expect(rows({ published: [api({ author_account_id: OTHER })] })).toEqual([]);
    });

    it("marks a published build with an own SavedLastUsed entry as edited", () => {
        const row = only({
            published: [api()],
            local: [local("SavedLastUsed", { heroBuildId: 5000, name: "Published, edited" })],
        });
        expect(row).toMatchObject({ status: "published", edited: true, name: "Published, edited" });
    });

    it("still shows own published builds the file knows when the API has none", () => {
        const favourite = only({ local: [local("Favorites", { heroBuildId: 5000, favorited: true })] });
        expect(favourite).toMatchObject({ status: "published", published: true, favorited: true, edited: false });
        const lastUsed = only({ local: [local("SavedLastUsed", { heroBuildId: 5001 })] });
        expect(lastUsed).toMatchObject({ status: "published", edited: true });
    });

    it("shows any build with a queued save as waiting for the game to close", () => {
        expect(only({ local: [local("Unpublished")], queue: [queued(3)] }).status).toBe("waiting");
        expect(only({ published: [api()], queue: [queued(5000)] })).toMatchObject({
            status: "waiting",
            published: true,
        });
    });

    it("shows a queued new build on its own row under no hero", () => {
        const groups = mergeMine(input({ queue: [queued(9, { label: "Fresh build" })] }));
        expect(groups).toHaveLength(1);
        expect(groups[0]!.heroId).toBeNull();
        expect(groups[0]!.rows[0]).toMatchObject({ status: "waiting", name: "Fresh build", buildId: 9 });
    });

    it("ignores a queued save of another player's build", () => {
        expect(rows({ queue: [queued(6000)] })).toEqual([]);
    });

    it("shows a draft with no saved build as a draft", () => {
        const draft: Draft = { id: "d1", heroId: 2, name: "Idea", updatedAt: 300, buildId: null };
        expect(only({ drafts: [draft] })).toMatchObject({ status: "draft", heroId: 2, buildId: null, draft });
    });

    it("attaches a draft of a saved build to that build's row", () => {
        const draft: Draft = { id: "d1", heroId: 1, name: "Idea", updatedAt: 300, buildId: 3 };
        const row = only({ local: [local("Unpublished")], drafts: [draft] });
        expect(row).toMatchObject({ status: "inGame", draft });
    });

    it("has no drafts from the placeholder source", async () => {
        expect(await noDrafts.list()).toEqual([]);
    });
});

describe("mergeMine de-duplication", () => {
    it("shows a build in Unpublished and Favorites once", () => {
        const row = only({
            local: [local("Unpublished", { name: "Mine" }), local("Favorites", { name: "Mine", favorited: true })],
        });
        expect(row.favorited).toBe(true);
        expect(row.local.map((l) => l.section)).toEqual(["Unpublished", "Favorites"]);
    });

    it("shows a published build from the API, Favorites and SavedLastUsed once", () => {
        const row = only({
            published: [api()],
            local: [
                local("Favorites", { heroBuildId: 5000, favorited: true }),
                local("SavedLastUsed", { heroBuildId: 5000 }),
            ],
            queue: [queued(5000, { id: "a" }), queued(5000, { id: "b" })],
        });
        expect(row).toMatchObject({ status: "waiting", published: true, favorited: true, edited: true });
        expect(row.queue.map((q) => q.id)).toEqual(["a", "b"]);
        expect(row.api).not.toBeNull();
    });

    it("keeps the newest version when the API lists one build twice", () => {
        const row = only({ published: [api({ version: 2, name: "Old" }), api({ version: 3, name: "New" })] });
        expect(row.name).toBe("New");
    });
});

describe("mergeMine grouping", () => {
    it("groups by hero, newest activity first, rows newest first, unknown hero last", () => {
        const groups = mergeMine(
            input({
                local: [
                    local("Unpublished", { heroBuildId: 1, heroId: 1, lastUpdatedTimestamp: 10 }),
                    local("Unpublished", { heroBuildId: 2, heroId: 6, lastUpdatedTimestamp: 30 }),
                    local("Unpublished", { heroBuildId: 4, heroId: 1, lastUpdatedTimestamp: 40 }),
                ],
                queue: [queued(9, { queuedAt: 999 })],
                published: [api({ hero_id: 6, last_updated_timestamp: 20 })],
            }),
        );
        expect(groups.map((g) => g.heroId)).toEqual([1, 6, null]);
        expect(groups[0]!.rows.map((r) => r.buildId)).toEqual([4, 1]);
        expect(groups[1]!.rows.map((r) => r.buildId)).toEqual([2, 5000]);
    });

    it("sorts rows that share a time by name", () => {
        const groups = mergeMine(
            input({
                local: [
                    local("Unpublished", { heroBuildId: 1, name: "b" }),
                    local("Unpublished", { heroBuildId: 2, name: "a" }),
                ],
            }),
        );
        expect(groups[0]!.rows.map((r) => r.name)).toEqual(["a", "b"]);
    });

    it("takes the newest time of every source as the row's update time", () => {
        const row = only({ local: [local("Unpublished", { lastUpdatedTimestamp: 100 })], queue: [queued(3)] });
        expect(row.updatedAt).toBe(200);
    });
});

describe("row actions", () => {
    it("opens local builds from the file, API-only builds as public, drafts as drafts", () => {
        expect(openHref(only({ local: [local("Unpublished")] }))).toBe("/builds/view?source=local&id=3");
        expect(openHref(only({ published: [api()] }))).toBe("/builds/view?source=public&id=5000");
        expect(openHref(only({ drafts: [{ id: "d 1", heroId: 1, name: "x", updatedAt: 1, buildId: null }] }))).toBe(
            "/builds/view?source=draft&id=d%201",
        );
        expect(openHref(only({ queue: [queued(9)] }))).toBeNull();
    });

    it("deletes every local entry of an unpublished build and never a published one", () => {
        const both = only({ local: [local("Unpublished"), local("Favorites", { favorited: true })] });
        expect(canDelete(both)).toBe(true);
        expect(deleteTargets(both).map((l) => l.section)).toEqual(["Unpublished", "Favorites"]);
        const published = only({ published: [api()], local: [local("SavedLastUsed", { heroBuildId: 5000 })] });
        expect(canDelete(published)).toBe(false);
        expect(deleteTargets(published)).toEqual([]);
        expect(canDelete(only({ queue: [queued(9)] }))).toBe(false);
    });

    it("favourites from the file by id, unfavourites a favourite, and cannot favourite an API-only build", () => {
        expect(favouriteAction(only({ local: [local("Unpublished")] }))).toEqual({ kind: "favourite", id: 3 });
        expect(favouriteAction(only({ local: [local("Favorites", { favorited: true })] }))).toEqual({
            kind: "unfavourite",
            id: 3,
        });
        expect(favouriteAction(only({ published: [api()] }))).toBeNull();
        expect(favouriteAction(only({ queue: [queued(9)] }))).toBeNull();
    });

    it("copies a file build from its blob and an API-only build from its view", () => {
        const fromFile = copyRequest(only({ local: [local("Favorites"), local("Unpublished")] }), "Copy");
        expect(fromFile).toMatchObject({ kind: "copy", source: "Unpublished-3", build: { name: "Copy" } });
        const fromApi = copyRequest(only({ published: [api()] }), "Copy");
        expect(fromApi).toMatchObject({ kind: "copyView", build: { heroBuildId: 5000, name: "Copy" } });
        expect(copyRequest(only({ queue: [queued(9)] }), "Copy")).toBeNull();
    });

    it("copies a published build with its local edits", () => {
        const row = only({ published: [api()], local: [local("SavedLastUsed", { heroBuildId: 5000, version: 7 })] });
        expect(copyRequest(row, "Copy")).toMatchObject({ kind: "copy", source: "SavedLastUsed-5000" });
    });

    it("turns an API build into the app's build view", () => {
        const built = viewOfPublished(
            api({
                description: null,
                details: {
                    ability_order: { currency_changes: [{ ability_id: 9, currency_type: 2, delta: -1 }] },
                    mod_categories: [{ name: "Early", mods: [{ ability_id: 11 }] }],
                },
                tags: undefined,
            }),
        );
        expect(built).toMatchObject({
            heroBuildId: 5000,
            heroId: 1,
            authorAccountId: ME,
            description: "",
            originBuildId: null,
            tags: [],
            favorited: false,
            abilityOrder: [{ abilityId: 9, currencyType: 2, delta: -1, annotation: null }],
            modCategories: [
                {
                    name: "Early",
                    description: "",
                    width: null,
                    height: null,
                    optional: false,
                    mods: [
                        {
                            abilityId: 11,
                            annotation: null,
                            requiredFlexSlots: null,
                            sellPriority: null,
                            imbueTargetAbilityId: null,
                        },
                    ],
                },
            ],
        });
    });

    it("counts the builds waiting in the queue, not the saves", () => {
        expect(waitingCount([queued(3, { id: "a" }), queued(3, { id: "b" }), queued(4)])).toBe(2);
    });
});

describe("conflict flow", () => {
    function conflict(over: Partial<ConflictView> = {}): ConflictView {
        return {
            saveId: "q-3",
            id: 3,
            section: "Unpublished",
            ours: view({ name: "Mine", lastUpdatedTimestamp: 300 }),
            game: view({ name: "Game's", lastUpdatedTimestamp: 250 }),
            base: view(),
            gameBlob: "ff",
            ...over,
        };
    }

    it("takes only the conflicts a queued save raised from a flush", () => {
        const fromQueue = conflict();
        expect(conflictsOf({ kind: "conflict", conflicts: [fromQueue, conflict({ saveId: null })] })).toEqual([
            fromQueue,
        ]);
        expect(conflictsOf({ kind: "saved", buildIds: [3] })).toEqual([]);
        expect(conflictsOf({ kind: "gameRunning" })).toEqual([]);
        expect(conflictsOf({ kind: "failed", code: "builds.bad_file" })).toEqual([]);
    });

    it("describes both versions, with a missing side as deleted", () => {
        expect(conflictSides(conflict())).toEqual({
            ours: { name: "Mine", updatedAt: 300, deleted: false },
            game: { name: "Game's", updatedAt: 250, deleted: false },
        });
        expect(conflictSides(conflict({ ours: null })).ours).toEqual({
            name: "Game's",
            updatedAt: null,
            deleted: true,
        });
        expect(conflictSides(conflict({ game: null })).game).toEqual({ name: "Mine", updatedAt: null, deleted: true });
    });

    it("reports a failed flush by its code only", () => {
        expect(flushFailure({ kind: "failed", code: "builds.bad_file" })).toEqual({ code: "builds.bad_file" });
        expect(flushFailure({ kind: "saved", buildIds: [] })).toBeNull();
    });
});

describe("MyBuildsStore", () => {
    function file(over: Partial<LocalBuilds> = {}): LocalBuilds {
        return {
            accountId: ME,
            exists: true,
            gameRunning: false,
            builds: [local("Unpublished")],
            lastUsed: [],
            queue: [],
            nextLocalId: 4,
            ...over,
        };
    }

    function conflict(): ConflictView {
        return { saveId: "q-3", id: 3, section: "Unpublished", ours: null, game: view(), base: view(), gameBlob: null };
    }

    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    beforeEach(() => {
        for (const fn of Object.values(mocks)) fn.mockReset();
        mocks.buildsLocal.mockResolvedValue(file());
        mocks.builds.mockResolvedValue([api()]);
        mocks.onFlushed.mockResolvedValue(() => {});
    });

    it("merges the file with the player's own published builds", async () => {
        const store = new MyBuildsStore();
        await store.refresh();
        expect(mocks.builds).toHaveBeenCalledWith({ authorId: ME, onlyLatest: true });
        expect(store.groups.flatMap((g) => g.rows).map((r) => r.buildId)).toEqual([3, 5000]);
        expect(store.loading).toBe(false);
        expect(store.publishedFailed).toBe(false);
    });

    it("keeps the file's builds when the API fails", async () => {
        mocks.builds.mockRejectedValue(new Error("down"));
        const store = new MyBuildsStore();
        await store.refresh();
        expect(store.publishedFailed).toBe(true);
        expect(store.groups.flatMap((g) => g.rows).map((r) => r.buildId)).toEqual([3]);
    });

    it("shows a flush's conflict and reloads", async () => {
        let handler: ((view: FlushView) => void) | undefined;
        mocks.onFlushed.mockImplementation(async (fn: (view: FlushView) => void) => {
            handler = fn;
            return () => {};
        });
        const store = new MyBuildsStore();
        store.start();
        await settle();
        mocks.buildsLocal.mockClear();
        handler!({ kind: "conflict", conflicts: [conflict()] });
        await settle();
        expect(store.conflicts).toEqual([conflict()]);
        expect(mocks.buildsLocal).toHaveBeenCalledTimes(1);
    });

    it("flushes saves left with the game closed once, not on every reload", async () => {
        mocks.buildsLocal.mockResolvedValue(file({ queue: [queued(3)] }));
        mocks.buildsFlush.mockResolvedValue({ kind: "conflict", conflicts: [conflict()] });
        const store = new MyBuildsStore();
        await store.refresh();
        await settle();
        await store.refresh();
        await settle();
        expect(mocks.buildsFlush).toHaveBeenCalledTimes(1);
        expect(store.conflicts).toHaveLength(1);
    });

    it("stops deleting at the first conflict", async () => {
        mocks.buildsLocal.mockResolvedValue(file({ builds: [local("Unpublished"), local("Favorites")] }));
        mocks.buildsDelete.mockResolvedValue({ kind: "conflict", conflicts: [{ ...conflict(), saveId: null }] });
        const store = new MyBuildsStore();
        await store.refresh();
        const row = store.groups[0]!.rows.find((r) => r.buildId === 3)!;
        expect(await store.delete(row)).toBe("conflict");
        expect(mocks.buildsDelete).toHaveBeenCalledTimes(1);
        expect(mocks.buildsDelete).toHaveBeenCalledWith("Unpublished", 3, "Unpublished-3");
    });

    it("resolves a conflict by its queued save and shows what the flush answered", async () => {
        mocks.buildsQueueResolve.mockResolvedValue({ kind: "saved", buildIds: [3] });
        const store = new MyBuildsStore();
        store.conflicts = [conflict()];
        await store.resolve(conflict(), "ours");
        expect(mocks.buildsQueueResolve).toHaveBeenCalledWith("q-3", "ours");
        expect(store.conflicts).toEqual([]);
    });
});
