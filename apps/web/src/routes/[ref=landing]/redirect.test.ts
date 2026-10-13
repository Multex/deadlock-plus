import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANDING_REFS } from "@deadlock-plus/links";
import { match } from "../../params/landing";
import { GET } from "./+server";

type Event = Parameters<typeof GET>[0];

async function get(ref: string): Promise<Response> {
    const request = new Request(`https://deadlockplus.example/${ref}`);
    return GET({ request, params: { ref } } as unknown as Event);
}

const ROUTES = readdirSync(fileURLToPath(new URL("..", import.meta.url)), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("["))
    .map((entry) => entry.name);

describe("landing matcher", () => {
    it.each([...LANDING_REFS])("matches /%s", (ref) => {
        expect(match(ref)).toBe(true);
    });

    it("matches a listed ref typed in another letter case", () => {
        expect(match("TT")).toBe(true);
        expect(match("Yt-B")).toBe(true);
    });

    it("leaves every other single-segment path to the 404 page", () => {
        for (const path of [
            "reddit",
            "tiktok",
            "tiktok-bio",
            "yt-bio",
            "tt2",
            "t%20t",
            "wp-login.php",
            "favicon.ico",
            ".env",
            "",
        ]) {
            expect(match(path)).toBe(false);
        }
    });

    it("does not match a real route", () => {
        expect(ROUTES).toEqual(expect.arrayContaining(["features", "download", "privacy", "discord", "og", "get"]));
        for (const route of ROUTES) expect(match(route)).toBe(false);
    });
});

describe("GET /<landing ref>", () => {
    it.each([...LANDING_REFS])("answers 302 to the home page under %s", async (ref) => {
        const response = await get(ref);
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(`/?ref=${ref}`);
        expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("lowercases the ref it redirects under", async () => {
        const response = await get("TT-P");
        expect(response.headers.get("location")).toBe("/?ref=tt-p");
    });
});
