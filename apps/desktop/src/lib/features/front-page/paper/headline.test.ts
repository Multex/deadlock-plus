import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import Headline from "./headline.svelte";

describe("Headline", () => {
    it("renders the deck only when one is given", () => {
        const withDeck = render(Headline, { props: { text: "Kelvin goes 15/4/13", deck: "You finished first." } }).body;
        const without = render(Headline, { props: { text: "Kelvin goes 15/4/13" } }).body;
        expect(withDeck).toMatch(/<p class="deck[^"]*"[^>]*>You finished first\.<\/p>/);
        expect(without).not.toContain('class="deck');
    });

    it("renders the kicker only when one is given", () => {
        const withKicker = render(Headline, { props: { text: "Win", kicker: "Your match" } }).body;
        const without = render(Headline, { props: { text: "Win" } }).body;
        expect(withKicker).toMatch(/class="kicker[^"]*"[^>]*>Your match</);
        expect(without).not.toContain('class="kicker');
    });

    it("sets the banner at its largest size before it is measured", () => {
        const body = render(Headline, { props: { text: "Win", max: 64 } }).body;
        expect(body).toMatch(/<h2[^>]*style="[^"]*font-size: 64px/);
    });
});
