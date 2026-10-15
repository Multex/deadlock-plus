import { describe, expect, it } from "vitest";
import { FALLBACK_CODE, INVITES } from "./invites";
import { LANDINGS } from "./landing";
import { DEFAULT_LINKS, isLanding, parseLinks, resolveWebRef, type Links } from "./table";

const WEBSITE = "KzWBUrQW3D";

function table(change: (links: { invites: unknown[]; landings: unknown[] }) => void = () => {}): string {
    const links = structuredClone({ invites: [...INVITES], landings: [...LANDINGS] }) as {
        invites: unknown[];
        landings: unknown[];
    };
    change(links);
    return JSON.stringify(links);
}

describe("parseLinks", () => {
    it("reads the built-in list back unchanged", () => {
        expect(parseLinks(table())).toEqual(DEFAULT_LINKS);
    });

    it("reads a new invite and a new landing path", () => {
        const links = parseLinks(
            table((l) => {
                l.invites.push({ ref: "instagram", channel: "web", code: "abcDEF12" });
                l.landings.push({ path: "ig", ref: "instagram" });
            }),
        );
        expect(links?.invites.at(-1)).toEqual({ ref: "instagram", channel: "web", code: "abcDEF12" });
        expect(links?.landings.at(-1)).toEqual({ path: "ig", ref: "instagram" });
    });

    it("rejects text that is not a table", () => {
        for (const raw of [null, "", "{ broken", "[]", '{"invites": []}', '{"landings": []}']) {
            expect(parseLinks(raw), String(raw)).toBeNull();
        }
    });

    it("rejects a malformed invite", () => {
        const bad = [
            { ref: "Bad Ref", channel: "web", code: "abc123" },
            { ref: "x", channel: "email", code: "abc123" },
            { ref: "x", channel: "web", code: "../x" },
            { ref: "x", channel: "web", code: 5 },
            { ref: "x", channel: "web" },
        ];
        for (const invite of bad) {
            expect(parseLinks(table((l) => l.invites.push(invite))), JSON.stringify(invite)).toBeNull();
        }
    });

    it("rejects a ref or a code listed twice, since joins are counted per code", () => {
        expect(parseLinks(table((l) => l.invites.push({ ref: "tiktok", channel: "web", code: "new123" })))).toBeNull();
        expect(parseLinks(table((l) => l.invites.push({ ref: "x", channel: "web", code: WEBSITE })))).toBeNull();
    });

    it("rejects a table that drops or changes an invite shipped builds and posts link to", () => {
        for (const ref of ["app", "general", "github"]) {
            expect(
                parseLinks(table((l) => (l.invites = l.invites.filter((i) => (i as Links["invites"][0]).ref !== ref)))),
            ).toBeNull();
            const repointed = table((l) => {
                const row = l.invites.find((i) => (i as Links["invites"][0]).ref === ref) as { code: string };
                row.code = "other123";
            });
            expect(parseLinks(repointed), ref).toBeNull();
        }
    });

    it("rejects a table without the website invite every other ref falls back to", () => {
        expect(
            parseLinks(table((l) => (l.invites = l.invites.filter((i) => (i as { ref: string }).ref !== "website")))),
        ).toBeNull();
    });

    it("rejects a landing path that is a page, an invite ref, listed twice or pointing nowhere", () => {
        const bad = [
            { path: "faq", ref: "tiktok" },
            { path: "reddit", ref: "tiktok" },
            { path: "tt", ref: "youtube" },
            { path: "ig", ref: "instagram" },
            { path: "ig", ref: "app" },
            { path: "Not A Path", ref: "tiktok" },
        ];
        for (const landing of bad) {
            expect(parseLinks(table((l) => l.landings.push(landing))), JSON.stringify(landing)).toBeNull();
        }
    });
});

describe("resolveWebRef", () => {
    it("sends a listed web ref to its own invite", () => {
        expect(resolveWebRef("reddit")).toEqual({ ref: "reddit", code: "aTmYARWhdV", known: true });
        expect(resolveWebRef("Reddit")).toEqual({ ref: "reddit", code: "aTmYARWhdV", known: true });
    });

    it("sends a landing path to the invite it names", () => {
        expect(resolveWebRef("tt-b")).toEqual({ ref: "tiktok", code: "VR375cZwRJ", known: true });
        expect(resolveWebRef("YT")).toEqual({ ref: "youtube", code: "Sa8PdZrVEa", known: true });
    });

    it("sends a listed ref without an invite of its own to the website's", () => {
        expect(resolveWebRef("bluesky")).toEqual({ ref: "bluesky", code: WEBSITE, known: true });
    });

    it("sends an unlisted ref to the website's invite but marks it unknown", () => {
        expect(resolveWebRef("discord-rpc")).toEqual({ ref: "discord-rpc", code: WEBSITE, known: false });
    });

    it("never hands out the invite of another channel", () => {
        expect(resolveWebRef("app")).toEqual({ ref: "app", code: WEBSITE, known: false });
        expect(resolveWebRef("general")).toEqual({ ref: "general", code: WEBSITE, known: false });
    });

    it("sends a missing or malformed ref to the general invite", () => {
        expect(resolveWebRef(undefined)).toEqual({ ref: "none", code: FALLBACK_CODE, known: false });
        expect(resolveWebRef("../etc")).toEqual({ ref: "none", code: FALLBACK_CODE, known: false });
    });

    it("reads the given table", () => {
        const links: Links = {
            invites: [...INVITES, { ref: "instagram", channel: "web", code: "abcDEF12" }],
            landings: [{ path: "ig", ref: "instagram" }],
        };
        expect(resolveWebRef("ig", links)).toEqual({ ref: "instagram", code: "abcDEF12", known: true });
        expect(resolveWebRef("tt", links)).toEqual({ ref: "tt", code: WEBSITE, known: false });
    });
});

describe("isLanding", () => {
    it("knows a listed path in any letter case", () => {
        expect(isLanding("tt-p")).toBe(true);
        expect(isLanding("TT-P")).toBe(true);
    });

    it("rejects anything else", () => {
        for (const raw of [undefined, "", "tiktok", "tt2", "tt-", "..", "a".repeat(40)]) {
            expect(isLanding(raw), String(raw)).toBe(false);
        }
    });
});
