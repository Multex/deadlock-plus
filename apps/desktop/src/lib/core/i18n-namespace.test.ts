import { describe, expect, it } from "vitest";
import full from "../../../../../locales/en.json";
import { i18n, t } from "./i18n.svelte";

describe("lazy namespaces", () => {
    it("keeps dispatch text out of the startup catalog", () => {
        expect(i18n.catalogs.en.dispatch).toBeUndefined();
        expect(i18n.catalogs.en.common).toBeDefined();
    });

    it("resolves dispatch keys once the namespace loads", async () => {
        await i18n.namespace("dispatch");
        expect(t("dispatch.masthead.name")).toBe(full.dispatch.masthead.name);
        expect(t("common.cancel")).toBe(full.common.cancel);
    });

    it("falls back to English dispatch text in another locale", async () => {
        i18n.catalogs = { ...i18n.catalogs, fr: { common: { cancel: "Annuler" } } };
        i18n.setLocale("fr");
        await i18n.namespace("dispatch");
        expect(t("dispatch.masthead.name")).toBe(full.dispatch.masthead.name);
        expect(t("common.cancel")).toBe("Annuler");
        i18n.setLocale("en");
    });
});
