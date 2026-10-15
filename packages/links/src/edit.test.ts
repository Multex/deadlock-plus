import { describe, expect, it } from "vitest";
import { addInvite, addLanding, editInvite, removeInvite, removeLanding, serializeLinks } from "./edit";
import { DEFAULT_LINKS, parseLinks, type Links } from "./table";

const IG = { ref: "instagram", channel: "web", code: "abcDEF12" } as const;

function withInstagram(): Links {
    const result = addInvite(DEFAULT_LINKS, IG);
    if (!result.ok) throw new Error(result.error);
    return result.links;
}

describe("addInvite", () => {
    it("appends a web invite", () => {
        const result = addInvite(DEFAULT_LINKS, IG);
        expect(result.ok && result.links.invites.at(-1)).toEqual(IG);
        expect(DEFAULT_LINKS.invites).not.toContainEqual(IG);
    });

    it("appends a web ref without a code of its own yet", () => {
        expect(addInvite(DEFAULT_LINKS, { ...IG, code: null }).ok).toBe(true);
    });

    it("rejects a ref or code that is already listed", () => {
        expect(addInvite(DEFAULT_LINKS, { ...IG, ref: "tiktok" })).toEqual({ ok: false, error: "duplicate-ref" });
        expect(addInvite(DEFAULT_LINKS, { ...IG, code: "VR375cZwRJ" })).toEqual({ ok: false, error: "duplicate-code" });
    });

    it("rejects a ref that is a landing path", () => {
        expect(addInvite(DEFAULT_LINKS, { ...IG, ref: "tt" })).toEqual({ ok: false, error: "taken-by-landing" });
    });

    it("rejects a second app invite, since shipped builds only know one", () => {
        expect(addInvite(DEFAULT_LINKS, { ...IG, channel: "app" })).toEqual({ ok: false, error: "invalid" });
    });

    it("rejects a malformed ref or code", () => {
        expect(addInvite(DEFAULT_LINKS, { ...IG, ref: "Insta Gram" })).toEqual({ ok: false, error: "invalid" });
        expect(addInvite(DEFAULT_LINKS, { ...IG, code: "x/y" })).toEqual({ ok: false, error: "invalid" });
    });
});

describe("editInvite", () => {
    it("gives a ref a code of its own", () => {
        const result = editInvite(DEFAULT_LINKS, "bluesky", { code: "blueSKY1" });
        expect(result.ok && result.links.invites.find((i) => i.ref === "bluesky")?.code).toBe("blueSKY1");
    });

    it("renames a ref and moves its landing paths along", () => {
        const result = editInvite(DEFAULT_LINKS, "tiktok", { ref: "tik-tok" });
        expect(result.ok && result.links.invites.some((i) => i.ref === "tik-tok")).toBe(true);
        expect(result.ok && result.links.landings.filter((l) => l.ref === "tik-tok")).toHaveLength(3);
    });

    it("refuses a locked invite", () => {
        for (const ref of ["app", "general", "github"]) {
            expect(editInvite(DEFAULT_LINKS, ref, { code: "other123" })).toEqual({ ok: false, error: "locked" });
        }
    });

    it("refuses a rename onto a listed ref or a landing path", () => {
        expect(editInvite(DEFAULT_LINKS, "reddit", { ref: "twitter" })).toEqual({ ok: false, error: "duplicate-ref" });
        expect(editInvite(DEFAULT_LINKS, "reddit", { ref: "yt" })).toEqual({ ok: false, error: "taken-by-landing" });
    });

    it("refuses a code another ref has", () => {
        expect(editInvite(DEFAULT_LINKS, "bluesky", { code: "VR375cZwRJ" })).toEqual({
            ok: false,
            error: "duplicate-code",
        });
    });

    it("reports a ref that is not there", () => {
        expect(editInvite(DEFAULT_LINKS, "myspace", { code: "abc123" })).toEqual({ ok: false, error: "not-found" });
    });
});

describe("removeInvite", () => {
    it("removes an invite", () => {
        const result = removeInvite(withInstagram(), "instagram");
        expect(result.ok && result.links.invites.some((i) => i.ref === "instagram")).toBe(false);
    });

    it("refuses a locked invite and the website invite", () => {
        for (const ref of ["app", "general", "github"]) {
            expect(removeInvite(DEFAULT_LINKS, ref)).toEqual({ ok: false, error: "locked" });
        }
        expect(removeInvite(DEFAULT_LINKS, "website")).toEqual({ ok: false, error: "required" });
    });

    it("refuses an invite a landing path still counts under", () => {
        expect(removeInvite(DEFAULT_LINKS, "tiktok")).toEqual({ ok: false, error: "in-use" });
    });

    it("reports a ref that is not there", () => {
        expect(removeInvite(DEFAULT_LINKS, "myspace")).toEqual({ ok: false, error: "not-found" });
    });
});

describe("addLanding", () => {
    it("appends a landing path", () => {
        const result = addLanding(withInstagram(), { path: "ig", ref: "instagram" });
        expect(result.ok && result.links.landings.at(-1)).toEqual({ path: "ig", ref: "instagram" });
    });

    it("rejects a page name, an invite ref or a path already listed", () => {
        expect(addLanding(DEFAULT_LINKS, { path: "faq", ref: "tiktok" })).toEqual({ ok: false, error: "reserved" });
        expect(addLanding(DEFAULT_LINKS, { path: "reddit", ref: "tiktok" })).toEqual({
            ok: false,
            error: "taken-by-invite",
        });
        expect(addLanding(DEFAULT_LINKS, { path: "tt", ref: "youtube" })).toEqual({
            ok: false,
            error: "duplicate-path",
        });
    });

    it("rejects a path that counts under no web invite", () => {
        expect(addLanding(DEFAULT_LINKS, { path: "ig", ref: "instagram" })).toEqual({ ok: false, error: "no-invite" });
        expect(addLanding(DEFAULT_LINKS, { path: "ig", ref: "app" })).toEqual({ ok: false, error: "no-invite" });
    });

    it("rejects a malformed path", () => {
        expect(addLanding(DEFAULT_LINKS, { path: "i g", ref: "tiktok" })).toEqual({ ok: false, error: "invalid" });
    });
});

describe("removeLanding", () => {
    it("removes a landing path", () => {
        const result = removeLanding(DEFAULT_LINKS, "tt-p");
        expect(result.ok && result.links.landings.map((l) => l.path)).not.toContain("tt-p");
    });

    it("reports a path that is not there", () => {
        expect(removeLanding(DEFAULT_LINKS, "ig")).toEqual({ ok: false, error: "not-found" });
    });
});

describe("serializeLinks", () => {
    it("writes text the site reads back unchanged", () => {
        expect(parseLinks(serializeLinks(withInstagram()))).toEqual(withInstagram());
    });
});
