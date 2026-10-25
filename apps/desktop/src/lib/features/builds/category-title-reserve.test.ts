import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import CategoryTitle from "./category-title-host.test.svelte";

const category = {
    name: "Situational",
    description: "Buy into what they build.",
    optional: true,
    width: 340,
    mods: [],
};

function reserveTags(body: string): string[] {
    return body.match(/<span[^>]*class="reserve[ "][^>]*>/g) ?? [];
}

describe("CategoryTitle reserve", () => {
    it("keeps the reserved width at the end of the row free of the description", () => {
        const body = render(CategoryTitle, { props: { category, unit: 1, reserve: 64 } }).body;
        const tags = reserveTags(body);
        expect(tags).toHaveLength(1);
        expect(body).toMatch(/<div[^>]*class="title[ "][^>]*--reserve: 64px/);
        expect(body.indexOf('class="reserve')).toBeGreaterThan(body.indexOf("Buy into what they build."));
    });

    it("adds no spacer when nothing sits over the row", () => {
        expect(reserveTags(render(CategoryTitle, { props: { category, unit: 1 } }).body)).toHaveLength(0);
        expect(reserveTags(render(CategoryTitle, { props: { category, unit: 1, reserve: 0 } }).body)).toHaveLength(0);
    });
});
