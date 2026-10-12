import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "../../filters";
import type { MatchRow } from "../../list";
import {
    DAY_OPTIONS,
    MODE_OPTIONS,
    OUTCOME_OPTIONS,
    deltaView,
    filtersActive,
    heroMenuItems,
    heroOptions,
    kdaText,
    matchHref,
    modeLabelKey,
    outcomeLabelKey,
    parseHeroValue,
} from "./view-model";

const row = (over: Partial<MatchRow> = {}): MatchRow => ({
    matchId: 1,
    heroId: 10,
    outcome: "win",
    mode: "ranked",
    kills: 5,
    deaths: 2,
    assists: 7,
    souls: 30000,
    durationS: 1800,
    startTime: 1000,
    rankBadge: 63,
    rankDelta: 12,
    calibration: false,
    source: "api",
    ...over,
});

describe("kdaText", () => {
    it("joins kills, deaths and assists", () => {
        expect(kdaText(row())).toBe("5 / 2 / 7");
    });
});

describe("deltaView", () => {
    it("signs a gain", () => {
        expect(deltaView(row({ rankDelta: 12 }))).toEqual({ text: "+12", tone: "up" });
    });
    it("signs a loss", () => {
        expect(deltaView(row({ rankDelta: -9 }))).toEqual({ text: "-9", tone: "down" });
    });
    it("shows zero as flat", () => {
        expect(deltaView(row({ rankDelta: 0 }))).toEqual({ text: "0", tone: "flat" });
    });
    it("shows a dash when unknown", () => {
        expect(deltaView(row({ rankDelta: null }))).toEqual({ text: "-", tone: "none" });
    });
});

describe("labels", () => {
    it("maps modes to catalog keys", () => {
        expect(modeLabelKey("ranked")).toBe("stats.scope.ranked");
        expect(modeLabelKey("streetBrawl")).toBe("live.game.streetBrawl");
        expect(modeLabelKey("custom")).toBe("match_history.list.mode.custom");
        expect(modeLabelKey("bot")).toBe("match_history.list.mode.other");
    });
    it("maps outcomes to catalog keys", () => {
        expect(outcomeLabelKey("win")).toBe("stats.outcome.win");
        expect(outcomeLabelKey("loss")).toBe("stats.outcome.loss");
        expect(outcomeLabelKey("unscored")).toBe("match_history.list.outcome.unscored");
    });
});

describe("option lists", () => {
    it("offers the filterable modes, all first", () => {
        expect(MODE_OPTIONS.map((o) => o.value)).toEqual(["all", "ranked", "unranked", "streetBrawl"]);
    });
    it("offers every outcome", () => {
        expect(OUTCOME_OPTIONS.map((o) => o.value)).toEqual(["all", "win", "loss", "unscored"]);
    });
    it("offers day windows ending in all time", () => {
        expect(DAY_OPTIONS).toEqual([7, 30, 90, null]);
    });
});

describe("heroOptions", () => {
    it("lists each hero once, sorted by name", () => {
        const rows = [row({ heroId: 2 }), row({ heroId: 1 }), row({ heroId: 2 })];
        const names: Record<number, string> = { 1: "Zed", 2: "Abrams" };
        expect(heroOptions(rows, (id) => names[id] ?? `#${id}`)).toEqual([
            { id: 2, name: "Abrams" },
            { id: 1, name: "Zed" },
        ]);
    });
});

describe("filtersActive", () => {
    it("is false for the defaults", () => {
        expect(filtersActive(DEFAULT_FILTERS)).toBe(false);
    });
    it("is true when any filter differs", () => {
        expect(filtersActive({ ...DEFAULT_FILTERS, heroId: 3 })).toBe(true);
        expect(filtersActive({ ...DEFAULT_FILTERS, custom: true })).toBe(true);
        expect(filtersActive({ ...DEFAULT_FILTERS, days: 7 })).toBe(true);
    });
});

describe("matchHref", () => {
    it("points at the detail route", () => {
        expect(matchHref(42)).toBe("/match-history/42");
    });
});

describe("heroMenuItems", () => {
    it("puts the any-hero choice first with an empty value, then the heroes in order", () => {
        const items = heroMenuItems(
            [
                { id: 13, name: "Haze" },
                { id: 2, name: "Seven" },
            ],
            "Any hero",
        );
        expect(items).toEqual([
            { value: "", label: "Any hero" },
            { value: "13", label: "Haze", heroId: 13 },
            { value: "2", label: "Seven", heroId: 2 },
        ]);
    });

    it("reads a picked value back as a hero id", () => {
        expect(parseHeroValue("")).toBeNull();
        expect(parseHeroValue("13")).toBe(13);
    });
});
