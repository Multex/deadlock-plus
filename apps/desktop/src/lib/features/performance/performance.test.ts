import { describe, expect, it } from "vitest";
import type { AddonInfo, AddonScan, AddonScanReport, Finding } from "./api";
import {
    addonTitle,
    findingCount,
    groupAddons,
    scanPercent,
    flattenFindings,
    formatDuration,
    frameCaptureNote,
    framePolyline,
    indexReport,
    scanStatus,
    summarize,
    worstSeverity,
} from "./performance";

const finding = (over: Partial<Finding> = {}): Finding => ({
    rule: "nulledNotCancelled",
    severity: "medium",
    function: "Update",
    line: 10,
    snippet: "handle = null;",
    ...over,
});

const scan = (over: Partial<AddonScan> = {}): AddonScan => ({
    fileName: "pak01_dir.vpk",
    label: "build_qollock",
    scriptsScanned: 3,
    scripts: [],
    ...over,
});

describe("scanStatus", () => {
    it("reports no scripts when none were scanned", () => {
        expect(scanStatus(scan({ scriptsScanned: 0 }))).toBe("noScripts");
    });

    it("reports clean when scripts were scanned without findings", () => {
        expect(scanStatus(scan({ scripts: [{ path: "a.js", findings: [] }] }))).toBe("clean");
    });

    it("reports flagged when any script has a finding", () => {
        expect(scanStatus(scan({ scripts: [{ path: "a.js", findings: [finding()] }] }))).toBe("flagged");
    });
});

describe("flattenFindings", () => {
    it("sorts high before medium before low, then by path and line", () => {
        const s = scan({
            scripts: [
                { path: "b.js", findings: [finding({ severity: "low", line: 1 })] },
                {
                    path: "a.js",
                    findings: [finding({ severity: "high", line: 9 }), finding({ severity: "medium", line: 2 })],
                },
                { path: "a.js", findings: [finding({ severity: "high", line: 3 })] },
            ],
        });
        expect(flattenFindings(s).map((f) => [f.path, f.severity, f.line])).toEqual([
            ["a.js", "high", 3],
            ["a.js", "high", 9],
            ["a.js", "medium", 2],
            ["b.js", "low", 1],
        ]);
    });
});

describe("worstSeverity and findingCount", () => {
    const s = scan({
        scripts: [
            { path: "a.js", findings: [finding({ severity: "low" }), finding({ severity: "medium" })] },
            { path: "b.js", findings: [finding({ severity: "low" })] },
        ],
    });

    it("picks the highest severity", () => {
        expect(worstSeverity(s)).toBe("medium");
    });

    it("returns null with no findings", () => {
        expect(worstSeverity(scan())).toBeNull();
    });

    it("counts findings across scripts", () => {
        expect(findingCount(s)).toBe(3);
    });
});

describe("addonTitle", () => {
    const info = (over: Partial<AddonInfo> = {}): AddonInfo => ({
        fileName: "pak01_dir.vpk",
        modId: null,
        enabled: null,
        ...over,
    });

    it("uses the scan label once scanned", () => {
        expect(addonTitle(info(), scan({ label: "build_qollock" }))).toBe("build_qollock");
    });

    it("falls back to the mod id before a scan", () => {
        expect(addonTitle(info({ modId: "123" }), undefined)).toBe("GameBanana mod 123");
    });

    it("falls back to the file name with nothing else", () => {
        expect(addonTitle(info(), undefined)).toBe("pak01_dir.vpk");
    });
});

describe("summarize", () => {
    it("counts addons by outcome", () => {
        const scans = {
            a: scan({ scriptsScanned: 0 }),
            b: scan({ scripts: [{ path: "x.js", findings: [] }] }),
            c: scan({ scripts: [{ path: "x.js", findings: [finding(), finding()] }] }),
        };
        expect(summarize(scans)).toEqual({ scanned: 3, noScripts: 1, clean: 1, flagged: 1, findings: 2 });
    });
});

