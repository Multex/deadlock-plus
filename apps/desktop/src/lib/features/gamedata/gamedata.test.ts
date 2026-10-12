import { beforeEach, describe, expect, it, vi } from "vitest";
import { command } from "$lib/core/tauri";
import {
    loadAbilityArt,
    loadHeroMinimapArt,
    loadItemArt,
    loadMapItems,
    loadMinimapArt,
    loadMinimapIcons,
} from "./gamedata";

vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(),
    fileSrc: (path: string) => `asset://${path}`,
}));

const invoke = vi.mocked(command);

beforeEach(() => {
    invoke.mockReset();
});

describe("loadItemArt", () => {
    it("maps class names to asset urls", async () => {
        invoke.mockResolvedValue([{ className: "upgrade_a", path: "C:/c/item_upgrade_a_icon.png" }]);
        const out = await loadItemArt(["upgrade_a", "upgrade_b"], "icon");
        expect(invoke).toHaveBeenCalledWith("game_item_art", { names: ["upgrade_a", "upgrade_b"], kind: "icon" });
        expect(out).toEqual({ upgrade_a: "asset://C:/c/item_upgrade_a_icon.png" });
    });

    it("asks for the shop image when told to", async () => {
        invoke.mockResolvedValue([]);
        await loadItemArt(["upgrade_a"], "shop");
        expect(invoke).toHaveBeenCalledWith("game_item_art", { names: ["upgrade_a"], kind: "shop" });
    });

    it("splits large requests into bounded batches and merges them", async () => {
        invoke.mockImplementation(async (_n, args) =>
            (args!.names as string[]).map((className) => ({ className, path: `p/${className}.png` })),
        );
        const names = Array.from({ length: 450 }, (_, i) => `upgrade_${i}`);
        const out = await loadItemArt(names, "icon");
        expect(invoke.mock.calls.map((c) => (c[1]!.names as string[]).length)).toEqual([200, 200, 50]);
        expect(Object.keys(out)).toHaveLength(450);
    });

    it("makes no call for no names", async () => {
        expect(await loadItemArt([], "icon")).toEqual({});
        expect(invoke).not.toHaveBeenCalled();
    });

    it("falls back to nothing when the command fails", async () => {
        invoke.mockRejectedValue(new Error("boom"));
        expect(await loadItemArt(["upgrade_a"], "icon")).toEqual({});
    });
});

describe("loadAbilityArt", () => {
    it("omits abilities the game has no raster icon for", async () => {
        invoke.mockResolvedValue([{ className: "ability_a", path: "p/ability_ability_a.png" }]);
        const out = await loadAbilityArt(["ability_a", "ability_svg"]);
        expect(invoke).toHaveBeenCalledWith("game_ability_art", { names: ["ability_a", "ability_svg"] });
        expect(out).toEqual({ ability_a: "asset://p/ability_ability_a.png" });
        expect(out.ability_svg).toBeUndefined();
    });
});

describe("loadMinimapArt", () => {
    it("returns the asset url, radius and source of a ready map", async () => {
        invoke.mockResolvedValue({ status: "ready", path: "C:/c/minimap_mid.png", radius: 10752, source: "local" });
        const out = await loadMinimapArt();
        expect(invoke).toHaveBeenCalledWith("game_minimap_art");
        expect(out).toEqual({ src: "asset://C:/c/minimap_mid.png", radius: 10752, source: "local" });
    });

    it("keeps the radius the download reported", async () => {
        invoke.mockResolvedValue({ status: "ready", path: "p/minimap_remote.png", radius: 9000, source: "remote" });
        expect(await loadMinimapArt()).toEqual({ src: "asset://p/minimap_remote.png", radius: 9000, source: "remote" });
    });

    it("is null when the map is unavailable", async () => {
        invoke.mockResolvedValue({ status: "unavailable", local: "noInstall" });
        expect(await loadMinimapArt()).toBeNull();
    });

    it("is null when the command fails", async () => {
        invoke.mockRejectedValue(new Error("boom"));
        expect(await loadMinimapArt()).toBeNull();
    });
});

describe("loadMapItems", () => {
    const payload = {
        source: "game",
        installedBuild: null,
        table: { schema: 1, buildId: 25841406, ventsCrc: 1, rows: [] },
    };

    it("returns the table the command resolved", async () => {
        invoke.mockResolvedValue(payload);
        expect(await loadMapItems()).toEqual(payload);
        expect(invoke).toHaveBeenCalledWith("game_map_items");
    });

    it("gives null when the command fails", async () => {
        invoke.mockRejectedValue(new Error("boom"));
        expect(await loadMapItems()).toBeNull();
    });
});

describe("loadHeroMinimapArt", () => {
    it("maps hero ids to the minimap head files and skips heroes without one", async () => {
        invoke.mockResolvedValue([
            { id: 1, sm: "p/1_sm.png", card: null, mm: "p/hero_a_mm.png" },
            { id: 2, sm: "p/2_sm.png", card: null, mm: null },
        ]);
        const out = await loadHeroMinimapArt();
        expect(invoke).toHaveBeenCalledWith("game_hero_art");
        expect(out).toEqual({ 1: "asset://p/hero_a_mm.png" });
    });

    it("is empty when the command fails", async () => {
        invoke.mockRejectedValue(new Error("boom"));
        expect(await loadHeroMinimapArt()).toEqual({});
    });
});

describe("loadMinimapIcons", () => {
    it("maps icon stems to asset urls and omits icons the game lacks", async () => {
        invoke.mockResolvedValue([{ icon: "boss_health", path: "p/minimap_icon_boss_health.png" }]);
        const out = await loadMinimapIcons(["boss_health", "neutral_vault"]);
        expect(invoke).toHaveBeenCalledWith("game_minimap_icons", { icons: ["boss_health", "neutral_vault"] });
        expect(out).toEqual({ boss_health: "asset://p/minimap_icon_boss_health.png" });
    });

    it("does not ask for nothing and drops duplicates", async () => {
        invoke.mockResolvedValue([]);
        expect(await loadMinimapIcons([])).toEqual({});
        expect(invoke).not.toHaveBeenCalled();
        await loadMinimapIcons(["player_cone", "player_cone"]);
        expect(invoke).toHaveBeenCalledWith("game_minimap_icons", { icons: ["player_cone"] });
    });

    it("is empty when the command fails", async () => {
        invoke.mockRejectedValue(new Error("boom"));
        expect(await loadMinimapIcons(["boss_health"])).toEqual({});
    });
});
