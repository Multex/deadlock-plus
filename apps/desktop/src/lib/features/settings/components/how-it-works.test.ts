import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import HowItWorks from "./how-it-works.svelte";

function html(points: string[]): string {
    return render(HowItWorks, { props: { points } }).body;
}

describe("HowItWorks", () => {
    it("is a closed details disclosure with a summary", () => {
        const body = html(["One.", "Two."]);
        expect(body).toMatch(/^(<!--.*?-->)*<details\b(?![^>]*\bopen\b)[^>]*>\s*(<!--.*?-->)*<summary\b/s);
        expect(body).not.toContain("aria-expanded");
    });

    it("lists each point as a list item", () => {
        const body = html(["Finds the match.", "Sends only that."]);
        const items = [...body.matchAll(/<li\b[^>]*>(.*?)<\/li>/gs)].map((m) => m[1]);
        expect(items).toEqual(["Finds the match.", "Sends only that."]);
        expect(body.indexOf("<ul")).toBeGreaterThan(body.indexOf("</summary>"));
        expect(body.indexOf("</ul>")).toBeLessThan(body.indexOf("</details>"));
    });
});
