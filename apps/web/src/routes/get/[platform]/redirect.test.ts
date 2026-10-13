import { afterEach, describe, expect, it, vi } from "vitest";
import { REPO_URL } from "@deadlock-plus/links/urls";
import { RELEASES_API } from "$lib/server/releases";
import { GET } from "./+server";

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36";
const ENV = { POSTHOG_KEY: "phc_key", POSTHOG_HOST: "https://eu.i.posthog.com" };
const LATEST_PAGE = `${REPO_URL}/releases/latest`;

type Event = Parameters<typeof GET>[0];

function file(version: string, name: string): string {
    return `${REPO_URL}/releases/download/v${version}/${name}`;
}

function release(version: string, names: string[]) {
    return {
        tag_name: `v${version}`,
        draft: false,
        prerelease: false,
        published_at: "2026-10-12T18:30:00Z",
        assets: names.map((name) => ({ name, browser_download_url: file(version, name) })),
    };
}

const LIST = [
    release("0.11.0", ["Deadlock-Plus_0.11.0_x64-setup.exe", "Deadlock-Plus_0.11.0_amd64.deb"]),
    release("0.10.0", ["Deadlock-Plus_0.10.0_x64-setup.exe", "Deadlock-Plus_0.10.0_amd64.AppImage"]),
];

interface Sent {
    event: string;
    properties: Record<string, unknown>;
}

function stubFetch(github: () => Response): Sent[] {
    const sent: Sent[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string, init?: RequestInit) => {
            if (input === RELEASES_API) return github();
            sent.push(...(JSON.parse(init?.body as string) as { batch: Sent[] }).batch);
            return new Response(null, { status: 200 });
        }),
    );
    return sent;
}

const working = () => Response.json(LIST);
const failing = () => new Response(null, { status: 503 });

async function get(path: string, userAgent = BROWSER): Promise<Response> {
    const pending: Promise<unknown>[] = [];
    const platform = { env: ENV, cf: { country: "DE" }, ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) } };
    const request = new Request(`https://deadlockplus.example${path}`, { headers: { "user-agent": userAgent } });
    const name = path.split("?")[0]?.split("/")[2];
    const response = await GET({ request, params: { platform: name }, platform } as unknown as Event);
    await Promise.all(pending);
    return response;
}

describe("GET /get/<platform>", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it.each([
        ["/get/windows", file("0.11.0", "Deadlock-Plus_0.11.0_x64-setup.exe")],
        ["/get/deb", file("0.11.0", "Deadlock-Plus_0.11.0_amd64.deb")],
        ["/get/appimage", file("0.10.0", "Deadlock-Plus_0.10.0_amd64.AppImage")],
        ["/get/windows?v=0.10.0", file("0.10.0", "Deadlock-Plus_0.10.0_x64-setup.exe")],
        ["/get/windows?v=9.9.9", file("0.11.0", "Deadlock-Plus_0.11.0_x64-setup.exe")],
        ["/get/deb?v=0.10.0", file("0.11.0", "Deadlock-Plus_0.11.0_amd64.deb")],
        ["/get/windows?v=https://evil.example/x.exe", file("0.11.0", "Deadlock-Plus_0.11.0_x64-setup.exe")],
    ])("answers 302 for %s to a file from the release list", async (path, location) => {
        stubFetch(working);
        const response = await get(path);
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(location);
        expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("records one download_click with the served version and the ref", async () => {
        const sent = stubFetch(working);
        await get("/get/windows?v=0.10.0&ref=TT-B");
        expect(sent.map((e) => e.event)).toEqual(["download_click"]);
        expect(sent[0]?.properties).toMatchObject({
            platform: "windows",
            version: "0.10.0",
            latest: false,
            ref: "tt-b",
            fallback: false,
            country: "DE",
        });
    });

    it("falls back to the latest release page when the release list fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const sent = stubFetch(failing);
        const response = await get("/get/windows?v=0.11.0");
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(LATEST_PAGE);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(sent.map((e) => e.event)).toEqual(["download_click"]);
        expect(sent[0]?.properties).toMatchObject({ platform: "windows", version: null, fallback: true });
    });

    it("redirects a bot without recording it", async () => {
        const sent = stubFetch(working);
        const response = await get("/get/windows", "Discordbot/2.0");
        expect(response.headers.get("location")).toBe(file("0.11.0", "Deadlock-Plus_0.11.0_x64-setup.exe"));
        expect(sent).toEqual([]);
    });

    it.each(["macos", "Windows", "appImage", "windows.exe", "toString", ""])(
        "answers 404 for the unknown platform %j",
        async (name) => {
            const sent = stubFetch(working);
            await expect(get(`/get/${name}`)).rejects.toMatchObject({ status: 404 });
            expect(sent).toEqual([]);
        },
    );
});
