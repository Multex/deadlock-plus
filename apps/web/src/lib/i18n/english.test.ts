import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import faq from "virtual:en/faq";
import { en } from "./index";

const full = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../../../locales/web/en.json", import.meta.url)), "utf8"),
);

describe("English by namespace", () => {
    it("serves one namespace of the English catalog per module, so a page carries only its own copy", () => {
        expect(faq).toEqual({ faq: full.faq });
    });

    it("gives every page the shared copy, and no page's own", () => {
        expect(Object.keys(en).sort()).toEqual(["error", "footer", "nav", "shot", "site", "themes"]);
        for (const namespace of Object.keys(en)) expect(en[namespace]).toEqual(full[namespace]);
    });
});
