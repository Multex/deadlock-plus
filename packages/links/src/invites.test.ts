import { describe, expect, it } from "vitest";
import { FALLBACK_CODE, INVITES, inviteByCode, resolveWebRef, slug } from "./invites";

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

describe("resolveWebRef", () => {
    it("sends a listed web ref to its own invite", () => {
        const invites = [{ ref: "website", channel: "web", code: "abc123" }] as const;
        expect(resolveWebRef("website", invites)).toEqual({ ref: "website", code: "abc123", known: true });
    });

    it("sends a listed web ref without an invite of its own to the fallback", () => {
        const invites = [{ ref: "website", channel: "web", code: null }] as const;
        expect(resolveWebRef("website", invites)).toEqual({ ref: "website", code: FALLBACK_CODE, known: true });
    });

    it("keeps an unlisted ref but marks it unknown", () => {
        expect(resolveWebRef("reddit-patch-thread", [])).toEqual({
            ref: "reddit-patch-thread",
            code: FALLBACK_CODE,
            known: false,
        });
    });

    it("never hands out the invite of another channel", () => {
        const invites = [{ ref: "app", channel: "app", code: "appcode" }] as const;
        expect(resolveWebRef("app", invites)).toEqual({ ref: "app", code: FALLBACK_CODE, known: false });
    });

    it("treats a missing or malformed ref as none", () => {
        expect(resolveWebRef(undefined, [])).toEqual({ ref: "none", code: FALLBACK_CODE, known: false });
        expect(resolveWebRef("../etc", [])).toEqual({ ref: "none", code: FALLBACK_CODE, known: false });
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

    it("keeps the invite that shipped app builds point at", () => {
        expect(inviteByCode("VM9utA3enT")).toMatchObject({ ref: "app", channel: "app" });
    });
});
