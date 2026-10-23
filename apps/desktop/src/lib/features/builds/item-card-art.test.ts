import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { GameItem } from "@deadlock-plus/game-ui/item";
import ItemCard from "@deadlock-plus/game-ui/item-card/item-card.svelte";

const item: GameItem = {
    id: 1,
    name: "Extra Regen",
    slot: "vitality",
    tier: 1,
    cost: 800,
    active: false,
    imbue: false,
};

function openingTag(body: string, className: string): string {
    return new RegExp(`<[a-z]+ class="${className}[ "][^>]*>`).exec(body)?.[0] ?? "";
}

describe("ItemCard art", () => {
    // The game draws the art's drop shadow on the shop grid too, where the art is masked; a CSS mask would
    // clip a shadow drawn by the masked element itself.
    it("draws the art's drop shadow from an element outside the masked art", () => {
        const body = render(ItemCard, { props: { item, layout: "shop" } }).body;
        const shadow = openingTag(body, "art-shadow");
        expect(shadow).toContain("--icon-shadow");
        expect(openingTag(body, "art")).not.toContain("--icon-shadow");
        expect(body.indexOf(shadow)).toBeLessThan(body.indexOf(openingTag(body, "art")));
    });

    // `.recommendatations_hero_bg` is collapsed in the game's CSS and no rule shows it; the capture has none.
    it("draws the hero popularity badge without a star behind it", () => {
        const body = render(ItemCard, { props: { item, popular: { minimap: "/head.png" } } }).body;
        expect(openingTag(body, "popular")).not.toBe("");
        expect(openingTag(body, "star")).toBe("");
    });
});
