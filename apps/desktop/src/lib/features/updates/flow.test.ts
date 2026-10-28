import { describe, expect, it } from "vitest";
import {
    byteProgress,
    failureStep,
    indicatorKind,
    keepsCurrentBuild,
    manualDownloadUrl,
    mebibytes,
    recentReleases,
    releaseCadenceDays,
    releaseNotesUrl,
    releaseHighlights,
    secondsLeft,
    timeLeft,
    updateStage,
    type UpdateSource,
} from "./flow";

const source = (over: Partial<UpdateSource> = {}): UpdateSource => ({
    phase: "idle",
    version: null,
    progress: null,
    error: null,
    ...over,
});

const NOTES = [
    "### Added",
    "",
    "- A Delay setting holds back what Discord presence shows.",
    "- The website comes in every language the app has.",
    "",
    "#### Deadlock+ Dispatch",
    "",
    "- A new Dispatch page prints your Deadlock week as a newspaper.",
    "- A Weekly Edition comes out every Monday.",
    "",
    "#### Match front page",
    "",
    "- A front page lands on the window after a match.",
    "",
    "### Fixed",
    "",
    "- The app no longer freezes after an update.",
].join("\n");

describe("updateStage", () => {
    it("reads the store's phases, with an error as a failure", () => {
        expect(updateStage(source({ phase: "available", version: "1.1.0" }))).toBe("available");
        expect(updateStage(source({ phase: "downloading" }))).toBe("downloading");
        expect(updateStage(source({ phase: "error", error: "download" }))).toBe("failed");
        expect(updateStage(source({ phase: "upToDate" }))).toBe("upToDate");
    });

    it("knows a downloaded update that waits for a restart", () => {
        expect(updateStage(source({ phase: "ready", version: "1.1.0" }))).toBe("ready");
    });

    it("treats a phase it does not know as not checked yet", () => {
        expect(updateStage(source({ phase: "installing-later" }))).toBe("idle");
    });
});

describe("failureStep", () => {
    it("names the step that failed, and nothing outside a failure", () => {
        expect(failureStep(source({ phase: "error", error: "check" }))).toBe("check");
        expect(failureStep(source({ phase: "error", error: "download" }))).toBe("download");
        expect(failureStep(source({ phase: "error", error: "install" }))).toBe("install");
        expect(failureStep(source({ phase: "available", error: "download" }))).toBeNull();
    });
});

describe("byteProgress", () => {
    it("works from bytes when the store reports them", () => {
        expect(byteProgress(source({ received: 10_000_000, total: 40_000_000 }))).toEqual({
            fraction: 0.25,
            received: 10_000_000,
            total: 40_000_000,
        });
    });

    it("falls back to the store's fraction when it has no byte counts", () => {
        expect(byteProgress(source({ progress: 0.4 }))).toEqual({ fraction: 0.4, received: null, total: null });
    });

    it("has no fraction while the size is unknown", () => {
        expect(byteProgress(source({ received: 5_000_000, total: null })).fraction).toBeNull();
    });

    it("never passes a whole", () => {
        expect(byteProgress(source({ received: 50, total: 40 })).fraction).toBe(1);
    });
});

describe("mebibytes", () => {
    it("rounds to one decimal, as Windows counts sizes", () => {
        expect(mebibytes(38_273_024)).toBe(36.5);
        expect(mebibytes(0)).toBe(0);
    });
});

describe("secondsLeft", () => {
    it("rounds up the time left at the current rate", () => {
        expect(secondsLeft(10_000_000, 40_000_000, 4_000_000)).toBe(8);
    });

    it("is unknown without a size or a rate", () => {
        expect(secondsLeft(10, null, 5)).toBeNull();
        expect(secondsLeft(10, 40, null)).toBeNull();
        expect(secondsLeft(10, 40, 0)).toBeNull();
    });
});

describe("releaseHighlights", () => {
    it("leads with the release's feature headings and their first line", () => {
        const highlights = releaseHighlights("1.1.0", NOTES);
        expect(highlights.headlines).toEqual([
            { title: "Deadlock+ Dispatch", lead: "A new Dispatch page prints your Deadlock week as a newspaper." },
            { title: "Match front page", lead: "A front page lands on the window after a match." },
        ]);
    });

    it("counts every change in the notes", () => {
        expect(releaseHighlights("1.1.0", NOTES).total).toBe(6);
    });

    it("uses the first added lines when the notes have no feature headings", () => {
        const notes = "### Added\n\n- One.\n- Two.\n- Three.\n- Four.\n\n### Fixed\n\n- Five.";
        expect(releaseHighlights("1.1.0", notes).headlines).toEqual([
            { title: "One.", lead: null },
            { title: "Two.", lead: null },
            { title: "Three.", lead: null },
        ]);
    });

    it("has nothing to show for missing notes", () => {
        expect(releaseHighlights("1.1.0", null)).toEqual({ headlines: [], total: 0 });
        expect(releaseHighlights("1.1.0", "")).toEqual({ headlines: [], total: 0 });
    });
});

