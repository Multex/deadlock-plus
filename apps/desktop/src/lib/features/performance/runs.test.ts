import { describe, expect, it } from "vitest";

import type { FrameStats } from "./api";
import { MAX_RUNS, addRun, compareRuns, comparisonReport, makeRun, parseRuns, removeRun, type SavedRun } from "./runs";

function stats(over: Partial<FrameStats> = {}): FrameStats {
    return {
        frameCount: 6000,
        durationMs: 100_000,
        backgroundMs: 0,
        avgMs: 16.6,
        medianMs: 16.6,
        p95Ms: 18,
        p99Ms: 20,
        p999Ms: 30,
        maxMs: 40,
        low1pctFps: 50,
        low01pctFps: 33,
        spikes: [],
        ...over,
    };
}

function run(id: string, over: Partial<SavedRun> = {}): SavedRun {
    return { id, label: id, savedAt: 1, addons: [], stats: stats(), ...over };
}

describe("makeRun", () => {
    it("trims the label and falls back to a dated name when it is blank", () => {
        expect(makeRun("  Mod off ", [], stats(), 5, "a").label).toBe("Mod off");
        expect(makeRun("   ", [], stats(), Date.UTC(2026, 8, 29), "a").label).toBe("Run 2026-09-29");
    });

    it("sorts the addon names so two runs with the same set compare equal", () => {
        expect(makeRun("x", ["b", "a"], stats(), 1, "a").addons).toEqual(["a", "b"]);
    });
});

describe("addRun / removeRun", () => {
    it("puts the newest run first and caps the list", () => {
        let runs: SavedRun[] = [];
        for (let i = 0; i < MAX_RUNS + 3; i++) runs = addRun(runs, run(`r${i}`));
        expect(runs).toHaveLength(MAX_RUNS);
        expect(runs[0].id).toBe(`r${MAX_RUNS + 2}`);
    });

    it("removes by id and leaves the rest alone", () => {
        expect(removeRun([run("a"), run("b")], "a").map((r) => r.id)).toEqual(["b"]);
    });
});

describe("parseRuns", () => {
    it("returns an empty list for anything that is not a list", () => {
        expect(parseRuns(null)).toEqual([]);
        expect(parseRuns({})).toEqual([]);
    });

    it("keeps valid runs and drops malformed ones", () => {
        const good = run("ok");
        const bad = { id: "bad", label: "x", savedAt: 1, addons: [], stats: { frameCount: "many" } };
        expect(parseRuns([good, bad, 7, null])).toEqual([good]);
    });

    it("drops a run whose addons are not all strings", () => {
        expect(parseRuns([{ ...run("a"), addons: [1] }])).toEqual([]);
    });
});

describe("compareRuns", () => {
    it("reports each metric's change and which side is better", () => {
        const before = run("off", { stats: stats({ avgMs: 10, p95Ms: 12, low1pctFps: 80, spikes: [] }) });
        const after = run("on", {
            stats: stats({ avgMs: 12.5, p95Ms: 18, low1pctFps: 55, spikes: [{ atMs: 1, frametimeMs: 50 }] }),
        });
        const rows = compareRuns(before, after);
        const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
        expect(byKey.avgFps.better).toBe("a");
        expect(byKey.avgFps.a).toBeCloseTo(100);
        expect(byKey.avgFps.b).toBeCloseTo(80);
        expect(byKey.p95Ms.better).toBe("a");
        expect(byKey.low1pctFps.better).toBe("a");
        expect(byKey.spikes.better).toBe("a");
    });

    it("calls a small difference a tie", () => {
        const a = run("a", { stats: stats({ p95Ms: 18.0 }) });
        const b = run("b", { stats: stats({ p95Ms: 18.1 }) });
        expect(compareRuns(a, b).find((r) => r.key === "p95Ms")?.better).toBe("tie");
    });

    it("scales spikes by run length so a longer run is not penalised", () => {
        const short = run("s", { stats: stats({ durationMs: 60_000, spikes: [{ atMs: 1, frametimeMs: 50 }] }) });
        const long = run("l", {
            stats: stats({
                durationMs: 120_000,
                spikes: [
                    { atMs: 1, frametimeMs: 50 },
                    { atMs: 2, frametimeMs: 50 },
                ],
            }),
        });
        const row = compareRuns(short, long).find((r) => r.key === "spikes");
        expect(row?.better).toBe("tie");
    });
});

describe("comparisonReport", () => {
    const off = run("off", { label: "Mod off", addons: ["Alpha"], stats: stats({ avgMs: 10, p95Ms: 12 }) });
    const on = run("on", { label: "Mod on", addons: ["Alpha", "Beta"], stats: stats({ avgMs: 12.5, p95Ms: 18 }) });

    it("names both runs, the metrics and the addons that differ", () => {
        const text = comparisonReport(off, on);
        expect(text).toContain("Run A: Mod off");
        expect(text).toContain("Run B: Mod on");
        expect(text).toMatch(/Average FPS\s+100\s+80\s+A/);
        expect(text).toContain("Only on in Mod on: Beta");
    });

    it("says the result is consistent with, not proof of, a cause", () => {
        expect(comparisonReport(off, on)).toContain("not proof");
    });

    it("says so when both runs had the same mods on", () => {
        expect(comparisonReport(off, { ...on, addons: off.addons })).toContain("same mods");
    });
});
