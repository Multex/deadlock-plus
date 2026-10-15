import { describe, expect, it } from "vitest";
import type { Hero } from "$lib/features/heroes/heroes";
import { heroIdFromValue, heroItems, sourceItems, sourceThumb, timerItems } from "./select-items";

const hero = (id: number, name: string, icon: string | null): Hero => ({
    id,
    name,
    icon,
    portrait: null,
    artIcon: null,
    hideoutLine: null,
});

describe("heroItems", () => {
    it("puts the all-heroes row first with an empty value, then the heroes in the given order", () => {
        const items = heroItems([hero(13, "Haze", "haze.webp"), hero(2, "Seven", null)], "Default (all heroes)");
        expect(items).toEqual([
            { value: "", label: "Default (all heroes)", icon: null, all: true },
            { value: "13", label: "Haze", icon: "haze.webp", all: false },
            { value: "2", label: "Seven", icon: null, all: false },
        ]);
    });
});

describe("heroIdFromValue", () => {
    it("reads the empty value as no hero", () => {
        expect(heroIdFromValue("")).toBeUndefined();
    });

    it("reads a hero value as its numeric id", () => {
        expect(heroIdFromValue("13")).toBe(13);
    });
});

describe("sourceItems", () => {
    const label = (kind: string) => `L:${kind}`;

    it("offers the four pickable sources in order", () => {
        expect(sourceItems("heroPortrait", label).map((i) => i.value)).toEqual([
            "heroPortrait",
            "heroIcon",
            "rankBadge",
            "customUrl",
        ]);
    });

    it("adds the mode icon last only while it is the current source", () => {
        expect(sourceItems("modeIcon", label).map((i) => i.value)).toEqual([
            "heroPortrait",
            "heroIcon",
            "rankBadge",
            "customUrl",
            "modeIcon",
        ]);
    });

    it("carries the kind and its label", () => {
        expect(sourceItems("heroIcon", label)[2]).toEqual({
            value: "rankBadge",
            label: "L:rankBadge",
            kind: "rankBadge",
        });
    });
});

describe("sourceThumb", () => {
    const art = { heroPortrait: "card.png", heroIcon: "sm.png", rankBadge: "rank.webp" };

    it("resolves the image a source would show", () => {
        expect(sourceThumb("heroPortrait", art)).toBe("card.png");
        expect(sourceThumb("heroIcon", art)).toBe("sm.png");
        expect(sourceThumb("rankBadge", art)).toBe("rank.webp");
    });

    it("has no thumbnail for sources without sample art", () => {
        expect(sourceThumb("modeIcon", art)).toBeNull();
        expect(sourceThumb("customUrl", art)).toBeNull();
    });

    it("has no thumbnail when the art is missing", () => {
        expect(sourceThumb("rankBadge", { heroPortrait: null, heroIcon: null, rankBadge: null })).toBeNull();
    });
});

describe("timerItems", () => {
    it("offers every timer in order", () => {
        expect(timerItems((timer) => `T:${timer}`)).toEqual([
            { value: "none", label: "T:none", timer: "none" },
            { value: "elapsedInState", label: "T:elapsedInState", timer: "elapsedInState" },
            { value: "matchTime", label: "T:matchTime", timer: "matchTime" },
            { value: "queueTime", label: "T:queueTime", timer: "queueTime" },
        ]);
    });
});