describe("indicatorKind", () => {
    it("shows for an update in any state the user can act on", () => {
        expect(indicatorKind(source({ phase: "available" }))).toBe("available");
        expect(indicatorKind(source({ phase: "downloading" }))).toBe("downloading");
        expect(indicatorKind(source({ phase: "ready" }))).toBe("ready");
        expect(indicatorKind(source({ phase: "error", error: "download" }))).toBe("failed");
        expect(indicatorKind(source({ phase: "error", error: "install" }))).toBe("failed");
    });

    it("stays away when nothing is waiting or a background check failed", () => {
        expect(indicatorKind(source({ phase: "upToDate" }))).toBeNull();
        expect(indicatorKind(source({ phase: "checking" }))).toBeNull();
        expect(indicatorKind(source({ phase: "error", error: "check" }))).toBeNull();
    });
});

describe("keepsCurrentBuild", () => {
    it("is true only when moving to a steadier channel", () => {
        expect(keepsCurrentBuild("nightly", "release")).toBe(true);
        expect(keepsCurrentBuild("beta", "release")).toBe(true);
        expect(keepsCurrentBuild("nightly", "beta")).toBe(true);
        expect(keepsCurrentBuild("release", "beta")).toBe(false);
        expect(keepsCurrentBuild("beta", "beta")).toBe(false);
    });
});

describe("manualDownloadUrl", () => {
    it("sends Release to the website and test channels to GitHub's releases", () => {
        expect(manualDownloadUrl("release")).toBe("https://deadlockplus.app/download");
        expect(manualDownloadUrl("beta")).toBe("https://github.com/deadlock-plus/deadlock-plus/releases");
        expect(manualDownloadUrl("nightly")).toBe("https://github.com/deadlock-plus/deadlock-plus/releases");
    });
});

describe("releaseNotesUrl", () => {
    it("opens a Release version's own page and the release list for test channels", () => {
        expect(releaseNotesUrl("release", "0.15.0")).toBe(
            "https://github.com/deadlock-plus/deadlock-plus/releases/tag/v0.15.0",
        );
        expect(releaseNotesUrl("nightly", "0.15.0-nightly.20261028")).toBe(
            "https://github.com/deadlock-plus/deadlock-plus/releases",
        );
    });
});

describe("timeLeft", () => {
    it("counts seconds under a minute and whole minutes, rounded up, after", () => {
        expect(timeLeft(12)).toEqual({ unit: "seconds", count: 12 });
        expect(timeLeft(60)).toEqual({ unit: "minutes", count: 1 });
        expect(timeLeft(61)).toEqual({ unit: "minutes", count: 2 });
    });
});

const entry = (version: string, date: string | null, groups: string[] = [], items: string[] = []) => ({
    version,
    date,
    sections: [{ title: "Added", items, groups: groups.map((title) => ({ title, items: ["x"] })) }],
});

describe("recentReleases", () => {
    const history = [
        entry("0.12.0", "2026-10-01", [], ["Grades.", "Ranks.", "Maps."]),
        entry("0.14.0", "2026-10-23", ["Build editor"], ["Small thing."]),
        entry("0.13.0", "2026-10-10", ["Overlay", "Presence", "Themes"]),
        entry("0.11.0", "2026-09-20"),
    ];

    it("lists the newest releases first, up to the limit, marking the one installed", () => {
        const releases = recentReleases(history, "0.14.0", 3);
        expect(releases.map((r) => r.version)).toEqual(["0.14.0", "0.13.0", "0.12.0"]);
        expect(releases.map((r) => r.installed)).toEqual([true, false, false]);
    });

    it("names each release by up to two feature headings, else by its first line", () => {
        const releases = recentReleases(history, "0.14.0", 3);
        expect(releases[0].headlines).toEqual(["Build editor"]);
        expect(releases[1].headlines).toEqual(["Overlay", "Presence"]);
        expect(releases[2].headlines).toEqual(["Grades."]);
    });
});

describe("releaseCadenceDays", () => {
    it("is the median gap in days between the recent dated releases", () => {
        const history = [
            entry("0.10.0", "2026-09-01"),
            entry("0.11.0", "2026-09-11"),
            entry("0.12.0", "2026-09-25"),
            entry("0.13.0", "2026-10-05"),
            entry("0.14.0", null),
        ];
        expect(releaseCadenceDays(history)).toBe(10);
    });

    it("needs at least three dated releases", () => {
        expect(releaseCadenceDays([entry("0.1.0", "2026-01-01"), entry("0.2.0", "2026-01-11")])).toBeNull();
    });
});
