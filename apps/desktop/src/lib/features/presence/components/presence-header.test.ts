import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./presence-header.svelte", import.meta.url), "utf8");
const delaySlider =
    source.match(/<Slider[^>]*aria-label=\{t\("settings\.discord\.delay_label"\)\}[\s\S]*?\/>/)?.[0] ?? "";

describe("presence delay slider", () => {
    it("saves the delay once on release, not on every step of a drag", () => {
        expect(delaySlider).not.toBe("");
        const change = delaySlider.match(/onValueChange=\{[\s\S]*?\}\s*(?=\w+=|\/>)/)?.[0] ?? "";
        const commit = delaySlider.match(/onValueCommit=\{[\s\S]*?\}\s*(?=\w+=|\/>)/)?.[0] ?? "";
        expect(change).not.toMatch(/setPresence/);
        expect(commit).toMatch(/settings\.setPresence\(\{ delaySecs: v \}\)/);
    });
});
