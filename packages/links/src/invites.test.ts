import { describe, expect, it } from "vitest";
import { FALLBACK_CODE, INVITES, inviteByCode, slug } from "./invites";

describe("slug", () => {
    it("lowercases a well-formed ref", () => {
        expect(slug("Deadlock-API")).toBe("deadlock-api");
    });

    it("rejects anything that is not a short slug", () => {
        for (const bad of [null, undefined, "", "-lead", "a b", "a/b", "é", "x".repeat(33)]) {
            expect(slug(bad)).toBeNull();
        }
    });
});

describe("INVITES", () => {
    it("lists each invite code once, so a code names one ref", () => {
        const codes = INVITES.flatMap((i) => (i.code ? [i.code] : []));
        expect(new Set(codes).size).toBe(codes.length);
    });

    it("lists each ref once", () => {
        const refs = INVITES.map((i) => i.ref);
        expect(new Set(refs).size).toBe(refs.length);
    });

    it("makes the general invite the fallback", () => {
        expect(inviteByCode(FALLBACK_CODE)).toMatchObject({ ref: "general", channel: "direct" });
    });

    it("keeps the invite that shipped app builds point at", () => {
        expect(inviteByCode("VM9utA3enT")).toMatchObject({ ref: "app", channel: "app" });
    });
});
