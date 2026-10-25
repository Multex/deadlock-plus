import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import BoxScore from "./box-score.svelte";
import type { BoxTeam } from "./types";

const row = (id: number, hero: string, own = false) => ({
    id,
    hero,
    kills: id,
    deaths: 2,
    assists: 3,
    netWorth: 38341,
    grade: "A",
    own,
});

const teams: BoxTeam[] = [
    { team: "archmother", name: "The Archmother", result: "Win", rows: [row(1, "Paradox"), row(2, "Kelvin", true)] },
    { team: "hidden-king", name: "The Hidden King", rows: [row(7, "Viscous")] },
];

const html = () => render(BoxScore, { props: { teams } }).body;
const playerRows = (body: string) =>
    [...body.matchAll(/<div\b([^>]*\brole="row"[^>]*)>([\s\S]*?)<\/div>/g)].filter(([, , cells]) =>
        cells.includes('role="cell"'),
    );
const text = (s: string) =>
    s
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

describe("BoxScore", () => {
    it("highlights only the viewer's row", () => {
        const own = playerRows(html()).filter(([, attrs]) => /class="[^"]*\bown\b/.test(attrs));
        expect(own).toHaveLength(1);
        expect(own[0]![2]).toContain("Kelvin");
        expect(own[0]![1]).toContain('aria-current="true"');
    });

    it("prints K/D/A, compact net worth and the grade in each row", () => {
        const kelvin = playerRows(html()).find(([, , cells]) => cells.includes("Kelvin"))![2];
        expect(text(kelvin)).toBe("Kelvin 2/2/3 38.3K A");
    });

    it("captions each team with its result when given", () => {
        const captions = [...html().matchAll(/<p class="caption[^"]*"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]!));
        expect(captions).toEqual(["The Archmother · Win", "The Hidden King"]);
    });

    it("names each team's table by its caption", () => {
        const body = html();
        const tables = [...body.matchAll(/role="table" aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
        expect(tables).toHaveLength(2);
        for (const id of tables) expect(body).toContain(`id="${id}"`);
    });
});
