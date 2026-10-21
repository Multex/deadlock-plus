import type { Build } from "@deadlock-plus/deadlock-api";
import type { BuildSection } from "@deadlock-plus/ipc-types/BuildSection";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ConflictView } from "@deadlock-plus/ipc-types/ConflictView";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import type { FlushView } from "@deadlock-plus/ipc-types/FlushView";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import type { QueuedSaveView } from "@deadlock-plus/ipc-types/QueuedSaveView";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    builds: vi.fn(),
    winRatesLoad: vi.fn(),
    buildsLocal: vi.fn(),
    buildsFlush: vi.fn(),
    buildsDelete: vi.fn(),
    buildsQueueResolve: vi.fn(),
    buildsFavourite: vi.fn(),
    buildsDrafts: vi.fn(),
    buildsDraftDelete: vi.fn(),
    buildsUnfavourite: vi.fn(),
    onFlushed: vi.fn(),
    resolveNames: vi.fn(),
}));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: { builds: mocks.builds } }));
vi.mock("./public-builds", () => ({ buildWinRates: { load: mocks.winRatesLoad } }));
vi.mock("./api", () => ({
    buildsLocal: mocks.buildsLocal,
    buildsFlush: mocks.buildsFlush,
    buildsDelete: mocks.buildsDelete,
    buildsQueueResolve: mocks.buildsQueueResolve,
    onFlushed: mocks.onFlushed,
    buildsFavourite: mocks.buildsFavourite,
    buildsDrafts: mocks.buildsDrafts,
    buildsDraftDelete: mocks.buildsDraftDelete,
    buildsSave: vi.fn(),
    buildsUnfavourite: mocks.buildsUnfavourite,
    buildsQueueCancel: vi.fn(),
}));
vi.mock("$lib/features/match-history/names", () => ({ playerNames: { resolve: mocks.resolveNames } }));

import { MyBuildsStore } from "./my-builds.svelte";

import {
    canDelete,
    conflictSides,
    conflictsOf,
    copyRequest,
    deleteTargets,
    favouriteAction,
    favouriteViewHref,
    DEFAULT_MINE_FILTERS,
    filterFavourites,
    filterMine,
    mineFiltered,
    mineFiltersFromParams,
    mineFiltersToParams,
    flushFailure,
    foreignFavourites,
    mergeMine,
    openHref,
    statsHeroes,
    toDraft,
    viewOfPublished,
    waitingCount,
    type Draft,
    type MineInput,
    type MineFilters,
    type MineRow,
    type MineSort,
    type MineStatusFilter,
} from "./my-builds";
import type { WinRate } from "./public-builds";

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

