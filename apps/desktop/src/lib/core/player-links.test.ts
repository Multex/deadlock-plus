import { beforeEach, describe, expect, it, vi } from "vitest";

const { openUrl, toastError } = vi.hoisted(() => ({ openUrl: vi.fn(), toastError: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: { error: toastError } }));
vi.mock("./opener", () => ({ openUrl }));

import { t } from "./i18n.svelte";
import {
    buildlockerBuildUrl,
    hasProfile,
    openBuildOnBuildlocker,
    openProfile,
    parseSteamId,
    profileUrl,
    steam32ToSteam64,
    steam64ToSteam32,
} from "./player-links";

describe("id conversion", () => {
    it("converts between steam64 and steam32 above 2^53", () => {
        expect(steam64ToSteam32("76561198347512100")).toBe("387246372");
        expect(steam32ToSteam64("387246372")).toBe("76561198347512100");
    });

    it("round-trips an id", () => {
        expect(steam64ToSteam32(steam32ToSteam64("29715818")!)).toBe("29715818");
    });

    it("steam32ToSteam64 returns null for junk", () => {
        expect(steam32ToSteam64("abc")).toBeNull();
        expect(steam32ToSteam64("")).toBeNull();
        expect(steam32ToSteam64("-5")).toBeNull();
    });
});

describe("parseSteamId", () => {
    it("accepts a steam64", () => expect(parseSteamId("76561198347512100")).toBe("76561198347512100"));
    it("accepts a steam32", () => expect(parseSteamId("387246372")).toBe("76561198347512100"));
    it("accepts a SteamID3", () => expect(parseSteamId("[U:1:387246372]")).toBe("76561198347512100"));
    it("accepts a profile link", () =>
        expect(parseSteamId("https://steamcommunity.com/profiles/76561198347512100/")).toBe("76561198347512100"));
    it("trims whitespace", () => expect(parseSteamId("  387246372 ")).toBe("76561198347512100"));
    it("rejects a vanity link and junk", () => {
        expect(parseSteamId("https://steamcommunity.com/id/someone")).toBeNull();
        expect(parseSteamId("nope")).toBeNull();
        expect(parseSteamId("")).toBeNull();
    });
});

describe("hasProfile", () => {
    it.each([null, undefined, 0])("is false for %s", (id) => expect(hasProfile(id)).toBe(false));
    it("is true for a real account id", () => expect(hasProfile(387246372)).toBe(true));
});

describe("profile URLs", () => {
    it("links the Steam community profile by SteamID64", () => {
        expect(profileUrl("steam", 387246372)).toBe("https://steamcommunity.com/profiles/76561198347512100");
    });

    it("links the Statlocker matches page by account id", () => {
        expect(profileUrl("statlocker", 387246372)).toBe("https://statlocker.gg/profile/387246372/matches");
    });

    it("links the Buildlocker creator page by account id", () => {
        expect(profileUrl("buildlocker", 29715818)).toBe("https://buildlocker.gg/builds/profile/29715818");
    });

    it("links a build on Buildlocker by hero build id", () => {
        expect(buildlockerBuildUrl(836523)).toBe("https://buildlocker.gg/builds/build/836523");
    });
});

describe("openProfile", () => {
    beforeEach(() => {
        openUrl.mockReset();
        toastError.mockReset();
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("tries the Steam client before the browser", async () => {
        const open = vi.fn().mockResolvedValue(undefined);
        await openProfile("steam", 387246372, open);
        expect(open).toHaveBeenCalledExactlyOnceWith(
            "steam://openurl/https://steamcommunity.com/profiles/76561198347512100",
        );
    });

    it("falls back to the browser when Steam does not answer", async () => {
        const open = vi.fn().mockRejectedValueOnce(new Error("no handler")).mockResolvedValueOnce(undefined);
        await openProfile("steam", 387246372, open);
        expect(open).toHaveBeenLastCalledWith("https://steamcommunity.com/profiles/76561198347512100");
        expect(toastError).not.toHaveBeenCalled();
    });

    it("opens Statlocker in the browser", async () => {
        const open = vi.fn().mockResolvedValue(undefined);
        await openProfile("statlocker", 387246372, open);
        expect(open).toHaveBeenCalledExactlyOnceWith("https://statlocker.gg/profile/387246372/matches");
    });

    it("uses the app opener by default", async () => {
        openUrl.mockResolvedValue(undefined);
        await openProfile("buildlocker", 29715818);
        expect(openUrl).toHaveBeenCalledExactlyOnceWith("https://buildlocker.gg/builds/profile/29715818");
    });

    it.each(["steam", "statlocker", "buildlocker"] as const)(
        "shows one plain toast and does not reject when %s cannot open",
        async (site) => {
            const open = vi.fn().mockRejectedValue(new Error("Not allowed"));
            await expect(openProfile(site, 387246372, open)).resolves.toBeUndefined();
            expect(toastError).toHaveBeenCalledExactlyOnceWith(t("common.link_open_failed"));
        },
    );
});

describe("openBuildOnBuildlocker", () => {
    beforeEach(() => {
        toastError.mockReset();
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("opens the build page", async () => {
        const open = vi.fn().mockResolvedValue(undefined);
        await openBuildOnBuildlocker(836523, open);
        expect(open).toHaveBeenCalledExactlyOnceWith("https://buildlocker.gg/builds/build/836523");
    });

    it("shows one plain toast and does not reject when it cannot open", async () => {
        const open = vi.fn().mockRejectedValue(new Error("Not allowed"));
        await expect(openBuildOnBuildlocker(836523, open)).resolves.toBeUndefined();
        expect(toastError).toHaveBeenCalledExactlyOnceWith(t("common.link_open_failed"));
    });
});
