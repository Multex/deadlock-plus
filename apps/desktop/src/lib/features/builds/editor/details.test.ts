import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import { describe, expect, it } from "vitest";
import {
    DESCRIPTION_MAX_CHARS,
    NAME_MAX_CHARS,
    STANDARD_TAGS,
    STEAM_LANGUAGES,
    TAG_SLOTS,
    buildItemIds,
    canAddTag,
    classId,
    describeTag,
    languageOptions,
    selectedTags,
    toggleTag,
} from "./details";

function build(items: number[][]): BuildView {
    return {
        heroBuildId: 1,
        heroId: 2,
        authorAccountId: 3,
        lastUpdatedTimestamp: null,
        name: "",
        description: "",
        language: 0,
        version: 0,
        originBuildId: null,
        modCategories: items.map((ids, i) => ({
            name: `c${i}`,
            description: "",
            width: 100,
            height: 162.75,
            optional: false,
            mods: ids.map((abilityId) => ({
                abilityId,
                annotation: null,
                requiredFlexSlots: null,
                sellPriority: null,
                imbueTargetAbilityId: null,
            })),
        })),
        abilityOrder: [],
        tags: [],
        developmentBuild: false,
        publishTimestamp: null,
        favorited: false,
    };
}

describe("text limits", () => {
    it("are the game's build page maxchars", () => {
        expect(NAME_MAX_CHARS).toBe(50);
        expect(DESCRIPTION_MAX_CHARS).toBe(512);
    });
});

describe("languageOptions", () => {
    it("lists every Steam ELanguage id from 0 to 28 once", () => {
        expect(STEAM_LANGUAGES.map((l) => l.id)).toEqual(Array.from({ length: 29 }, (_, i) => i));
        expect(
            languageOptions("en", 0, String)
                .map((o) => Number(o.value))
                .sort((a, b) => a - b),
        ).toEqual(STEAM_LANGUAGES.map((l) => l.id));
    });

    it("names each language in the display locale, told apart by region and script", () => {
        const label = (id: number) => languageOptions("en", 0, String).find((o) => o.value === String(id))?.label;
        expect(label(0)).toBe("English");
        expect(label(5)).toBe("European Spanish");
        expect(label(26)).toBe("Latin American Spanish");
        expect(label(6)).toBe("Simplified Chinese");
        expect(label(7)).toBe("Traditional Chinese");
        expect(label(11)).toBe("European Portuguese");
        expect(label(22)).toBe("Brazilian Portuguese");
        expect(languageOptions("de", 0, String).find((o) => o.value === "1")?.label).toBe("Deutsch");
    });

    it("adds the language's own name as meta when it differs from the label", () => {
        const options = languageOptions("en", 0, String);
        expect(options.find((o) => o.value === "1")?.meta).toBe("Deutsch");
        expect(options.find((o) => o.value === "0")?.meta).toBeUndefined();
    });

    it("sorts by label in the display locale", () => {
        const labels = languageOptions("en", 0, String).map((o) => o.label);
        expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "en")));
    });

    it("keeps a language id it does not know, so the select still shows the build's value", () => {
        const options = languageOptions("en", 31, (id) => `Language ${id}`);
        expect(options.find((o) => o.value === "31")?.label).toBe("Language 31");
        expect(languageOptions("en", 3, String).some((o) => o.value === "31")).toBe(false);
    });
});

describe("classId", () => {
    it("is MurmurHash2 with seed 0x31415926 over the lowercased name", () => {
        expect(classId("ability_fire_bomb")).toBe(1142270357);
        expect(classId("upgrade_ricochet")).toBe(2480592370);
        expect(classId("UPGRADE_RICOCHET")).toBe(2480592370);
    });
});

describe("STANDARD_TAGS", () => {
    it("hash the game's tag tokens to the ids published builds carry", () => {
        const id = (key: string) => STANDARD_TAGS.find((s) => s.key === key)?.id;
        expect(id("weapon")).toBe(47026193);
        expect(id("vitality")).toBe(4213205702);
        expect(id("spirit")).toBe(36498494);
        expect(id("complexity_1")).toBe(1052421347);
        expect(id("complexity_3")).toBe(3797987367);
        expect(id("damage")).toBe(2592289373);
        expect(id("debuff")).toBe(255841590);
        expect(STANDARD_TAGS).toHaveLength(14);
    });
});

describe("describeTag", () => {
    const items = new Map([[2480592370, { name: "Ricochet", art: "r.png" }]]);
    const abilities = new Map([[539192269, { name: "Flame Dash" }]]);

    it("finds standard tags first, then hero abilities, then items", () => {
        expect(describeTag(47026193, { items, abilities })).toEqual({ id: 47026193, kind: "standard", key: "weapon" });
        expect(describeTag(539192269, { items, abilities })).toEqual({
            id: 539192269,
            kind: "ability",
            name: "Flame Dash",
        });
        expect(describeTag(2480592370, { items, abilities })).toEqual({
            id: 2480592370,
            kind: "item",
            name: "Ricochet",
            art: "r.png",
        });
    });

    it("is unknown when no source names the id", () => {
        expect(describeTag(12345, {})).toEqual({ id: 12345, kind: "unknown" });
    });
});

describe("tag slots", () => {
    it("selected tags skip empty (0) slots and keep order", () => {
        expect(selectedTags([0, 7, 0, 9])).toEqual([7, 9]);
    });

    it("adds into the first empty slot, keeping the others in place", () => {
        expect(toggleTag([0, 0, 0], 5)).toEqual([5, 0, 0]);
        expect(toggleTag([4, 0, 6], 5)).toEqual([4, 5, 6]);
    });

    it("appends while there are fewer than the game's three slots", () => {
        expect(TAG_SLOTS).toBe(3);
        expect(toggleTag([], 5)).toEqual([5]);
        expect(toggleTag([5], 6)).toEqual([5, 6]);
    });

    it("refuses a fourth tag", () => {
        const full = [1, 2, 3];
        expect(canAddTag(full)).toBe(false);
        expect(toggleTag(full, 4)).toBe(full);
        expect(canAddTag([1, 0, 3])).toBe(true);
    });

    it("removing empties that slot without moving the rest", () => {
        expect(toggleTag([4, 5, 6], 4)).toEqual([0, 5, 6]);
        expect(toggleTag([5], 5)).toEqual([0]);
    });

    it("never mutates its input", () => {
        const tags = [0, 0, 0];
        toggleTag(tags, 5);
        expect(tags).toEqual([0, 0, 0]);
    });
});

describe("buildItemIds", () => {
    it("is each item in the build once, in build order", () => {
        expect(
            buildItemIds(
                build([
                    [3, 1],
                    [1, 2, 3],
                ]),
            ),
        ).toEqual([3, 1, 2]);
    });
});
