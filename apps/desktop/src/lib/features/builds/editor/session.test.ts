import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), listen: vi.fn(), fileSrc: (p: string) => p }));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("$lib/core/i18n.svelte", () => ({ i18n: { locale: "en" }, t: (key: string) => key }));
vi.mock("$lib/core/errors", () => ({ failureText: (_e: unknown, fallback: string) => fallback }));
vi.mock("$lib/features/gamedata/gamedata", () => ({ loadAbilityArt: vi.fn(), loadItemArt: vi.fn() }));
vi.mock("$lib/features/heroes/heroes", () => ({ loadHeroes: vi.fn() }));
vi.mock("$lib/features/match-history/names", () => ({ playerNames: { resolve: vi.fn() } }));

import {
    draftOf,
    flushOutcome,
    nextSelection,
    saveRequest,
    savedOrigin,
    selectionSurvives,
    type EditOrigin,
} from "./session";

function cat(ids: number[]): ModCategoryView {
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
        width: 340,
        height: 162.75,
        optional: false,
    };
}

function build(categories: ModCategoryView[] = [], heroBuildId = 5): BuildView {
    return {
        heroBuildId,
        heroId: 7,
        authorAccountId: 1,
        lastUpdatedTimestamp: null,
        name: "B",
        description: "",
        language: 0,
        version: 1,
        originBuildId: null,
        modCategories: categories,
        abilityOrder: [],
        tags: [],
        developmentBuild: false,
        publishTimestamp: null,
        favorited: false,
    };
}

const LOCAL: EditOrigin = { kind: "local", section: "SavedLastUsed", base: "ab", buildId: 5 };

describe("saveRequest", () => {
    it("maps each origin to its request", () => {
        const b = build();
        expect(saveRequest({ kind: "new" }, b)).toEqual({ kind: "new", build: b });
        expect(saveRequest({ kind: "copyView" }, b)).toEqual({ kind: "copyView", build: b });
        expect(saveRequest(LOCAL, b)).toEqual({ kind: "edit", section: "SavedLastUsed", base: "ab", build: b });
    });
});

describe("draftOf", () => {
    it("stores a draft under its id with the origin as its source", () => {
        const b = build([], 2001);
        expect(draftOf(undefined, { kind: "new" }, b, 1700)).toEqual({
            id: "",
            updatedAt: 1700,
            heroId: 7,
            source: { kind: "new" },
            build: b,
        });
        expect(draftOf("d1", LOCAL, b, 1).source).toEqual({
            kind: "local",
            section: "SavedLastUsed",
            buildId: 5,
            base: "ab",
        });
        expect(draftOf("d1", { kind: "copyView" }, b, 1).source).toEqual({ kind: "public", buildId: 2001 });
    });
});

describe("savedOrigin", () => {
    const entry = (section: LocalBuild["section"], id: number, base: string): LocalBuild => ({
        section,
        build: build([], id),
        base,
        warnings: [],
    });

    it("becomes a local edit of the written build", () => {
        const local = [entry("Favorites", 9, "fav"), entry("Unpublished", 9, "new")];
        expect(savedOrigin({ kind: "new" }, 9, local)).toEqual({
            kind: "local",
            section: "Unpublished",
            base: "new",
            buildId: 9,
        });
    });

    it("keeps the section it edited", () => {
        const local = [entry("Unpublished", 5, "other"), entry("SavedLastUsed", 5, "fresh")];
        expect(savedOrigin(LOCAL, 5, local)).toEqual({ ...LOCAL, base: "fresh" });
    });

    it("stays as it was when the file does not list the build", () => {
        expect(savedOrigin({ kind: "new" }, 9, [])).toEqual({ kind: "new" });
    });
});

describe("flushOutcome", () => {
    const queued = { id: "q1", buildId: 9 };
    const conflict = (saveId: string | null) => ({
        saveId,
        id: 9,
        section: "Unpublished" as const,
        ours: null,
        game: null,
        base: null,
        gameBlob: null,
    });

    it("is saved when the flush wrote the queued build", () => {
        expect(flushOutcome({ kind: "saved", buildIds: [3, 9] }, queued)).toBe("saved");
    });

    it("is a conflict when the queued save raised one", () => {
        expect(flushOutcome({ kind: "conflict", conflicts: [conflict("q0"), conflict("q1")] }, queued)).toBe(
            "conflict",
        );
    });

    it("leaves the save queued otherwise", () => {
        expect(flushOutcome({ kind: "saved", buildIds: [3] }, queued)).toBeNull();
        expect(flushOutcome({ kind: "conflict", conflicts: [conflict("q0"), conflict(null)] }, queued)).toBeNull();
        expect(flushOutcome({ kind: "gameRunning" }, queued)).toBeNull();
        expect(flushOutcome({ kind: "failed", code: "x" }, queued)).toBeNull();
    });
});

describe("nextSelection", () => {
    const b = build([cat([1, 2, 3]), cat([4, 5])]);
    const r = (category: number, index: number) => ({ category, index });

    it("replaces", () => {
        expect(nextSelection(b, [r(0, 0)], null, [r(1, 1)], "replace")).toEqual([r(1, 1)]);
    });

    it("toggles each ref", () => {
        expect(nextSelection(b, [r(0, 0), r(0, 1)], null, [r(0, 0), r(1, 0)], "toggle")).toEqual([r(0, 1), r(1, 0)]);
    });

    it("selects the range from the anchor in document order, across categories", () => {
        expect(nextSelection(b, [r(1, 0)], r(1, 0), [r(0, 1)], "range")).toEqual([r(0, 1), r(0, 2), r(1, 0)]);
    });

    it("selects only the target for a range without an anchor", () => {
        expect(nextSelection(b, [], null, [r(0, 2)], "range")).toEqual([r(0, 2)]);
    });
});

describe("selectionSurvives", () => {
    const before = build([cat([1, 2, 3]), cat([4])]);
    const sel = [{ category: 0, index: 1 }];

    it("holds while the selected refs point at the same items", () => {
        const after = build([cat([1, 2, 3]), cat([4])]);
        after.modCategories[0]!.mods[1]!.annotation = "note";
        expect(selectionSurvives(before, after, sel)).toBe(true);
    });

    it("breaks when an item moved", () => {
        expect(selectionSurvives(before, build([cat([2, 3]), cat([4])]), sel)).toBe(false);
        expect(selectionSurvives(before, build([cat([1, 2, 3, 2]), cat([4])]), sel)).toBe(false);
        expect(selectionSurvives(before, build([cat([1, 2, 3])]), sel)).toBe(false);
    });
});
