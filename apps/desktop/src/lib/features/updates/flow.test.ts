import { describe, expect, it } from "vitest";
import {
    byteProgress,
    downloadRate,
    failureStep,
    indicatorKind,
    keepsCurrentBuild,
    manualDownloadUrl,
    mebibytes,
    releaseNotesUrl,
    releaseHighlights,
    secondsLeft,
    stepStates,
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

describe("downloadRate", () => {
    it("is the bytes per second across the recent samples", () => {
        const samples = [
            { at: 0, bytes: 0 },
            { at: 1000, bytes: 2_000_000 },
            { at: 2000, bytes: 4_000_000 },
        ];
        expect(downloadRate(samples, 2000)).toBe(2_000_000);
    });

    it("forgets samples older than the window", () => {
        const samples = [
            { at: 0, bytes: 0 },
            { at: 9000, bytes: 1_000_000 },
            { at: 10_000, bytes: 3_000_000 },
        ];
        expect(downloadRate(samples, 10_000, 4000)).toBe(2_000_000);
    });

    it("waits for enough time to pass before guessing", () => {
        expect(downloadRate([{ at: 0, bytes: 0 }], 0)).toBeNull();
        expect(
            downloadRate(
                [
                    { at: 0, bytes: 0 },
                    { at: 200, bytes: 100 },
                ],
                200,
            ),
        ).toBeNull();
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

describe("stepStates", () => {
    it("lights the download, then the restart, as the update moves on", () => {
        expect(stepStates("available")).toEqual(["todo", "todo", "todo"]);
        expect(stepStates("downloading")).toEqual(["current", "todo", "todo"]);
        expect(stepStates("ready")).toEqual(["done", "current", "todo"]);
        expect(stepStates("failed")).toEqual(["current", "todo", "todo"]);
    });
});
