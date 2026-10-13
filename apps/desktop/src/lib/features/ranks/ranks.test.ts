import { describe, expect, it, vi } from "vitest";
import type { RankArt } from "@deadlock-plus/ipc-types/RankArt";
import type { RankTier } from "@deadlock-plus/stats/rank";
import { apiForm, mergeRankTiers, rankNames } from "./ranks";

vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(),
    fileSrc: (path: string) => `asset://${path}`,
}));

function tier(over: Partial<RankTier> & { tier: number }): RankTier {
    return { name: `Tier ${over.tier}`, color: "#111", image: null, ...over };
}

function art(over: Partial<RankArt> & { tier: number }): RankArt {
    return { lg: null, chalk: null, ...over };
}

describe("mergeRankTiers", () => {
    it("shows the local badge and keeps the API url as the fallback", () => {
        const out = mergeRankTiers(
            [tier({ tier: 5, image: "https://api/5.webp" })],
            [art({ tier: 5, lg: "C:/a/rank05_lg.png" })],
        );
        expect(out).toEqual([
            {
                tier: 5,
                name: "Tier 5",
                color: "#111",
                image: "asset://C:/a/rank05_lg.png",
                apiImage: "https://api/5.webp",
            },
        ]);
    });

    it("fills a tier the API has no image for", () => {
        const out = mergeRankTiers([tier({ tier: 11, image: null })], [art({ tier: 11, lg: "p/rank11_lg.png" })]);
        expect(out[0].image).toBe("asset://p/rank11_lg.png");
        expect(out[0].apiImage).toBeNull();
    });

    it("keeps the API image when the game has no large badge", () => {
        const out = mergeRankTiers(
            [tier({ tier: 2, image: "https://api/2.webp" })],
            [art({ tier: 2, chalk: "p/c.png" })],
        );
        expect(out[0].image).toBe("https://api/2.webp");
        expect(out[0].apiImage).toBe("https://api/2.webp");
    });

    it("never invents a tier the API does not name", () => {
        const out = mergeRankTiers([tier({ tier: 1 })], [art({ tier: 9, lg: "p/rank09_lg.png" })]);
        expect(out.map((t) => t.tier)).toEqual([1]);
    });

    it("leaves tiers untouched without local art", () => {
        const api = [tier({ tier: 1, image: "https://api/1.webp" })];
        expect(mergeRankTiers(api, [])).toEqual([{ ...api[0], apiImage: "https://api/1.webp" }]);
    });
});

describe("apiForm", () => {
    it("restores the remote image so saved data never holds a game-cache path", () => {
        const merged = mergeRankTiers(
            [tier({ tier: 5, image: "https://api/5.webp" })],
            [art({ tier: 5, lg: "p/rank05_lg.png" })],
        );
        expect(apiForm(merged)).toEqual([tier({ tier: 5, image: "https://api/5.webp" })]);
    });

    it("leaves tiers that were never merged as they are", () => {
        const plain = [tier({ tier: 3, image: "https://api/3.webp" })];
        expect(apiForm(plain)).toEqual(plain);
    });
});

describe("rankNames", () => {
    it("maps tier to name and skips unnamed tiers", () => {
        expect(rankNames([tier({ tier: 1, name: "Initiate" }), tier({ tier: 2, name: "" })])).toEqual({
            1: "Initiate",
        });
    });
});
