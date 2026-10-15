import { describe, expect, it } from "vitest";
import { INVITES, slug } from "./invites";
import { LANDINGS } from "./landing";

describe("LANDINGS", () => {
    it("lists only paths that pass slug unchanged", () => {
        for (const { path } of LANDINGS) expect(slug(path)).toBe(path);
    });

    it("lists each path once", () => {
        const paths = LANDINGS.map((landing) => landing.path);
        expect(new Set(paths).size).toBe(paths.length);
    });

    it("sends every path to a web invite that has a code of its own", () => {
        for (const landing of LANDINGS) {
            const invite = INVITES.find((i) => i.channel === "web" && i.ref === landing.ref);
            expect(invite?.code, landing.path).toBeTruthy();
        }
    });
});