function draftRow(over: Partial<Draft> = {}): Draft {
    const heroId = over.heroId ?? 1;
    return {
        id: "d1",
        heroId,
        name: "Idea",
        updatedAt: 300,
        buildId: null,
        build: view({ heroBuildId: 0, heroId, name: "Idea" }),
        ...over,
    };
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

describe("foreignFavourites", () => {
    it("lists other players' favourites with their hero, author and version, newest first", () => {
        const favourites = foreignFavourites(ME, [
            local("Favorites", {
                heroBuildId: 6000,
                heroId: 13,
                authorAccountId: OTHER,
                name: "Old",
                version: 4,
                lastUpdatedTimestamp: 10,
            }),
            local("Favorites", {
                heroBuildId: 6001,
                heroId: 2,
                authorAccountId: OTHER + 1,
                name: "New",
                version: 9,
                lastUpdatedTimestamp: 20,
            }),
        ]);
        expect(favourites).toMatchObject([
            {
                key: "favourite:6001",
                buildId: 6001,
                heroId: 2,
                name: "New",
                authorAccountId: OTHER + 1,
                version: 9,
                updatedAt: 20,
                build: { heroBuildId: 6001, name: "New" },
            },
            {
                key: "favourite:6000",
                buildId: 6000,
                heroId: 13,
                name: "Old",
                authorAccountId: OTHER,
                version: 4,
                updatedAt: 10,
                build: { heroBuildId: 6000, name: "Old" },
            },
        ]);
    });

    it("leaves out own favourites and other players' builds outside Favorites", () => {
        expect(
            foreignFavourites(ME, [
                local("Favorites", { heroBuildId: 5000 }),
                local("Favorites", { heroBuildId: 8 }),
                local("SavedLastUsed", { heroBuildId: 6001, authorAccountId: OTHER }),
                local("Unpublished", { heroBuildId: 9, authorAccountId: OTHER }),
            ]),
        ).toEqual([]);
    });

    it("puts every Favorites entry in My builds or in Favourites, never both", () => {
        const entries = [
            local("Favorites", { heroBuildId: 5000 }),
            local("Favorites", { heroBuildId: 8 }),
            local("Favorites", { heroBuildId: 6000, authorAccountId: OTHER }),
        ];
        const mine = rows({ local: entries }).map((r) => r.buildId);
        const theirs = foreignFavourites(ME, entries).map((f) => f.buildId);
        expect([...mine, ...theirs].sort()).toEqual([5000, 6000, 8]);
        expect(theirs).toEqual([6000]);
    });

    it("opens a favourite's view page from the file", () => {
        const [favourite] = foreignFavourites(ME, [local("Favorites", { heroBuildId: 6000, authorAccountId: OTHER })]);
        expect(favouriteViewHref(favourite!)).toBe("/builds/view?source=local&id=6000");
    });
});

describe("mergeMine status", () => {
    it("shows an Unpublished build as local", () => {
        const row = only({ local: [local("Unpublished")] });
        expect(row.status).toBe("local");
        expect(row.waiting).toBe(false);
        expect(row.published).toBe(false);
        expect(row.favorited).toBe(false);
    });

    it("shows an own local build kept only in Favorites as local and favourited", () => {
        const row = only({ local: [local("Favorites", { heroBuildId: 8, favorited: true })] });
        expect(row).toMatchObject({ status: "local", favorited: true, published: false, buildId: 8 });
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

    it("shows an own build from the API as public", () => {
        const row = only({ published: [api()] });
        expect(row).toMatchObject({ status: "public", published: true, edited: false, buildId: 5000 });
    });

    it("keeps a local copy of a published build local, though the copy keeps its source's publish time", () => {
        const row = only({ local: [local("Unpublished", { heroBuildId: 7, publishTimestamp: 40 })] });
        expect(row).toMatchObject({ status: "local", published: false });
    });

    it("ignores API rows by another author", () => {
        expect(rows({ published: [api({ author_account_id: OTHER })] })).toEqual([]);
    });

    it("marks a published build with an own SavedLastUsed entry as edited", () => {
        const row = only({
            published: [api()],
            local: [local("SavedLastUsed", { heroBuildId: 5000, name: "Published, edited" })],
        });
        expect(row).toMatchObject({ status: "public", edited: true, name: "Published, edited" });
    });

    it("still shows own published builds the file knows when the API has none", () => {
        const favourite = only({ local: [local("Favorites", { heroBuildId: 5000, favorited: true })] });
        expect(favourite).toMatchObject({ status: "public", published: true, favorited: true, edited: false });
        const lastUsed = only({ local: [local("SavedLastUsed", { heroBuildId: 5001 })] });
        expect(lastUsed).toMatchObject({ status: "public", edited: true });
    });

    it("marks any build with a queued save as waiting for the game to close, beside Public or Local", () => {
        expect(only({ local: [local("Unpublished")], queue: [queued(3)] })).toMatchObject({
            status: "local",
            waiting: true,
        });
        expect(only({ published: [api()], queue: [queued(5000)] })).toMatchObject({
            status: "public",
            waiting: true,
            published: true,
        });
    });

    it("shows a queued new build on its own row under no hero", () => {
        const groups = mergeMine(input({ queue: [queued(9, { label: "Fresh build" })] }));
        expect(groups).toHaveLength(1);
        expect(groups[0]!.heroId).toBeNull();
        expect(groups[0]!.rows[0]).toMatchObject({ status: "local", waiting: true, name: "Fresh build", buildId: 9 });
    });

    it("ignores a queued save of another player's build", () => {
        expect(rows({ queue: [queued(6000)] })).toEqual([]);
    });

    it("shows a draft with no saved build as a draft", () => {
        const draft = draftRow({ heroId: 2, buildId: null });
        expect(only({ drafts: [draft] })).toMatchObject({
            status: "draft",
            waiting: false,
            heroId: 2,
            buildId: null,
            draft,
        });
    });

    it("shows a draft of a saved build on its own draft row, beside the build it edits", () => {
        const draft = draftRow({ buildId: 3 });
        const all = rows({ local: [local("Unpublished", { name: "Saved" })], drafts: [draft] });
        expect(all).toHaveLength(2);
        expect(all[0]).toMatchObject({ key: "draft:d1", status: "draft", buildId: null, draftOf: "Saved", draft });
        expect(all[1]).toMatchObject({ buildId: 3, status: "local", draft: null, draftOf: null });
    });

    it("names no saved build for a draft of a build that is not the player's", () => {
        const draft = draftRow({ buildId: 381204 });
        expect(only({ drafts: [draft] })).toMatchObject({ status: "draft", draftOf: null });
    });

    it("reads a stored draft's name, hero, time and the build it edits", () => {
        const stored = (source: DraftView["source"]): DraftView => ({
            id: "d1",
            updatedAt: 300,
            heroId: 2,
            source,
            build: view({ heroId: 2, name: "Idea" }),
        });
        expect(toDraft(stored({ kind: "new" }))).toEqual({
            id: "d1",
            heroId: 2,
            name: "Idea",
            updatedAt: 300,
            buildId: null,
            build: view({ heroId: 2, name: "Idea" }),
        });
        expect(toDraft(stored({ kind: "local", section: "Unpublished", buildId: 3, base: "ab" })).buildId).toBe(3);
        expect(toDraft(stored({ kind: "public", buildId: 381204 })).buildId).toBe(381204);
    });
});

describe("mergeMine card data", () => {
    const category = (name: string) => ({
        name,
        description: "",
        width: null,
        height: null,
        optional: false,
        mods: [],
    });

    it("previews the version the game shows: the local edit over the file's build over the published one", () => {
        const edited = only({
            published: [api({ details: { mod_categories: [{ name: "Published" }] } })],
            local: [
                local("Favorites", { heroBuildId: 5000, modCategories: [category("Favourite")] }),
                local("SavedLastUsed", { heroBuildId: 5000, modCategories: [category("Edit")] }),
            ],
        });
        expect(edited.build?.modCategories.map((c) => c.name)).toEqual(["Edit"]);
        const apiOnly = only({ published: [api({ details: { mod_categories: [{ name: "Published" }] } })] });
        expect(apiOnly.build?.modCategories.map((c) => c.name)).toEqual(["Published"]);
    });

    it("previews a draft from its own build and a queued new build not at all", () => {
        const draft = draftRow({ build: view({ modCategories: [category("Draft")] }) });
        expect(only({ drafts: [draft] }).build?.modCategories.map((c) => c.name)).toEqual(["Draft"]);
        expect(only({ queue: [queued(9)] }).build).toBeNull();
    });

    it("takes a published build's favourites and version from the API", () => {
        const row = only({ published: [{ ...api({ version: 6 }), num_favorites: 41 }] });
        expect(row).toMatchObject({ favourites: 41, version: 6 });
    });

    it("leaves favourites unknown without an API row, and a local build without a version", () => {
        const fileOnly = only({ local: [local("Favorites", { heroBuildId: 5000, version: 3 })] });
        expect(fileOnly).toMatchObject({ favourites: null, version: 3 });
        expect(only({ published: [api()] }).favourites).toBeNull();
        expect(only({ local: [local("Unpublished", { version: 2 })] })).toMatchObject({
            favourites: null,
            version: null,
        });
    });
});

describe("win rates", () => {
    it("asks only for the heroes of published builds, once each", () => {
        const groups = mergeMine(
            input({
                local: [local("Unpublished", { heroBuildId: 3, heroId: 2 })],
                published: [
                    api({ hero_build_id: 5000, hero_id: 1 }),
                    api({ hero_build_id: 5001, hero_id: 1 }),
                    api({ hero_build_id: 5002, hero_id: 6 }),
                ],
            }),
        );
        expect(statsHeroes(groups).sort()).toEqual([1, 6]);
    });
});

describe("Mine filters", () => {
    const filters = (over: Partial<MineFilters> = {}): MineFilters => ({ ...DEFAULT_MINE_FILTERS, ...over });
    const names = (list: readonly { name: string }[]) => list.map((r) => r.name);
    const all = () =>
        rows({
            local: [
                local("Unpublished", {
                    heroBuildId: 1,
                    heroId: 1,
                    name: "Haze crit",
                    lastUpdatedTimestamp: 300,
                    tags: [7],
                    language: 0,
                }),
                local("Unpublished", {
                    heroBuildId: 2,
                    heroId: 6,
                    name: "abrams tank",
                    lastUpdatedTimestamp: 250,
                    language: 8,
                    version: 9,
                }),
            ],
            published: [
                {
                    ...api({
                        hero_build_id: 5000,
                        hero_id: 1,
                        name: "Big Crit",
                        version: 7,
                        last_updated_timestamp: 200,
                        tags: [7, 9],
                    }),
                    num_favorites: 12,
                },
                {
                    ...api({ hero_build_id: 5001, hero_id: 6, name: "Zoom", version: 3, last_updated_timestamp: 50 }),
                    num_favorites: 90,
                },
            ],
            queue: [queued(1, { queuedAt: 10 })],
            drafts: [draftRow({ heroId: 1, name: "Idea", updatedAt: 150 })],
        });

    it("lists every build newest first by default", () => {
        expect(names(filterMine(all(), filters(), new Map()))).toEqual([
            "Haze crit",
            "abrams tank",
            "Big Crit",
            "Idea",
            "Zoom",
        ]);
    });

    it("keeps one hero's builds", () => {
        expect(names(filterMine(all(), filters({ hero: 6 }), new Map()))).toEqual(["abrams tank", "Zoom"]);
    });

    it("keeps builds by status, with Waiting meaning a save queued until Deadlock closes", () => {
        const by = (status: MineStatusFilter) => names(filterMine(all(), filters({ status }), new Map()));
        expect(by("public")).toEqual(["Big Crit", "Zoom"]);
        expect(by("local")).toEqual(["Haze crit", "abrams tank"]);
        expect(by("draft")).toEqual(["Idea"]);
        expect(by("waiting")).toEqual(["Haze crit"]);
    });

    it("keeps builds with a tag, in a language, or whose name holds the search in any case", () => {
        expect(names(filterMine(all(), filters({ tag: 7 }), new Map()))).toEqual(["Haze crit", "Big Crit"]);
        expect(names(filterMine(all(), filters({ language: 8 }), new Map()))).toEqual(["abrams tank"]);
        expect(names(filterMine(all(), filters({ name: " CRIT " }), new Map()))).toEqual(["Haze crit", "Big Crit"]);
    });

    it("sorts by name, favourites, win rate and version, unknown values last", () => {
        const sorted = (sort: MineSort, rates = new Map<number, WinRate>()) =>
            names(filterMine(all(), filters({ sort }), rates));
        expect(sorted("name")).toEqual(["abrams tank", "Big Crit", "Haze crit", "Idea", "Zoom"]);
        expect(sorted("favorites")).toEqual(["Zoom", "Big Crit", "Haze crit", "abrams tank", "Idea"]);
        const rates = new Map([
            [5000, { wins: 120, matches: 200 }],
            [5001, { wins: 130, matches: 200 }],
        ]);
        expect(sorted("win_rate", rates)).toEqual(["Zoom", "Big Crit", "Haze crit", "abrams tank", "Idea"]);
        expect(sorted("versions")).toEqual(["abrams tank", "Big Crit", "Zoom", "Haze crit", "Idea"]);
    });

    it("filters favourites by hero, author, tag, language and name, and ignores status", () => {
        const favourites = foreignFavourites(ME, [
            local("Favorites", {
                heroBuildId: 381204,
                heroId: 13,
                authorAccountId: OTHER,
                name: "Bullet Dance",
                lastUpdatedTimestamp: 20,
                tags: [7],
            }),
            local("Favorites", {
                heroBuildId: 381205,
                heroId: 1,
                authorAccountId: 888,
                name: "Spirit Haze",
                lastUpdatedTimestamp: 30,
                language: 8,
                version: 5,
            }),
        ]);
        const pick = (over: Partial<MineFilters>) =>
            names(filterFavourites(favourites, filters({ view: "favourites", ...over })));
        expect(pick({})).toEqual(["Spirit Haze", "Bullet Dance"]);
        expect(pick({ status: "draft" })).toEqual(["Spirit Haze", "Bullet Dance"]);
        expect(pick({ hero: 13 })).toEqual(["Bullet Dance"]);
        expect(pick({ author: 888 })).toEqual(["Spirit Haze"]);
        expect(pick({ tag: 7 })).toEqual(["Bullet Dance"]);
        expect(pick({ language: 8 })).toEqual(["Spirit Haze"]);
        expect(pick({ name: "bullet" })).toEqual(["Bullet Dance"]);
        expect(pick({ sort: "name" })).toEqual(["Bullet Dance", "Spirit Haze"]);
        expect(pick({ sort: "versions" })).toEqual(["Spirit Haze", "Bullet Dance"]);
    });

    it("reads and writes the filters through the URL, leaving the Public tab's parameters alone", () => {
        const wanted = filters({
            view: "favourites",
            hero: 6,
            status: "waiting",
            sort: "win_rate",
            tag: 7,
            language: 8,
            name: "crit",
            author: 888,
        });
        const params = mineFiltersToParams(wanted, new URLSearchParams("hero=13&sort=updated"));
        expect(params.get("hero")).toBe("13");
        expect(params.get("sort")).toBe("updated");
        expect(mineFiltersFromParams(params)).toEqual(wanted);
        expect(mineFiltersToParams(DEFAULT_MINE_FILTERS, params).toString()).toBe("hero=13&sort=updated");
    });

    it("falls back to the defaults for values it does not know", () => {
        const params = new URLSearchParams("view=x&status=gone&msort=best&mhero=-1&mlang=zz&mtag=a");
        expect(mineFiltersFromParams(params)).toEqual(DEFAULT_MINE_FILTERS);
    });

    it("counts the view and sort as no filter", () => {
        expect(mineFiltered(filters({ view: "favourites", sort: "name" }))).toBe(false);
        expect(mineFiltered(filters({ status: "draft" }))).toBe(true);
        expect(mineFiltered(filters({ name: "  " }))).toBe(false);
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
        expect(row).toMatchObject({ status: "public", waiting: true, published: true, favorited: true, edited: true });
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
        expect(openHref(only({ drafts: [draftRow({ id: "d 1", buildId: null })] }))).toBe(
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

    it("favourites from the file by id, an API-only build by its view, and unfavourites a favourite", () => {
        expect(favouriteAction(only({ local: [local("Unpublished")] }))).toEqual({ kind: "favourite", id: 3 });
        expect(favouriteAction(only({ local: [local("Favorites", { favorited: true })] }))).toEqual({
            kind: "unfavourite",
            id: 3,
        });
        expect(favouriteAction(only({ published: [api()] }))).toEqual({
            kind: "favourite",
            view: viewOfPublished(api()),
        });
        expect(favouriteAction(only({ queue: [queued(9)] }))).toBeNull();
        const draft = draftRow({ buildId: null });
        expect(favouriteAction(only({ drafts: [draft] }))).toBeNull();
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
        mocks.buildsDrafts.mockResolvedValue([]);
        mocks.resolveNames.mockResolvedValue(new Map());
        mocks.winRatesLoad.mockResolvedValue(new Map());
    });

    it("lists other players' favourites with their authors' names", async () => {
        const theirs = local("Favorites", { heroBuildId: 6000, authorAccountId: OTHER, name: "Theirs" });
        mocks.buildsLocal.mockResolvedValue(file({ builds: [local("Unpublished"), theirs] }));
        mocks.resolveNames.mockResolvedValue(new Map([[OTHER, "Brass Tack"]]));
        const store = new MyBuildsStore();
        await store.refresh();
        await settle();
        expect(store.favourites.map((f) => f.name)).toEqual(["Theirs"]);
        expect(mocks.resolveNames).toHaveBeenCalledWith([OTHER]);
        expect(store.authors.get(OTHER)).toBe("Brass Tack");
    });

    it("keeps the favourites when their authors' names cannot load", async () => {
        const theirs = local("Favorites", { heroBuildId: 6000, authorAccountId: OTHER });
        mocks.buildsLocal.mockResolvedValue(file({ builds: [theirs] }));
        mocks.resolveNames.mockRejectedValue(new Error("down"));
        const store = new MyBuildsStore();
        await store.refresh();
        await settle();
        expect(store.favourites).toHaveLength(1);
        expect(store.authors.size).toBe(0);
    });

    it("unfavourites another player's build by its id and reloads", async () => {
        const theirs = local("Favorites", { heroBuildId: 6000, authorAccountId: OTHER });
        mocks.buildsLocal.mockResolvedValue(file({ builds: [theirs] }));
        mocks.buildsUnfavourite.mockResolvedValue({ kind: "written", buildId: 6000, backup: null });
        const store = new MyBuildsStore();
        await store.refresh();
        mocks.buildsLocal.mockResolvedValue(file({ builds: [] }));
        expect(await store.unfavourite(store.favourites[0]!)).toBe("done");
        expect(mocks.buildsUnfavourite).toHaveBeenCalledWith(6000);
        expect(store.favourites).toEqual([]);
    });

    function storedDraft(): DraftView {
        return {
            id: "d1",
            updatedAt: 300,
            heroId: 1,
            source: { kind: "local", section: "Unpublished", buildId: 3, base: "Unpublished-3" },
            build: view({ name: "Idea" }),
        };
    }

    it("lists the drafts the app stored as draft rows", async () => {
        mocks.buildsDrafts.mockResolvedValue([storedDraft()]);
        const store = new MyBuildsStore();
        await store.refresh();
        const draftRow = store.groups.flatMap((g) => g.rows).find((r) => r.status === "draft");
        expect(draftRow).toMatchObject({ key: "draft:d1", name: "Idea", draftOf: "Build" });
    });

    it("discards a draft by its id and reloads", async () => {
        mocks.buildsDrafts.mockResolvedValue([storedDraft()]);
        mocks.buildsDraftDelete.mockResolvedValue(true);
        const store = new MyBuildsStore();
        await store.refresh();
        const draftRow = store.groups.flatMap((g) => g.rows).find((r) => r.status === "draft")!;
        mocks.buildsDrafts.mockResolvedValue([]);
        await store.discard(draftRow);
        expect(mocks.buildsDraftDelete).toHaveBeenCalledWith("d1");
        expect(store.groups.flatMap((g) => g.rows).some((r) => r.status === "draft")).toBe(false);
    });

    it("favourites an API-only build by its view", async () => {
        mocks.buildsFavourite.mockResolvedValue({ kind: "written", buildId: 5000, backup: null });
        const store = new MyBuildsStore();
        await store.refresh();
        const row = store.groups.flatMap((g) => g.rows).find((r) => r.buildId === 5000)!;
        expect(await store.toggleFavourite(row)).toBe("done");
        expect(mocks.buildsFavourite).toHaveBeenCalledWith({ view: viewOfPublished(api()) });
    });

    it("loads the win rates of published builds for their heroes only", async () => {
        mocks.builds.mockResolvedValue([api({ hero_id: 6 })]);
        mocks.winRatesLoad.mockResolvedValue(new Map([[5000, { wins: 120, matches: 200 }]]));
        const store = new MyBuildsStore();
        await store.refresh();
        await settle();
        expect(mocks.winRatesLoad).toHaveBeenCalledTimes(1);
        expect(mocks.winRatesLoad).toHaveBeenCalledWith(6);
        expect(store.winRates.get(5000)).toEqual({ wins: 120, matches: 200 });
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
