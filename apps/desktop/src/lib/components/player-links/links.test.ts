import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChartNoAxesColumn, Hammer, User } from "@lucide/svelte";

const { openProfile } = vi.hoisted(() => ({ openProfile: vi.fn() }));
vi.mock("$lib/core/player-links", () => ({
    hasProfile: (id: number | null | undefined) => typeof id === "number" && id > 0,
    openProfile,
}));

import { t } from "$lib/core/i18n.svelte";
import { profileLinks } from "./links";

describe("profileLinks", () => {
    beforeEach(() => {
        openProfile.mockReset();
        openProfile.mockResolvedValue(undefined);
    });

    it("lists Steam then Statlocker by default", () => {
        expect(profileLinks("Ash", 42).map((l) => l.site)).toEqual(["steam", "statlocker"]);
    });

    it("follows the order of the sites it is given", () => {
        const sites = ["buildlocker", "steam", "statlocker"] as const;
        expect(profileLinks("Ash", 42, sites).map((l) => l.site)).toEqual(sites);
    });

    it("names each link with the player's name", () => {
        const links = profileLinks("Ash", 42, ["steam", "statlocker", "buildlocker"]);
        expect(links.map((l) => l.label)).toEqual([
            t("player_links.steam_of", { name: "Ash" }),
            t("player_links.statlocker_of", { name: "Ash" }),
            t("player_links.buildlocker_of", { name: "Ash" }),
        ]);
        expect(links[0].label).toContain("Ash");
    });

    it("uses the site's menu text and icon", () => {
        const links = profileLinks("Ash", 42, ["steam", "statlocker", "buildlocker"]);
        expect(links.map((l) => l.text)).toEqual([
            t("player_links.steam"),
            t("player_links.statlocker"),
            t("player_links.buildlocker"),
        ]);
        expect(links.map((l) => l.icon)).toEqual([User, ChartNoAxesColumn, Hammer]);
    });

    it("is empty for a player without a profile", () => {
        expect(profileLinks("Bot", 0)).toEqual([]);
        expect(profileLinks("Anon", null)).toEqual([]);
        expect(profileLinks("Anon", undefined)).toEqual([]);
    });

    it("opens the link's site for the player's account", async () => {
        const [steam, buildlocker] = profileLinks("Ash", 42, ["steam", "buildlocker"]);
        await buildlocker.open();
        expect(openProfile).toHaveBeenCalledWith("buildlocker", 42);
        await steam.open();
        expect(openProfile).toHaveBeenLastCalledWith("steam", 42);
        expect(openProfile).toHaveBeenCalledTimes(2);
    });
});
