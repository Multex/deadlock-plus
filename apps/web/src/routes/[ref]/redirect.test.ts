import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { INVITES, LANDINGS, RESERVED_PATHS } from "@deadlock-plus/links";
import { resetLinks } from "$lib/server/links";
import { GET } from "./+server";

type Event = Parameters<typeof GET>[0];

async function get(ref: string, stored?: string): Promise<Response> {
    const request = new Request(`https://deadlockplus.example/${ref}`);
    const platform = stored === undefined ? undefined : { env: { TRANSPARENCY: { get: async () => stored } } };
    return GET({ request, params: { ref }, platform } as unknown as Event);
}

function topLevel(folder: string): string[] {
    return readdirSync(fileURLToPath(new URL(folder, import.meta.url)), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("["))
        .map((entry) => entry.name);
}

beforeEach(() => resetLinks());

describe("reserved landing paths", () => {
    it("include every page and static folder, which always win over a landing path", () => {
        const taken = [...topLevel(".."), ...topLevel("../../../static")];
        expect(taken).toEqual(expect.arrayContaining(["features", "download", "discord"]));
        for (const name of taken) expect(RESERVED_PATHS, name).toContain(name);
    });
});

describe("GET /<path>", () => {
    it.each(LANDINGS.map((landing) => landing.path))("answers 302 to the home page under %s", async (path) => {
        const response = await get(path);
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(`/?ref=${path}`);
        expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("lowercases the path it redirects under", async () => {
        const response = await get("TT-P");
        expect(response.headers.get("location")).toBe("/?ref=tt-p");
    });

    it("sends an unlisted path home, so an old bio keeps working after its path is deleted", async () => {
        for (const path of ["reddit", "tiktok-bio", "tt2"]) {
            const response = await get(path);
            expect(response.status, path).toBe(302);
            expect(response.headers.get("location"), path).toBe("/");
            expect(response.headers.get("cache-control"), path).toBe("no-store");
        }
    });

    it("answers 404 for a path that cannot be a ref", async () => {
        for (const path of ["wp-login.php", "favicon.ico", ".env", "t t"]) {
            await expect(get(path), path).rejects.toMatchObject({ status: 404 });
        }
    });

    it("reads landing paths from the stored table", async () => {
        const stored = JSON.stringify({
            invites: [...INVITES, { ref: "instagram", channel: "web", code: "abcDEF12" }],
            landings: [{ path: "ig", ref: "instagram" }],
        });
        expect((await get("ig", stored)).headers.get("location")).toBe("/?ref=ig");
        resetLinks();
        expect((await get("tt", stored)).headers.get("location")).toBe("/");
    });
});
