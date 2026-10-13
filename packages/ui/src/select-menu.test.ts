import { describe, expect, it } from "vitest";
import { findItem, groupItems } from "./select-menu";

describe("groupItems", () => {
    it("is one headless group when nothing is grouped", () => {
        const items = [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
        ];
        expect(groupItems(items)).toEqual([{ heading: null, items }]);
    });

    it("orders groups by first appearance and keeps item order inside each", () => {
        const groups = groupItems([
            { value: "1", label: "Abrams", group: "The Hidden King" },
            { value: "2", label: "Bebop", group: "The Archmother" },
            { value: "3", label: "Dynamo", group: "The Hidden King" },
            { value: "4", label: "Haze", group: "The Archmother" },
        ]);
        expect(groups.map((g) => g.heading)).toEqual(["The Hidden King", "The Archmother"]);
        expect(groups.map((g) => g.items.map((i) => i.value))).toEqual([
            ["1", "3"],
            ["2", "4"],
        ]);
    });

    it("keeps ungrouped items together at the place the first one appears", () => {
        const groups = groupItems([
            { value: "", label: "Everyone" },
            { value: "1", label: "Abrams", group: "The Hidden King" },
            { value: "x", label: "Other" },
        ]);
        expect(groups.map((g) => g.heading)).toEqual([null, "The Hidden King"]);
        expect(groups[0].items.map((i) => i.value)).toEqual(["", "x"]);
    });

    it("treats an empty group name as no group", () => {
        expect(groupItems([{ value: "a", label: "A", group: "" }])[0].heading).toBeNull();
    });

    it("returns no groups for no items", () => {
        expect(groupItems([])).toEqual([]);
    });

    it("keeps the caller's extra fields on each item", () => {
        const [group] = groupItems([{ value: "7", label: "Wraith", heroId: 7 }]);
        expect(group.items[0].heroId).toBe(7);
    });
});

describe("findItem", () => {
    const items = [
        { value: "", label: "Any hero" },
        { value: "7", label: "Wraith" },
    ];

    it("finds the item with the value", () => {
        expect(findItem(items, "7")?.label).toBe("Wraith");
    });

    it("finds an item whose value is the empty string", () => {
        expect(findItem(items, "")?.label).toBe("Any hero");
    });

    it("is undefined when no item has the value", () => {
        expect(findItem(items, "9")).toBeUndefined();
        expect(findItem(items, undefined)).toBeUndefined();
    });
});
