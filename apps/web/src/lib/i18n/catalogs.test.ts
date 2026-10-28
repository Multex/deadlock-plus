import { describe, expect, it } from "vitest";
import { catalogsFor } from "./catalogs";

describe("catalogsFor", () => {
    it("loads no catalog for an English page", async () => {
        expect(await catalogsFor("en")).toEqual({});
    });

    it("loads the page's language and its base language", async () => {
        expect(Object.keys(await catalogsFor("pt-BR")).sort()).toEqual(["pt", "pt-BR"]);
    });

    it("loads one catalog for a language with no region", async () => {
        expect(Object.keys(await catalogsFor("de"))).toEqual(["de"]);
    });
});
