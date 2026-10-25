import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import ObjectivesStrip from "./objectives-strip.svelte";
import { placeMarks } from "./objectives";
import type { ObjectiveMark } from "./types";

const teamNames = { "hidden-king": "The Hidden King", archmother: "The Archmother" } as const;

const mark = (id: string, timeS: number, team: ObjectiveMark["team"], short = "G"): ObjectiveMark => ({
    id,
    timeS,
    team,
    short,
    label: short === "G" ? "Guardian" : "Walker",
});

describe("placeMarks", () => {
    it("places each mark at its share of the match", () => {
        const placed = placeMarks([mark("a", 450, "archmother"), mark("b", 1350, "archmother")], 1800, 0.05);
        expect(placed.map((m) => m.at)).toEqual([25, 75]);
    });

    it("stacks marks that would overlap into the next row", () => {
        const placed = placeMarks(
            [mark("a", 900, "archmother"), mark("b", 920, "archmother"), mark("c", 1600, "archmother")],
            1800,
            0.05,
        );
        expect(placed.map((m) => m.row)).toEqual([0, 1, 0]);
    });
});

describe("ObjectivesStrip", () => {
    it("draws each team's marks on its own side of the time axis, placed by time", () => {
        const body = render(ObjectivesStrip, {
            props: {
                marks: [mark("hk", 900, "hidden-king", "W"), mark("am", 450, "archmother")],
                durationS: 1800,
                teamNames,
            },
        }).body;
        const up = /class="side up[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(body)![1]!;
        const down = /class="side down[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(body)![1]!;
        expect(up).toMatch(/style="left: 50%;[^"]*"[^>]*>W</);
        expect(down).toMatch(/style="left: 25%;[^"]*"[^>]*>G</);
        expect(up).not.toContain(">G<");
    });

    it("labels the axis with the match length", () => {
        const body = render(ObjectivesStrip, { props: { marks: [], durationS: 1916, teamNames } }).body;
        expect(body).toContain(">31:56<");
    });
});
