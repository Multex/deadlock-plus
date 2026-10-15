import { describe, expect, it, vi } from "vitest";
import {
    ONBOARDING_VERSION,
    defaultExtras,
    extrasPresence,
    featureGroups,
    finishOnboarding,
    gameStatus,
    ingestDecision,
    isReturningUser,
    needsOnboarding,
    nextStep,
    previousStep,
    stepsFor,
} from "./onboarding";

describe("needsOnboarding", () => {
    it("runs when nothing was stored", () => {
        expect(needsOnboarding(undefined)).toBe(true);
        expect(needsOnboarding(null)).toBe(true);
    });

    it("runs again for an older or invalid version", () => {
        expect(needsOnboarding(0)).toBe(true);
        expect(needsOnboarding(ONBOARDING_VERSION - 1)).toBe(true);
        expect(needsOnboarding("1" as unknown as number)).toBe(true);
    });

    it("stays away at the current version or newer", () => {
        expect(needsOnboarding(ONBOARDING_VERSION)).toBe(false);
        expect(needsOnboarding(ONBOARDING_VERSION + 1)).toBe(false);
    });

    it("is at version 2, so everyone who finished version 1 sees the new opt-ins", () => {
        expect(ONBOARDING_VERSION).toBe(2);
        expect(needsOnboarding(1)).toBe(true);
    });
});

describe("isReturningUser", () => {
    it("is true only for the legacy flag set to true", () => {
        expect(isReturningUser(true)).toBe(true);
        expect(isReturningUser(false)).toBe(false);
        expect(isReturningUser(null)).toBe(false);
        expect(isReturningUser(undefined)).toBe(false);
    });
});

describe("gameStatus", () => {
    it("reports the install folder when found", () => {
        expect(gameStatus("C:\Steam\Deadlock")).toEqual({ found: true, path: "C:\Steam\Deadlock" });
    });

    it("reports a miss for null, undefined and empty", () => {
        for (const dir of [null, undefined, ""]) expect(gameStatus(dir)).toEqual({ found: false, path: null });
    });
});

describe("stepsFor", () => {
    const order = ["welcome", "features", "permissions", "steam", "sharing", "extras", "done"];

    it("lists the seven steps in order on every platform", () => {
        for (const platform of ["windows", "macos", "linux"] as const) {
            expect(stepsFor(platform).map((s) => s.id)).toEqual(order);
        }
    });

    it("titles the permissions step per platform", () => {
        const title = (p: "windows" | "macos" | "linux") => stepsFor(p).find((s) => s.id === "permissions")?.title;
        expect(title("windows")).toBe("Why Windows asks for permission");
        expect(title("macos")).toBe("Running on macOS");
        expect(title("linux")).toBe("Running on Linux");
    });
});

describe("step navigation", () => {
    it("clamps at both ends", () => {
        expect(previousStep(0)).toBe(0);
        expect(nextStep(6, 7)).toBe(6);
        expect(nextStep(2, 7)).toBe(3);
        expect(previousStep(3)).toBe(2);
    });
});

describe("featureGroups", () => {
    it("groups every feature once under Play, Progress, News and Housekeeping", () => {
        expect(featureGroups().map((g) => g.title)).toEqual(["Play", "Progress", "News", "Housekeeping"]);
        const ids = featureGroups().flatMap((g) => g.items.map((i) => i.id));
        expect(ids).toEqual([
            "server-picker",
            "live",
            "presence",
            "stats",
            "rank",
            "sessions",
            "alerts",
            "voice-bans",
            "demos",
            "performance",
        ]);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("finishOnboarding", () => {
    it("writes the current version", async () => {
        const write = vi.fn().mockResolvedValue(undefined);
        await finishOnboarding(write);
        expect(write).toHaveBeenCalledWith(ONBOARDING_VERSION);
    });

    it("swallows a failed write so the user is not trapped", async () => {
        const write = vi.fn().mockRejectedValue(new Error("no store"));
        await expect(finishOnboarding(write)).resolves.toBeUndefined();
    });
});

describe("ingestDecision", () => {
    it("maps the two buttons to a consent answer", () => {
        expect(ingestDecision("share")).toBe(true);
        expect(ingestDecision("decline")).toBe(false);
    });

    it("leaves consent unanswered when skipped", () => {
        expect(ingestDecision(null)).toBeNull();
    });
});

describe("extras", () => {
    it("start all off, Discord included", () => {
        const extras = defaultExtras();
        expect(Object.values(extras).every((on) => on === false)).toBe(true);
        expect(extras.showOnDiscord).toBe(false);
    });

    it("turn presence on at Detailed when Show on Discord is on", () => {
        expect(extrasPresence({ ...defaultExtras(), showOnDiscord: true })).toEqual({ level: "detailed" });
    });

    it("leave presence alone when Show on Discord is off", () => {
        expect(extrasPresence(defaultExtras())).toBeNull();
    });
});
