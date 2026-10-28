import { describe, expect, it } from "vitest";
import { byteProgress, failureStep, releaseHighlights, updateStage } from "./flow";
import { PREVIEW_STATES, parseUpdatePreview, previewSource } from "./preview";

describe("parseUpdatePreview", () => {
    it("reads the state and channel from the first URL", () => {
        expect(parseUpdatePreview("?demo=default&update-state=ready&update-channel=nightly")).toEqual({
            state: "ready",
            channel: "nightly",
        });
    });

    it("keeps the live updater for missing or unknown values", () => {
        expect(parseUpdatePreview("")).toEqual({ state: null, channel: null });
        expect(parseUpdatePreview("?update-state=exploded&update-channel=alpha")).toEqual({
            state: null,
            channel: null,
        });
    });
});

describe("previewSource", () => {
    it("puts the updater in the state it names", () => {
        expect(updateStage(previewSource("available", "0.14.0"))).toBe("available");
        expect(updateStage(previewSource("downloading", "0.14.0"))).toBe("downloading");
        expect(updateStage(previewSource("ready", "0.14.0"))).toBe("ready");
        expect(updateStage(previewSource("up-to-date", "0.14.0"))).toBe("upToDate");
        expect(failureStep(previewSource("failed", "0.14.0"))).toBe("download");
        expect(failureStep(previewSource("check-failed", "0.14.0"))).toBe("check");
    });

    it("offers the next minor version with notes that have headlines", () => {
        const s = previewSource("available", "0.14.0");
        expect(s.version).toBe("0.15.0");
        expect(releaseHighlights(s.version!, s.notes).headlines.length).toBeGreaterThan(1);
    });

    it("is part way through a download with real byte counts", () => {
        const { fraction, received, total } = byteProgress(previewSource("downloading", "0.14.0"));
        expect(fraction).toBeGreaterThan(0.1);
        expect(fraction).toBeLessThan(0.9);
        expect(received).toBeGreaterThan(0);
        expect(total).toBeGreaterThan(received!);
        expect(previewSource("downloading", "0.14.0").speed).toBeGreaterThan(0);
    });

    it("covers every state the brief asks to show", () => {
        expect([...PREVIEW_STATES].sort()).toEqual(
            ["available", "check-failed", "downloading", "failed", "ready", "up-to-date"].sort(),
        );
    });
});
