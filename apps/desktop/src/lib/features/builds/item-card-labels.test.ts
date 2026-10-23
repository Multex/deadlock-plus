import { describe, expect, it } from "vitest";
import type { ComponentProps } from "svelte";
import { render } from "svelte/server";
import type { GameItem } from "@deadlock-plus/game-ui/item";
import ItemCard from "@deadlock-plus/game-ui/item-card/item-card.svelte";
import LabelHost from "./item-card-label-host.test.svelte";

const item: GameItem = { id: 1, name: "Item", slot: "weapon", tier: 2, cost: 500, active: true, imbue: true };

function html(props: ComponentProps<typeof ItemCard>): string {
    return render(LabelHost, { props }).body;
}

describe("ItemCard labels", () => {
    it("reads the New, Imbue and Active labels from the game text context", () => {
        const body = html({ item, isNew: true, showActiveTag: true });
        expect(body).toContain("[game_ui.item_card.new]");
        expect(body).toContain("[builds.shop.imbue]");
        expect(body).toContain("[game_ui.item_tooltip.active]");
    });

    it("reads the removed label from the game text context", () => {
        expect(html({ item: undefined })).toContain("[builds.shop.removed_item]");
    });
});
