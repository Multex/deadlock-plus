import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import ThemeCard from "./theme-card.svelte";
import { THEMES } from "../themes";

const theme = (id: string) => THEMES.find((t) => t.id === id)!;

function html(id: string, props: Partial<Record<string, unknown>> = {}): string {
    return render(ThemeCard, {
        props: {
            theme: theme(id),
            selected: false,
            effectsOn: true,
            layers: {},
            accent: null,
            variant: undefined,
            namedAccent: undefined,
            onSelect: () => {},
            onVariant: () => {},
            onNamedAccent: () => {},
            onLayer: () => {},
            onAccent: () => {},
            onKeydown: () => {},
            ...props,
        },
    }).body;
}

/** The radio's own markup, from its opening tag to its closing `</button>`. */
function radio(body: string): string {
    const start = body.search(/<button\b[^>]*role="radio"/);
    return body.slice(start, body.indexOf("</button>", start) + "</button>".length);
}

describe("ThemeCard", () => {
    it("is a radio named after the theme, checked when selected", () => {
        const body = html("void", { selected: true });

        expect(radio(body)).toMatch(/aria-checked="true"/);
        expect(radio(body)).toContain("Void");
    });

    it("keeps the theme's options out of the radio, so no control sits inside another", () => {
        const own = radio(html("nightshift"));

        expect(own.match(/<button\b/g)).toHaveLength(1);
        expect(own).not.toContain("aria-pressed");
        expect(own).not.toContain('title="https');
    });

    it("has a pressed toggle for every layer that is on, and an unpressed one for a layer turned off", () => {
        const body = html("nightshift", { layers: { rain: false, lights: true, frames: true, clock: true } });
        const toggles = [...body.matchAll(/<button\b[^>]*aria-pressed="(true|false)"[^>]*>(.*?)<\/button>/gs)].map(
            (m) => [m[2]!.replace(/<[^>]+>/g, "").trim(), m[1]],
        );

        expect(toggles).toEqual([
            ["Rain", "false"],
            ["Lights", "true"],
            ["Frames", "true"],
            ["Medallion", "true"],
        ]);
    });

    it("greys the layer toggles out while theme effects are off", () => {
        const body = html("flint-snow", { effectsOn: false });

        expect([...body.matchAll(/<button\b[^>]*aria-pressed[^>]*>/g)].every((m) => /\bdisabled\b/.test(m[0]))).toBe(
            true,
        );
    });

    it("links to what the theme is based on", () => {
        const body = html("deadlock-api");

        expect(body).toContain("Deadlock API");
        expect(body).toMatch(/<button\b[^>]*title="https:\/\/deadlock-api\.com"/);
    });

    it("offers an accent of your own, except on High contrast", () => {
        expect(html("void")).toContain("Accent colour");
        expect(html("contrast")).not.toContain("Accent colour");
    });

    it("picks Catppuccin's flavour and accent from menus named after the theme, instead of a free accent", () => {
        const body = html("catppuccin", { variant: "latte", namedAccent: "peach" });

        expect(body).toMatch(/<button\b[^>]*aria-label="Catppuccin Flavour"/);
        expect(body).toMatch(/<button\b[^>]*aria-label="Catppuccin Accent"/);
        expect(body).toContain("Latte");
        expect(body).toContain("Peach");
        expect(body).not.toContain("Accent colour");
        expect(body).toMatch(/<button\b[^>]*title="https:\/\/catppuccin\.com\/palette"/);
    });

    it("draws Catppuccin's swatch in the picked flavour and accent", () => {
        const latte = html("catppuccin", { variant: "latte", namedAccent: "peach" });
        const mocha = html("catppuccin", { variant: "mocha" });

        expect(radio(latte)).not.toBe(radio(mocha));
    });

    it("shows no options strip for a theme with nothing to set", () => {
        expect(html("contrast")).not.toMatch(/data-theme-options/);
    });
});
