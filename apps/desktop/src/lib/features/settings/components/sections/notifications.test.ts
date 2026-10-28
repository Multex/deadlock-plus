import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { t } from "$lib/core/i18n.svelte";

const source = readFileSync(new URL("./notifications.svelte", import.meta.url), "utf8");

describe("front page mode chips", () => {
    it("name each chip with one translatable line, so its word order can change", () => {
        expect(source).toContain(`aria-label={t("settings.notifications.front_page_mode_aria", { mode: label })}`);
        expect(t("settings.notifications.front_page_mode_aria", { mode: "Ranked" })).toBe("Front page for Ranked");
    });
});
