import { describe, expect, it } from "vitest";
import { t } from "$lib/core/i18n.svelte";
import { updateLine } from "./status";

describe("updateLine", () => {
    it("names the new version when one is available", () => {
        expect(updateLine({ phase: "available", version: "0.2.0", progress: null, error: null })).toBe(
            "Version 0.2.0 is available.",
        );
    });

    it("shows a percentage while downloading", () => {
        expect(updateLine({ phase: "downloading", version: "0.2.0", progress: 0.426, error: null })).toBe(
            "Downloading 0.2.0 (43%). Deadlock+ restarts when it finishes.",
        );
    });

    it("omits the percentage when the size is unknown", () => {
        expect(updateLine({ phase: "downloading", version: "0.2.0", progress: null, error: null })).toBe(
            "Downloading 0.2.0. Deadlock+ restarts when it finishes.",
        );
    });

    it("names the step that failed without raw error text", () => {
        expect(updateLine({ phase: "error", version: null, progress: null, error: "check" })).toBe(
            t("updates.status.check_failed"),
        );
        expect(updateLine({ phase: "error", version: "0.2.0", progress: null, error: "download" })).toBe(
            t("updates.status.download_failed"),
        );
    });

    it("says a downloaded update waits for a restart", () => {
        expect(updateLine({ phase: "ready", version: "0.2.0", progress: 1, error: null })).toBe(
            "Version 0.2.0 is downloaded. Restart Deadlock+ to install it.",
        );
    });

    it("covers the quiet phases", () => {
        const base = { version: null, progress: null, error: null };
        expect(updateLine({ ...base, phase: "idle" })).toBe("Not checked yet.");
        expect(updateLine({ ...base, phase: "checking" })).toBe("Checking...");
        expect(updateLine({ ...base, phase: "upToDate" })).toBe("You're on the latest version.");
    });

    it("does not call a failed install a failed check", () => {
        expect(updateLine({ phase: "error", version: "0.2.0", progress: null, error: "install" })).toBe(
            t("updates.status.download_failed"),
        );
    });
});
