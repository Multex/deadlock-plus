import { describe, expect, it } from "vitest";
import {
    GREETINGS,
    gameTile,
    glanceValue,
    greeting,
    isActivePath,
    pct,
    periodFor,
    relativeDay,
    signed,
    statsNote,
} from "./home";

describe("relativeDay", () => {
    const noon = new Date(2026, 8, 26, 12).getTime() / 1000;
    const at = (dayOffset: number, hour: number) => new Date(2026, 8, 26 + dayOffset, hour).getTime() / 1000;
    it("names today and yesterday by calendar day", () => {
        expect(relativeDay(at(0, 1), noon)).toBe("Today");
        expect(relativeDay(at(-1, 23), noon)).toBe("Yesterday");
    });
    it("counts older days", () => {
        expect(relativeDay(at(-4, 8), noon)).toBe("4 days ago");
    });
    it("treats a future time as today", () => {
        expect(relativeDay(at(1, 8), noon)).toBe("Today");
    });
});

describe("periodFor", () => {
    it("covers every hour", () => {
        for (let h = 0; h < 24; h++) expect(GREETINGS[periodFor(h)].length).toBeGreaterThan(1);
    });
    it("buckets the boundaries", () => {
        expect(periodFor(0)).toBe("lateNight");
        expect(periodFor(4)).toBe("lateNight");
        expect(periodFor(5)).toBe("earlyMorning");
        expect(periodFor(8)).toBe("morning");
        expect(periodFor(12)).toBe("midday");
        expect(periodFor(14)).toBe("afternoon");
        expect(periodFor(18)).toBe("evening");
        expect(periodFor(22)).toBe("night");
        expect(periodFor(23)).toBe("night");
    });
});

describe("greeting", () => {
    it("inserts the name", () => {
        expect(greeting(2, "Sam", 0)).toBe("Late night, Sam?");
    });
    it("drops the name cleanly when missing", () => {
        expect(greeting(2, null, 0)).toBe("Late night?");
        for (const seed of GREETINGS.morning.keys()) expect(greeting(9, null, seed)).not.toMatch(/\{name\}|, [?!.]|,$/);
    });
    it("is stable for a seed and varies across seeds", () => {
        expect(greeting(9, "A", 3)).toBe(greeting(9, "A", 3));
        const all = new Set(GREETINGS.morning.map((_, i) => greeting(9, "A", i)));
        expect(all.size).toBe(GREETINGS.morning.length);
    });
    it("wraps large seeds", () => {
        expect(greeting(9, "A", 1_000_000_007)).toBeTypeOf("string");
    });
});

describe("isActivePath", () => {
    it("matches home only exactly", () => {
        expect(isActivePath("/", "/")).toBe(true);
        expect(isActivePath("/server-picker", "/")).toBe(false);
    });
    it("matches sections by prefix", () => {
        expect(isActivePath("/demos", "/demos")).toBe(true);
        expect(isActivePath("/demos/1", "/demos")).toBe(true);
        expect(isActivePath("/demos-x", "/demos")).toBe(false);
    });
});

describe("signed", () => {
    it("adds a plus only to positives", () => {
        expect(signed(5)).toBe("+5");
        expect(signed(0)).toBe("0");
        expect(signed(-3)).toBe("-3");
    });
});

describe("pct", () => {
    it("rounds a ratio to a whole percent", () => {
        expect(pct(0.756)).toBe("76%");
        expect(pct(0)).toBe("0%");
    });
    it("shows a dash when there is no value", () => {
        expect(pct(null)).toBe("-");
    });
});

describe("glanceValue", () => {
    it("shows an en dash until the count is known", () => {
        expect(glanceValue(null)).toBe("–");
        expect(glanceValue(0)).toBe("0");
        expect(glanceValue(12)).toBe("12");
    });
});

describe("statsNote", () => {
    it("explains an empty card by load state", () => {
        expect(statsNote("ready", "No matches yet.")).toBe("No matches yet.");
        expect(statsNote("error", "No matches yet.")).toBe("Could not load.");
        expect(statsNote("loading", "No matches yet.")).toBe("Loading...");
        expect(statsNote("idle", "No matches yet.")).toBe("Loading...");
    });

    it("names the missing Steam account, whose stats never load", () => {
        expect(statsNote("idle", "No matches yet.", true)).toBe("No Steam account found");
    });
});

describe("gameTile", () => {
    it("offers a launch while the game is not running or still unknown", () => {
        expect(gameTile(false)).toEqual({ label: "Launch", launchable: true });
        expect(gameTile(null)).toEqual({ label: "Launch", launchable: true });
    });

    it("shows the game as running with nothing to launch", () => {
        expect(gameTile(true)).toEqual({ label: "Running", launchable: false });
    });
});
