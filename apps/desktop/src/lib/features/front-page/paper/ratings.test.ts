import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import Ratings from "./ratings.svelte";

const rows = [
    { id: 3, letter: "A", name: "Kelvin", place: 3, placeLabel: "3rd of 12", own: true },
    { id: 1, letter: "A+", name: "Vindicta", place: 1, placeLabel: "1st of 12" },
    { id: 2, letter: "A", name: "Mo & Krill", place: 2, placeLabel: "2nd of 12" },
];

const items = (body: string) => [...body.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/g)];

describe("Ratings", () => {
    it("lists the critics in order of place", () => {
        const body = render(Ratings, { props: { rows } }).body;
        const names = items(body).map(([, , inner]) => /<b\b[^>]*>([^<]*)<\/b>/.exec(inner)![1]);
        expect(names).toEqual(["Vindicta", "Mo &amp; Krill", "Kelvin"]);
    });

    it("pairs each letter with its place line", () => {
        const body = render(Ratings, { props: { rows } }).body;
        const first = items(body)[0]![2];
        expect(first).toMatch(/class="letter[^"]*"[^>]*>A\+</);
        expect(first).toContain("1st of 12");
    });

    it("marks the viewer's rating", () => {
        const body = render(Ratings, { props: { rows } }).body;
        const own = items(body).filter(([, attrs]) => /class="[^"]*\bown\b/.test(attrs));
        expect(own.map(([, , inner]) => inner)).toEqual([expect.stringContaining("Kelvin")]);
    });
});