describe("groupAddons", () => {
    const info = (fileName: string): AddonInfo => ({ fileName, modId: null, enabled: null });
    const flagged = (...severities: Finding["severity"][]) =>
        scan({ scripts: [{ path: "a.js", findings: severities.map((severity) => finding({ severity })) }] });

    it("splits addons by outcome and orders flagged worst first", () => {
        const addons = ["low", "high", "medium", "clean", "none", "bad", "wait"].map(info);
        const groups = groupAddons(
            addons,
            {
                low: flagged("low"),
                high: flagged("high"),
                medium: flagged("medium", "medium"),
                clean: scan({ scripts: [{ path: "a.js", findings: [] }] }),
                none: scan({ scriptsScanned: 0 }),
            },
            { bad: "diagnostics.mod_unreadable" },
        );
        expect(groups.flagged.map((a) => a.fileName)).toEqual(["high", "medium", "low"]);
        expect(groups.clean.map((a) => a.fileName)).toEqual(["clean"]);
        expect(groups.noScripts.map((a) => a.fileName)).toEqual(["none"]);
        expect(groups.failed.map((a) => a.fileName)).toEqual(["bad"]);
        expect(groups.pending.map((a) => a.fileName)).toEqual(["wait"]);
    });

    it("breaks severity ties by finding count", () => {
        const groups = groupAddons(
            [info("one"), info("two")],
            { one: flagged("high"), two: flagged("high", "low") },
            {},
        );
        expect(groups.flagged.map((a) => a.fileName)).toEqual(["two", "one"]);
    });
});

describe("scanPercent", () => {
    it("rounds done over total", () => {
        expect(scanPercent(1, 3)).toBe(33);
    });

    it("is 0 with nothing to scan", () => {
        expect(scanPercent(0, 0)).toBe(0);
    });

    it("never exceeds 100", () => {
        expect(scanPercent(5, 3)).toBe(100);
    });
});

describe("framePolyline", () => {
    it("spreads points across the width and scales height to the ceiling", () => {
        expect(framePolyline([0, 10, 20], 100, 40, 20)).toBe("0,40 50,20 100,0");
    });

    it("clamps values above the ceiling to the top edge", () => {
        expect(framePolyline([5, 500], 10, 10, 10)).toBe("0,5 10,0");
    });

    it("returns nothing for fewer than two values or a non-positive ceiling", () => {
        expect(framePolyline([], 100, 40, 20)).toBe("");
        expect(framePolyline([5], 100, 40, 20)).toBe("");
        expect(framePolyline([5, 6], 100, 40, 0)).toBe("");
    });
});

describe("formatDuration", () => {
    it("formats milliseconds as m:ss", () => {
        expect(formatDuration(0)).toBe("0:00");
        expect(formatDuration(65_400)).toBe("1:05");
        expect(formatDuration(3_600_000)).toBe("60:00");
    });
});

describe("indexReport", () => {
    const scan = (fileName: string): AddonScan => ({ fileName, label: fileName, scriptsScanned: 1, scripts: [] });

    it("keys scans and failures by file name", () => {
        const report: AddonScanReport = {
            listing: null,
            scans: [scan("a_dir.vpk"), scan("b_dir.vpk")],
            failures: [{ fileName: "c_dir.vpk", error: "diagnostics.mod_unreadable" }],
        };
        const { scans, failures } = indexReport(report);
        expect(Object.keys(scans)).toEqual(["a_dir.vpk", "b_dir.vpk"]);
        expect(failures).toEqual({ "c_dir.vpk": "diagnostics.mod_unreadable" });
    });

    it("is empty for an empty report", () => {
        expect(indexReport({ listing: null, scans: [], failures: [] })).toEqual({ scans: {}, failures: {} });
    });
});

describe("frameCaptureNote", () => {
    it("asks for administrator rights on Windows", () => {
        expect(frameCaptureNote("windows")).toContain("administrator");
    });

    it("points Linux users at the Vulkan layer and the Steam launch option", () => {
        const note = frameCaptureNote("linux");
        expect(note).toContain("Vulkan layer");
        expect(note).toContain("launch option");
    });

    it("says frame capture is not available on macOS", () => {
        expect(frameCaptureNote("macos")).toContain("not available on macOS");
    });
});
