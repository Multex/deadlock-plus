import type { BuildBackup } from "@deadlock-plus/ipc-types/BuildBackup";
import type { BuildVersionMeta } from "@deadlock-plus/ipc-types/BuildVersionMeta";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { CurrencyChangeView } from "@deadlock-plus/ipc-types/CurrencyChangeView";
import type { FlushView } from "@deadlock-plus/ipc-types/FlushView";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import type { SaveResult } from "@deadlock-plus/ipc-types/SaveResult";
import { afterEach, describe, expect, it } from "vitest";
import { install, type DemoHandle, type Scenario } from "../../scenario";
import { liveMatchScenario } from "../live-match";
import { newUserScenario } from "../new-user";
import { offlineScenario } from "../offline";
import { IDENTITY } from "./identity";
import { defaultScenario } from "./index";

const OPTIONS = { appVersion: "1.2.3", changelog: "# Changelog\n", mapItemsTsv: "" };
const API = "https://api.deadlock-api.com/v1";
const HAZE = 13;

interface PublicBuild {
    hero_build: {
        hero_id: number;
        hero_build_id: number;
        author_account_id: number;
        language: number;
        last_updated_timestamp?: number | null;
        details: { mod_categories: unknown[]; ability_order?: { currency_changes?: unknown[] | null } | null };
    };
    num_favorites?: number | null;
    num_weekly_favorites?: number | null;
}

const handles: DemoHandle[] = [];
function start(scenario: Scenario): DemoHandle {
    const handle = install(scenario);
    handles.push(handle);
    return handle;
}
afterEach(() => {
    while (handles.length) handles.pop()!.uninstall();
});

const local = (handle: DemoHandle) => handle.invoke("builds_local", {}) as LocalBuilds;
const ids = (builds: LocalBuilds) => builds.builds.map((b) => b.build.heroBuildId);
const find = (builds: LocalBuilds, id: number) => builds.builds.find((b) => b.build.heroBuildId === id);

async function publicBuilds(query: string): Promise<PublicBuild[]> {
    const response = await fetch(`${API}/builds${query}`);
    expect(response.status).toBe(200);
    return (await response.json()) as PublicBuild[];
}

/** The ability order rules the editor enforces: 4 unlocks of -1, the ultimate last, AP in 1/2/5 tiers after unlock. */
function orderProblems(order: readonly CurrencyChangeView[]): string[] {
    const problems: string[] = [];
    const unlocked: number[] = [];
    const tiers = new Map<number, number>();
    for (const step of order) {
        if (step.currencyType === 2) {
            if (step.delta !== -1) problems.push(`unlock delta ${step.delta}`);
            unlocked.push(step.abilityId);
        } else if (step.currencyType === 1) {
            if (!unlocked.includes(step.abilityId)) problems.push(`AP before unlock on ${step.abilityId}`);
            const tier = (tiers.get(step.abilityId) ?? 0) + 1;
            tiers.set(step.abilityId, tier);
            if (step.delta !== [-1, -2, -5][tier - 1]) problems.push(`tier ${tier} delta ${step.delta}`);
        } else problems.push(`currency ${step.currencyType}`);
    }
    if (unlocked.length !== 4) problems.push(`${unlocked.length} unlocks`);
    if (new Set(unlocked).size !== unlocked.length) problems.push("an ability unlocked twice");
    return problems;
}

function draft(heroId: number, name: string): BuildView {
    return {
        heroBuildId: 0,
        heroId,
        authorAccountId: 0,
        lastUpdatedTimestamp: null,
        name,
        description: "",
        language: 0,
        version: 0,
        originBuildId: null,
        modCategories: [
            {
                name: "Lane",
                description: "",
                width: 176,
                height: null,
                optional: false,
                mods: [
                    {
                        abilityId: 1548066885,
                        annotation: null,
                        requiredFlexSlots: null,
                        sellPriority: null,
                        imbueTargetAbilityId: null,
                    },
                ],
            },
        ],
        abilityOrder: [],
        tags: [],
        developmentBuild: false,
        publishTimestamp: null,
        favorited: false,
    };
}

