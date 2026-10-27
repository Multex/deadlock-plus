import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import { labelInName } from "$lib/core/label-in-name";
import type { HeroKit } from "../../../build-detail.svelte";
import SequenceTrack from "./sequence-track.svelte";

const kit: HeroKit = {
    abilities: new Map([
        [1, { id: 1, name: "Afterburn", art: "https://assets/afterburn.png" }],
        [2, { id: 2, name: "Napalm", art: "https://assets/napalm.png" }],
    ]),
    ultimateId: null,
    levels: [],
};
const steps = [
    { abilityId: 1, tier: 0, level: 1 },
    { abilityId: 1, tier: 1, level: 2 },
    { abilityId: 2, tier: 0, level: 3 },
];

function chips(readonly: boolean) {
    const body = render(SequenceTrack, { props: { steps, kit, readonly } }).body;
    return [...body.matchAll(/<(button|span) ([^>]*data-step-chip[^>]*)>/g)].map((open) => {
        const tag = open[1];
        const from = open.index + open[0].length;
        let depth = 1;
        let close = from;
        for (const m of body.slice(from).matchAll(new RegExp(`<${tag}[ >]|</${tag}>`, "g"))) {
            depth += m[0].startsWith("</") ? -1 : 1;
            if (depth === 0) {
                close = from + m.index;
                break;
            }
        }
        return { name: open[2].match(/aria-label="([^"]*)"/)![1], inner: body.slice(from, close) };
    });
}

describe("ability step chips", () => {
    it.each([false, true])("hold their visible step number and kind in their name (readonly %s)", (readonly) => {
        const found = chips(readonly);
        expect(found).toHaveLength(steps.length);
        for (const chip of found) expect(labelInName(chip.name, chip.inner), chip.name).toBe(true);
        expect(found[0].name).toContain("Afterburn");
    });
});
