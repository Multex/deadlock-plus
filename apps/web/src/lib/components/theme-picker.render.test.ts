import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "$lib/content/themes";
import { themeState } from "$lib/content/theme-state.svelte";

import ThemePicker from "./theme-picker.svelte";

afterEach(() => {
    themeState.theme = DEFAULT_THEME;
    themeState.picked = undefined;
});

describe("<ThemePicker>", () => {
    it("offers a switch for the theme's effects, drawn by the shared switch", () => {
        themeState.theme = "nightshift";
        const { body } = render(ThemePicker);

        expect(body).toMatch(/role="switch"/);
        expect(body).toContain("Theme effects");
        expect(body).not.toMatch(/<input[^>]*type="checkbox"/);
    });

    it("leaves the switch out for a theme with no effects", () => {
        themeState.theme = "contrast";

        expect(render(ThemePicker).body).not.toMatch(/role="switch"/);
    });

    it("credits a brand theme with a link to what it is based on", () => {
        themeState.theme = "nightshift";
        const { body } = render(ThemePicker);

        expect(body).toMatch(/<a[^>]*href="https:\/\/www\.twitch\.tv\/deadlocknightshift"/);
        expect(body).toContain("Based on Deadlock Night Shift on Twitch");
    });

    it("lets Catppuccin pick its flavour from the shared menu, showing the one in use", () => {
        themeState.theme = "catppuccin";
        themeState.picked = "latte";
        const { body } = render(ThemePicker);

        expect(body).toContain("Flavour");
        expect(body).toContain("Latte");
        expect(body).not.toContain("<select");
    });

    it("shows no flavour menu for a theme with one palette", () => {
        themeState.theme = "midnight";

        expect(render(ThemePicker).body).not.toContain("Flavour");
    });
});