describe("builds in the default scenario", () => {
    it("lists the player's builds in all three sections of an existing file", () => {
        const builds = local(start(defaultScenario(OPTIONS)));
        expect(builds).toMatchObject({ accountId: IDENTITY.accountId, exists: true, gameRunning: false, queue: [] });

        const section = (name: string) => builds.builds.filter((b) => b.section === name);
        const unpublished = section("Unpublished");
        expect(unpublished.length).toBeGreaterThanOrEqual(2);
        for (const b of unpublished) {
            expect(b.build.heroBuildId).toBeLessThan(1000);
            expect(b.build.authorAccountId).toBe(IDENTITY.accountId);
        }
        const favourites = section("Favorites");
        expect(
            favourites.some((b) => b.build.heroBuildId >= 1000 && b.build.authorAccountId !== IDENTITY.accountId),
        ).toBe(true);
        for (const b of favourites) expect(b.build.favorited).toBe(true);
        const lastUsed = section("SavedLastUsed");
        expect(lastUsed).toHaveLength(1);
        expect(lastUsed[0]!.build.heroBuildId).toBeGreaterThanOrEqual(1000);
        expect(lastUsed[0]!.build.authorAccountId).toBe(IDENTITY.accountId);

        expect(new Set(builds.builds.map((b) => b.build.heroId)).size).toBeGreaterThanOrEqual(2);
        const localIds = builds.builds.map((b) => b.build.heroBuildId).filter((id) => id < 1000);
        expect(builds.nextLocalId).toBe(Math.max(...localIds) + 1);
        expect(builds.lastUsed.length).toBeGreaterThan(0);
    });

    it("gives every build a hex base and an ability order the editor accepts", () => {
        const builds = local(start(defaultScenario(OPTIONS)));
        for (const b of builds.builds) {
            expect(b.base).toMatch(/^([0-9a-f]{2})+$/);
            expect(orderProblems(b.build.abilityOrder), b.build.name).toEqual([]);
            expect(b.build.modCategories.length).toBeGreaterThan(0);
        }
        expect(new Set(builds.builds.map((b) => b.base)).size).toBe(builds.builds.length);
    });

    it("writes a new build, then lists it, points the hero at it and keeps a version and a backup", () => {
        const handle = start(defaultScenario(OPTIONS));
        const before = local(handle);
        const backups = handle.invoke("builds_backups", {}) as BuildBackup[];

        const result = handle.invoke("builds_save", {
            request: { kind: "new", build: draft(HAZE, "Gun Haze") },
        }) as SaveResult;
        expect(result).toMatchObject({ kind: "written", buildId: before.nextLocalId, backup: expect.any(String) });

        const after = local(handle);
        const saved = find(after, before.nextLocalId!)!;
        expect(saved).toMatchObject({ section: "Unpublished", build: { name: "Gun Haze", version: 0, heroId: HAZE } });
        expect(saved.build.authorAccountId).toBe(IDENTITY.accountId);
        expect(after.nextLocalId).toBe(before.nextLocalId! + 1);
        expect(after.lastUsed).toContainEqual({ heroClass: "hero_haze", buildId: before.nextLocalId });

        const history = handle.invoke("builds_history", { buildId: saved.build.heroBuildId }) as BuildVersionMeta[];
        expect(history).toHaveLength(1);
        const version = handle.invoke("builds_history_get", {
            buildId: saved.build.heroBuildId,
            versionId: history[0]!.id,
        }) as BuildView;
        expect(version.name).toBe("Gun Haze");
        expect((handle.invoke("builds_backups", {}) as BuildBackup[]).length).toBe(backups.length + 1);
    });

    it("edits a build against its base, adds a version per save and reports a stale base as a conflict", () => {
        const handle = start(defaultScenario(OPTIONS));
        const draftBuild = local(handle).builds.find((b) => b.section === "Unpublished")!;
        const edit = (base: string, name: string) =>
            handle.invoke("builds_save", {
                request: { kind: "edit", section: "Unpublished", base, build: { ...draftBuild.build, name } },
            }) as SaveResult;

        expect(edit(draftBuild.base, "Renamed")).toMatchObject({
            kind: "written",
            buildId: draftBuild.build.heroBuildId,
        });
        const renamed = find(local(handle), draftBuild.build.heroBuildId)!;
        expect(renamed.build.name).toBe("Renamed");
        expect(renamed.base).not.toBe(draftBuild.base);
        expect(edit(renamed.base, "Twice")).toMatchObject({ kind: "written" });
        const history = handle.invoke("builds_history", {
            buildId: draftBuild.build.heroBuildId,
        }) as BuildVersionMeta[];
        expect(history.slice(0, 2).map((v) => v.name)).toEqual(["Twice", "Renamed"]);

        const stale = edit(draftBuild.base, "Lost");
        expect(stale).toMatchObject({ kind: "conflict" });
        if (stale.kind !== "conflict") return;
        expect(stale.conflicts[0]).toMatchObject({ id: draftBuild.build.heroBuildId, game: { name: "Twice" } });
    });

    it("writes an edit of a published favourite into SavedLastUsed, one per hero", () => {
        const handle = start(defaultScenario(OPTIONS));
        const before = local(handle);
        const fav = before.builds.find((b) => b.section === "Favorites" && b.build.heroBuildId >= 1000)!;
        const result = handle.invoke("builds_save", {
            request: { kind: "edit", section: "Favorites", base: fav.base, build: { ...fav.build, name: "My take" } },
        }) as SaveResult;
        expect(result).toMatchObject({ kind: "written", buildId: fav.build.heroBuildId });
        const after = local(handle);
        const saved = after.builds.filter((b) => b.section === "SavedLastUsed" && b.build.heroId === fav.build.heroId);
        expect(saved.map((b) => [b.build.heroBuildId, b.build.name])).toEqual([[fav.build.heroBuildId, "My take"]]);
    });

    it("copies a build as a new local one that points at its published origin", () => {
        const handle = start(defaultScenario(OPTIONS));
        const before = local(handle);
        const fav = before.builds.find((b) => b.section === "Favorites" && b.build.heroBuildId >= 1000)!;
        const result = handle.invoke("builds_save", {
            request: { kind: "copy", source: fav.base, build: { ...fav.build, name: "Copy" } },
        }) as SaveResult;
        expect(result).toMatchObject({ kind: "written", buildId: before.nextLocalId });
        expect(find(local(handle), before.nextLocalId!)!.build).toMatchObject({
            originBuildId: fav.build.heroBuildId,
            authorAccountId: IDENTITY.accountId,
            favorited: false,
        });
    });

    it("copies a public build known only as a view", async () => {
        const handle = start(defaultScenario(OPTIONS));
        const before = local(handle);
        const row = (await publicBuilds(`?hero_id=${HAZE}&limit=1`))[0]!.hero_build;
        const source = { ...draft(HAZE, "From the browser"), heroBuildId: row.hero_build_id, authorAccountId: 1 };
        const result = handle.invoke("builds_save", { request: { kind: "copyView", build: source } }) as SaveResult;
        expect(result).toMatchObject({ kind: "written", buildId: before.nextLocalId });
        expect(find(local(handle), before.nextLocalId!)!.build).toMatchObject({
            name: "From the browser",
            originBuildId: row.hero_build_id,
            authorAccountId: IDENTITY.accountId,
            version: 0,
        });
    });

    it("deletes a local build and refuses a published one", () => {
        const handle = start(defaultScenario(OPTIONS));
        const before = local(handle);
        const draftBuild = before.builds.find((b) => b.section === "Unpublished")!;
        const id = draftBuild.build.heroBuildId;
        expect(handle.invoke("builds_delete", { section: "Unpublished", id, base: draftBuild.base })).toMatchObject({
            kind: "written",
            buildId: id,
        });
        expect(ids(local(handle))).not.toContain(id);

        const published = before.builds.find((b) => b.section === "SavedLastUsed")!;
        expect(() =>
            handle.invoke("builds_delete", {
                section: "SavedLastUsed",
                id: published.build.heroBuildId,
                base: published.base,
            }),
        ).toThrow(expect.objectContaining({ code: "builds.published_delete_in_game" }));
    });

    it("favourites a local build by id and unfavourites it", () => {
        const handle = start(defaultScenario(OPTIONS));
        const draftBuild = local(handle).builds.find((b) => b.section === "Unpublished")!;
        const id = draftBuild.build.heroBuildId;
        const favourites = (builds: LocalBuilds): LocalBuild[] =>
            builds.builds.filter((b) => b.section === "Favorites" && b.build.heroBuildId === id);

        expect(handle.invoke("builds_favourite", { id })).toMatchObject({ kind: "written", buildId: id });
        expect(favourites(local(handle)).map((b) => b.build.favorited)).toEqual([true]);
        expect(handle.invoke("builds_unfavourite", { id })).toMatchObject({ kind: "written", buildId: id });
        expect(favourites(local(handle))).toEqual([]);
        expect(handle.invoke("builds_unfavourite", { id })).toEqual({ kind: "unchanged", buildId: id });
    });

    it("has nothing queued to flush while the game is closed", () => {
        const handle = start(defaultScenario(OPTIONS));
        expect(handle.invoke("builds_flush", {}) as FlushView).toEqual({ kind: "saved", buildIds: [] });
    });

    it("keeps each install's builds to itself", () => {
        const first = start(defaultScenario(OPTIONS));
        first.invoke("builds_save", { request: { kind: "new", build: draft(HAZE, "Only here") } });
        const second = start(defaultScenario(OPTIONS));
        expect(local(second).builds.map((b) => b.build.name)).not.toContain("Only here");
    });
});

