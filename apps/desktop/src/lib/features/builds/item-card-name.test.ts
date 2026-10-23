import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { GameItem } from "@deadlock-plus/game-ui/item";
import ItemCard from "@deadlock-plus/game-ui/item-card/item-card.svelte";

const item: GameItem = {
    id: 1,
    name: "Extra Charge",
    slot: "spirit",
    tier: 2,
    cost: 1250,
    active: false,
    imbue: false,
};

function nameText(body: string): string {
    const name = /<span class="name[ "][^>]*>([\s\S]*?)<\/span>\s*<\/span>/.exec(body)?.[1] ?? "";
    return name.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "");
}

describe("ItemCard name", () => {
    it("keeps the spaces between the lines it wraps a name over", () => {
        const body = render(ItemCard, { props: { item } }).body;
        expect(body.match(/class="line[ "]/g)?.length).toBeGreaterThan(1);
        expect(nameText(body)).toBe("Extra Charge");
    });
});
