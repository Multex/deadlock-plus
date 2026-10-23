import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { ItemDetails, StatChange } from "@deadlock-plus/game-ui/hero";
import type { GameItem } from "@deadlock-plus/game-ui/item";
import { itemTooltipModel, type BuildNoteInput } from "@deadlock-plus/game-ui/item-tooltip/model";
import ItemTooltip from "@deadlock-plus/game-ui/item-tooltip/item-tooltip.svelte";

const emblem: GameItem = {
    id: 1,
    name: "Enchanter's Emblem",
    slot: "vitality",
    tier: 2,
    cost: 1600,
    active: false,
    imbue: false,
};

function change(key: string, label: string, before: number, after: number): StatChange {
    return { key, label, before, after, decimals: 0, postfix: null };
}

// Enchanter's Emblem on Graves (capture 9Rl7z9P8wb), cut to one group of each kind.
const details: ItemDetails = {
    groups: [
        { kind: "ability", icon: "skull.png", changes: [change("a", "Damage", 56, 59)] },
        { kind: "ability", icon: "hands.png", imbued: true, changes: [change("b", "Wall Length", 32, 33)] },
        { kind: "item", icon: "scourge.png", changes: [change("c", "Bleed Damage", 3, 3)] },
        { kind: "stat", icon: "resist.png", changes: [change("d", "Spirit Resist", 55, 63)] },
    ],
    condition: null,
    phases: [],
};

function panel(buildNote: BuildNoteInput | null = null): string {
    const model = itemTooltipModel({ item: emblem, sections: [], detailView: true, details, buildNote });
    const body = render(ItemTooltip, { props: { model } }).body;
    return body.slice(body.indexOf('<div class="panel'));
}

function groups(html: string): string[] {
    return html.split(/(?=<div class="group[ "])/).slice(1);
}

describe("ALT column groups", () => {
    // Capture 9Rl7z9P8wb: the Spirit Resist shield is offBlack (#0e110a-#13140c) with no disc, like an ability glyph.
    it("draws an ability's glyph in a disc, an owned item's art, and a stat's glyph bare", () => {
        const [skull, hands, scourge, resist] = groups(panel());
        expect(skull).toMatch(/<span class="icon ability[ "]/);
        expect(skull).toMatch(/class="glyph[ "][^>]*skull\.png/);
        expect(skull).not.toContain("<img");
        expect(hands).toMatch(/<span class="icon ability[ "]/);
        expect(scourge).toMatch(/<span class="icon item[ "]/);
        expect(scourge).toMatch(/<img[^>]*src="scourge\.png"/);
        expect(resist).toMatch(/<span class="icon stat[ "]/);
        expect(resist).toMatch(/class="glyph[ "][^>]*resist\.png/);
        expect(resist).not.toContain("<img");
    });

    it("backs only the imbued ability's group in the spirit colour", () => {
        const tags = groups(panel()).map((g) => g.slice(0, g.indexOf(">")));
        expect(tags.map((tag) => tag.includes("imbued"))).toEqual([false, true, false, false]);
    });

    it("labels the header Modifies only when the build has a note on the item", () => {
        const heading = (html: string) => /<div class="header[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
        expect(heading(panel({ text: "Green Imp spirit" }))).toContain("game_ui.item_tooltip.modifies");
        expect(heading(panel())).not.toContain("modifies");
        const labelled = /<div class="header[^"]*[ "]labelled[ "]/;
        expect(panel({ text: "Green Imp spirit" })).toMatch(labelled);
        expect(panel()).not.toMatch(labelled);
    });
});