describe("builds in other scenarios", () => {
    it("queues saves while the game runs and leaves the file as it was", () => {
        const handle = start(liveMatchScenario(OPTIONS));
        const before = local(handle);
        expect(before.gameRunning).toBe(true);

        const result = handle.invoke("builds_save", {
            request: { kind: "new", build: draft(HAZE, "Later") },
        }) as SaveResult;
        expect(result).toMatchObject({ kind: "queued", id: expect.any(String), buildId: before.nextLocalId });
        if (result.kind !== "queued") return;

        const after = local(handle);
        expect(ids(after)).toEqual(ids(before));
        expect(after.queue).toContainEqual(
            expect.objectContaining({ id: result.id, label: "Later", buildId: result.buildId }),
        );
        expect(after.nextLocalId).toBe(before.nextLocalId! + 1);
        expect(handle.invoke("builds_flush", {})).toEqual({ kind: "gameRunning" });

        expect(handle.invoke("builds_queue_cancel", { id: result.id })).toBe(true);
        expect(local(handle).queue.map((q) => q.id)).not.toContain(result.id);
        expect(handle.invoke("builds_queue_cancel", { id: result.id })).toBe(false);
    });

    it("has no build file for a new user", () => {
        const builds = local(start(newUserScenario(OPTIONS)));
        expect(builds).toMatchObject({ exists: false, builds: [], lastUsed: [], queue: [], nextLocalId: 1 });
    });

    it("keeps the local builds when the Deadlock API is unreachable", () => {
        const offline = local(start(offlineScenario(OPTIONS)));
        handles.pop()!.uninstall();
        const online = local(start(defaultScenario(OPTIONS)));
        expect(offline).toEqual(online);
    });
});

