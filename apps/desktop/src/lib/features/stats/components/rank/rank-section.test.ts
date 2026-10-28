import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import { subrankAt, type RankPoint, type RankTier } from "@deadlock-plus/stats/rank";
import RankSection from "./rank-section.svelte";

const flat = subrankAt(0).span * 3 + 120;
const at = subrankAt(flat);
const ranks: RankTier[] = [1, 2, 3].map((tier) => ({ tier, name: `Tier ${tier}`, color: "#fff", image: null }));
const track: RankPoint[] = [
    {
        matchId: 1,
        heroId: 1,
        startTime: 1,
        badge: at.tier * 10 + at.sub,
        delta: 30,
        outcome: "win",
        demotionProtected: false,
    },
];

describe("rank section", () => {
    it("names the progress bar after the rank it climbs to", () => {
        const body = render(RankSection, {
            props: {
                info: {
                    badge: at.tier * 10 + at.sub,
                    finalFlat: flat,
                    shieldsLeft: null,
                    placementLeft: null,
                    lastMatchId: null,
                },
                track,
                ranks,
                chart: null,
                shown: 0,
            },
        }).body;
        const bar = body.match(/<div[^>]*role="progressbar"[^>]*>/)?.[0] ?? "";
        expect(bar).not.toBe("");
        expect(bar).toMatch(/aria-label="Progress to Tier \d+ \d"/);
    });
});
