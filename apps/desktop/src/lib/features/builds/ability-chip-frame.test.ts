import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { AbilityTooltipModel, ChipView } from "@deadlock-plus/game-ui/ability-tooltip/model";
import AbilityTooltip from "@deadlock-plus/game-ui/ability-tooltip/ability-tooltip.svelte";

function chip(key: string): ChipView {
    return {
        key,
        icon: null,
        value: { prefix: "", number: "6", postfix: "s" },
        label: key,
        scaling: null,
        style: null,
        scaled: false,
    };
}

const model: AbilityTooltipModel = {
    name: "Feed The Birds",
    chips: [chip("AbilityChannelTime"), chip("AbilityCastRange")],
    charges: chip("AbilityCharges"),
    chargeCooldown: chip("AbilityCooldownBetweenCharge"),
    cooldown: chip("AbilityCooldown"),
    sections: [],
    upgrades: [],
    text: {
        statusEffect: { key: "status", params: {}, game: null },
        recommended: { key: "recommended", params: {}, game: null },
    },
};

function chipTags(html: string): string[] {
    return html.match(/<span class="chip[^"]*"/g) ?? [];
}

describe("ability tooltip header chips", () => {
    // `#HeaderAttributesContainer AbilityPropertyPanel` alone carries the 2 px border; the charges and
    // cooldown chips on the right have none, so they come out narrower around the same content.
    it("frames only the chips under the name", () => {
        const body = render(AbilityTooltip, { props: { model } }).body;
        const [left, right] = body.split('<div class="right');
        expect(chipTags(left).length).toBe(2);
        expect(chipTags(left).every((tag) => tag.includes("framed"))).toBe(true);
        expect(chipTags(right).length).toBe(3);
        expect(chipTags(right).some((tag) => tag.includes("framed"))).toBe(false);
    });
});
