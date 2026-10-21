import type { BuildVersionMeta } from "@deadlock-plus/ipc-types/BuildVersionMeta";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { describe, expect, it } from "vitest";
import { ageOf, historyBuildId, itemCount, restoredBuild, versionRows } from "./history-versions";

function cat(ids: number[]): ModCategoryView {
    return {
        name: "Cat",
        description: "",
        width: null,
        height: null,
        optional: false,
        mods: ids.map((abilityId) => ({
            abilityId,
            annotation: null,
            requiredFlexSlots: null,
            sellPriority: null,
            imbueTargetAbilityId: null,
        })),
    };
}

function build(fields: Partial<BuildView> = {}): BuildView {
    return {
        heroBuildId: 3,
        heroId: 1,
        authorAccountId: 42,
        lastUpdatedTimestamp: 2000,
        name: "Current",
        description: "now",
        language: 0,
        version: 7,
        originBuildId: 900,
        modCategories: [cat([1, 2, 3])],
        abilityOrder: [],
        tags: [],
        developmentBuild: false,
        publishTimestamp: 1500,
        favorited: false,
        ...fields,
    };
}

const meta = (id: string, savedAt: number, name: string): BuildVersionMeta => ({ id, savedAt, name, note: null });

describe("restoredBuild", () => {
    it("takes the version's content and keeps the current build's identity fields", () => {
        const current = build();
        const version = build({
            heroBuildId: 99,
            authorAccountId: 7,
            version: 2,
            originBuildId: null,
            publishTimestamp: null,
            lastUpdatedTimestamp: 100,
            name: "Old",
            description: "then",
            modCategories: [cat([4]), cat([4, 5])],
            abilityOrder: [{ abilityId: 10, currencyType: 1, delta: 1, annotation: null }] as BuildView["abilityOrder"],
        });

        const restored = restoredBuild(current, version);

        expect(restored).toEqual({
            ...version,
            heroBuildId: 3,
            authorAccountId: 42,
            version: 7,
            originBuildId: 900,
            publishTimestamp: 1500,
            lastUpdatedTimestamp: 2000,
        });
        expect(current.name).toBe("Current");
        expect(version.heroBuildId).toBe(99);
    });
});

describe("historyBuildId", () => {
    it("lists history only for a build already in the file", () => {
        expect(historyBuildId({ kind: "local", section: "Unpublished", base: "b", buildId: 3 })).toBe(3);
        expect(historyBuildId({ kind: "new" })).toBeNull();
        expect(historyBuildId({ kind: "copyView" })).toBeNull();
    });
});

describe("itemCount", () => {
    it("counts every item, duplicates included", () => {
        expect(itemCount(build({ modCategories: [cat([1, 1]), cat([1]), cat([])] }))).toBe(3);
    });
});

describe("ageOf", () => {
    it("picks the largest whole unit", () => {
        expect(ageOf(1000, 1030)).toEqual({ unit: "now", count: 0 });
        expect(ageOf(1000, 1000 + 5 * 60)).toEqual({ unit: "minutes", count: 5 });
        expect(ageOf(1000, 1000 + 3 * 3600)).toEqual({ unit: "hours", count: 3 });
        expect(ageOf(1000, 1000 + 86400)).toEqual({ unit: "days", count: 1 });
        expect(ageOf(1000, 1000 + 10 * 86400)).toEqual({ unit: "days", count: 10 });
    });

    it("reads a time in the future as now", () => {
        expect(ageOf(2000, 1000)).toEqual({ unit: "now", count: 0 });
    });
});

describe("versionRows", () => {
    it("lists newest first, a later save of the same second before the earlier", () => {
        const rows = versionRows(
            [meta("100-0", 100, "Current"), meta("300-0", 300, "Current"), meta("100-1", 100, "Current")],
            new Map(),
            build(),
        );
        expect(rows.map((r) => r.id)).toEqual(["300-0", "100-1", "100-0"]);
    });

    it("shows the name only when it differs from the current build's", () => {
        const rows = versionRows([meta("2-0", 2, "Old name"), meta("1-0", 1, " Current ")], new Map(), build());
        expect(rows.map((r) => r.name)).toEqual(["Old name", null]);
    });

    it("shows the item count only once the version is loaded and the count differs", () => {
        const loaded = new Map([
            ["3-0", build({ modCategories: [cat([1])] })],
            ["2-0", build()],
        ]);
        const rows = versionRows(
            [meta("3-0", 3, "Current"), meta("2-0", 2, "Current"), meta("1-0", 1, "Current")],
            loaded,
            build(),
        );
        expect(rows.map((r) => r.items)).toEqual([1, null, null]);
    });
});
