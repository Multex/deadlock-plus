import { describe, expect, it } from "vitest";
import { indicatorLabel, stageBody, stageKicker } from "./copy";

const base = { phase: "idle", version: null, progress: null, error: null };

describe("stageKicker", () => {
    it("names where the update is", () => {
        expect(stageKicker({ ...base, phase: "available", version: "0.15.0" })).toBe("Update available");
        expect(stageKicker({ ...base, phase: "ready", version: "0.15.0" })).toBe("Ready to install");
    });

    it("tells a failed check from a failed download", () => {
        expect(stageKicker({ ...base, phase: "error", error: "check" })).toBe("Can't check right now");
        expect(stageKicker({ ...base, phase: "error", error: "download" })).toBe("Update paused");
    });
});

describe("stageBody", () => {
    it("names the installed version when the user is up to date", () => {
        expect(stageBody({ ...base, phase: "upToDate" }, "0.14.0")).toBe(
            "Deadlock+ 0.14.0 is the newest build on your channel.",
        );
        expect(stageBody({ ...base, phase: "upToDate" }, null)).toBe("You have the newest build on your channel.");
    });

    it("tells a failed install from a failed download", () => {
        expect(stageBody({ ...base, phase: "error", error: "install" }, "0.14.0")).toBe(
            "The installer didn't finish, so Deadlock+ is still on the version you had. Try again, or get the installer yourself.",
        );
        expect(stageKicker({ ...base, phase: "error", error: "install" })).toBe("Update paused");
    });

    it("words the title bar label for any failure that is not a check", () => {
        expect(indicatorLabel({ ...base, phase: "error", error: "install", version: "0.15.0" })).toBe(
            "Update 0.15.0 didn't finish",
        );
    });

    it("reassures after a failed download", () => {
        expect(stageBody({ ...base, phase: "error", error: "download" }, "0.14.0")).toBe(
            "Nothing on your PC changed. Try again, or get the installer yourself.",
        );
    });
});

describe("indicatorLabel", () => {
    it("reads the download's percentage when it is known", () => {
        expect(indicatorLabel({ ...base, phase: "downloading", version: "0.15.0", progress: 0.426 })).toBe(
            "Downloading update, 43%",
        );
        expect(indicatorLabel({ ...base, phase: "downloading", version: "0.15.0" })).toBe("Downloading update");
    });

    it("names the version on offer", () => {
        expect(indicatorLabel({ ...base, phase: "available", version: "0.15.0" })).toBe(
            "Deadlock+ 0.15.0 is available",
        );
    });
});