describe("public builds route", () => {
    it("answers builds of two or more heroes shaped as the API's rows", async () => {
        start(defaultScenario(OPTIONS));
        const all = await publicBuilds("");
        expect(all.length).toBeGreaterThanOrEqual(6);
        expect(all.length).toBeLessThanOrEqual(10);
        expect(new Set(all.map((b) => b.hero_build.hero_id)).size).toBeGreaterThanOrEqual(2);
        for (const b of all) {
            expect(b.hero_build.hero_build_id).toBeGreaterThanOrEqual(1000);
            expect(b.hero_build.details.mod_categories.length).toBeGreaterThan(0);
            expect(b.hero_build.details.ability_order?.currency_changes?.length).toBeGreaterThan(0);
        }
    });

    it("filters by hero, author and language and honours sort and limit", async () => {
        start(defaultScenario(OPTIONS));
        const haze = await publicBuilds(`?hero_id=${HAZE}`);
        expect(haze.length).toBeGreaterThan(0);
        expect(haze.every((b) => b.hero_build.hero_id === HAZE)).toBe(true);

        const own = await publicBuilds(`?author_id=${IDENTITY.accountId}`);
        expect(own).toHaveLength(1);
        const lastUsed = local(handles[0]!).builds.find((b) => b.section === "SavedLastUsed")!;
        expect(own[0]!.hero_build.hero_build_id).toBe(lastUsed.build.heroBuildId);

        const english = await publicBuilds("?build_language=English");
        const all = await publicBuilds("");
        expect(english.length).toBeGreaterThan(0);
        expect(english.length).toBeLessThan(all.length);
        expect(english.every((b) => b.hero_build.language === 0)).toBe(true);

        const weekly = (await publicBuilds("?sort_by=weekly_favorites")).map((b) => b.num_weekly_favorites ?? 0);
        expect(weekly).toEqual([...weekly].sort((a, b) => b - a));
        const updated = (await publicBuilds("?sort_by=updated_at&sort_direction=asc")).map(
            (b) => b.hero_build.last_updated_timestamp ?? 0,
        );
        expect(updated).toEqual([...updated].sort((a, b) => a - b));
        expect(await publicBuilds("?limit=2")).toHaveLength(2);
    });

    it("fails like every other Deadlock API path when offline", async () => {
        start(offlineScenario(OPTIONS));
        await expect(fetch(`${API}/builds?hero_id=${HAZE}`)).rejects.toThrow("Failed to fetch");
    });
});
