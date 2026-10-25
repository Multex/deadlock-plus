import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import Masthead from "./masthead.svelte";
import TeamScore from "./team-score.svelte";

const base = {
    name: "Deadlock+ Dispatch",
    date: "Mon, Oct 12, 2026",
    edition: "Extra! · No. 1",
    detail: "Ranked",
};

describe("Masthead", () => {
    it("shows the weather ear only when there is a forecast", () => {
        const withWeather = render(Masthead, {
            props: { ...base, weather: { forecast: "Clear skies", lines: ["39 ms avg"] } },
        }).body;
        const without = render(Masthead, { props: base }).body;
        expect(withWeather).toMatch(/class="ear[^"]*"[\s\S]*Clear skies[\s\S]*39 ms avg/);
        expect(without).not.toContain('class="ear');
    });

    it("prints the dateline in order: date, edition, detail", () => {
        const body = render(Masthead, { props: base }).body;
        const order = ["Mon, Oct 12, 2026", "Extra! · No. 1", "Ranked"].map((s) => body.indexOf(s));
        expect(order.every((i) => i > 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
    });
});

describe("TeamScore", () => {
    it("prints both kill totals in the order given, in team ink", () => {
        const body = render(TeamScore, {
            props: {
                teams: [
                    { team: "archmother", name: "The Archmother", kills: 34 },
                    { team: "hidden-king", name: "The Hidden King", kills: 28 },
                ],
            },
        }).body;
        expect(body.indexOf(">34<")).toBeGreaterThan(0);
        expect(body.indexOf(">34<")).toBeLessThan(body.indexOf(">28<"));
        expect(body).toMatch(/class="team archmother[^"]*"[\s\S]*>34</);
    });
});
