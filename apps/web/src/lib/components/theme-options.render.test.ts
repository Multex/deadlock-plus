import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({ page: { url: new URL("https://deadlockplus.app/") } }));
import { THEMES, type Theme } from "$lib/content/themes";

import ThemeOptions from "./theme-options.svelte";
import ThemePicker from "./theme-picker.svelte";

const theme = (id: string): Theme => {
    const found = THEMES.find((t) => t.id === id);
    if (!found) throw new Error(`no theme ${id}`);
    return found;
};
const options = (id: string) => render(ThemeOptions, { props: { theme: theme(id) } }).body;

describe("<ThemeOptions>", () => {
    it("offers a switch for the theme's effects, drawn by the shared switch", () => {
        const body = options("nightshift");

        expect(body).toMatch(/role="switch"/);
        expect(body).toContain("Theme effects");
        expect(body).not.toMatch(/<input[^>]*type="checkbox"/);
    });

    it("leaves the switch out for a theme with no effects", () => {
        expect(options("contrast")).not.toMatch(/role="switch"/);
    });

    it("credits a brand theme with a link to what it is based on", () => {
        const body = options("nightshift");

        expect(body).toMatch(/<a[^>]*href="https:\/\/www\.twitch\.tv\/deadlocknightshift"/);
        expect(body).toContain("Based on Deadlock Night Shift on Twitch");
    });

    it("labels Catppuccin's flavour menu, which loads only for a theme with flavours", () => {
        const body = options("catppuccin");

        expect(body).toContain('id="theme-flavour-label"');
        expect(body).toContain("Flavour");
        expect(body).not.toContain("<select");
    });

    it("shows no flavour menu for a theme with one palette", () => {
        expect(options("midnight")).not.toContain("Flavour");
    });
});

describe("<ThemePicker>", () => {
    it("renders every theme's swatch before its options load", () => {
        const { body } = render(ThemePicker);

        expect(body.match(/role="radio"/g)?.length).toBe(THEMES.length);
        expect(body).not.toMatch(/role="switch"/);
    });
});
