import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { THEMES } from "$lib/content/themes";

import ThemeFlavour from "./theme-flavour.svelte";

const variants = THEMES.find((t) => t.id === "catppuccin")?.variants ?? [];

describe("<ThemeFlavour>", () => {
    it("shows the flavour in use in the shared menu, not a native select", () => {
        const { body } = render(ThemeFlavour, {
            props: { variants, value: "latte", labelledby: "x", onpick: () => {} },
        });

        expect(body).toContain("Latte");
        expect(body).toContain('aria-labelledby="x"');
        expect(body).not.toContain("<select");
    });
});
