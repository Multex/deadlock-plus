import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env, Relay } from "../src/index";
import { FakeStorage } from "./fake-storage";
import fileTranslated from "./fixtures/file-translated.json";

const WEBHOOK = "https://discord.com/api/webhooks/123/token";

let storage: FakeStorage;
let relayFetch: (request: Request) => Promise<Response>;

const namespace = {
    idFromName: (name: string) => name,
    get: () => ({ fetch: (input: RequestInfo, init?: RequestInit) => relayFetch(new Request(input, init)) }),
} as unknown as DurableObjectNamespace;

function withEnv(overrides: Partial<Env> = {}): Env {
    const env: Env = { DISCORD_WEBHOOK_URL: WEBHOOK, PATH_SECRET: "s3cret", RELAY: namespace, ...overrides };
    const relay = new Relay({ storage } as unknown as DurableObjectState, env);
    relayFetch = (request) => relay.fetch(request);
    return env;
}

let env: Env;

async function runAlarm(): Promise<void> {
    const relay = new Relay({ storage } as unknown as DurableObjectState, env);
    await relay.alarm();
}

function post(path: string, body: unknown, init: RequestInit = {}): Request {
    return new Request(`https://relay.example${path}`, {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
        ...init,
    });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    storage = new FakeStorage();
    env = withEnv();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("routing", () => {
    it("rejects the wrong path with 404 and does not call Discord", async () => {
        const res = await worker.fetch(post("/wrong", fileTranslated), env);
        expect(res.status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects the root path with 404", async () => {
        const res = await worker.fetch(post("/", fileTranslated), env);
        expect(res.status).toBe(404);
    });

    it("rejects other methods on the right path with 405", async () => {
        const res = await worker.fetch(new Request("https://relay.example/s3cret"), env);
        expect(res.status).toBe(405);
        expect(res.headers.get("allow")).toBe("POST");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reports 404 before 405 on the wrong path", async () => {
        const res = await worker.fetch(new Request("https://relay.example/wrong"), env);
        expect(res.status).toBe(404);
    });

    it("answers 500 when the path secret is not configured", async () => {
        const res = await worker.fetch(post("/", fileTranslated), withEnv({ PATH_SECRET: "" }));
        expect(res.status).toBe(500);
    });

    it("answers 500 and logs when the webhook url is not a valid url", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const res = await worker.fetch(post("/s3cret", fileTranslated), withEnv({ DISCORD_WEBHOOK_URL: '"nope"' }));
        expect(res.status).toBe(500);
        expect(error).toHaveBeenCalledWith("DISCORD_WEBHOOK_URL is not a valid URL");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("answers 500 when the webhook url is not configured", async () => {
        const res = await worker.fetch(post("/s3cret", fileTranslated), withEnv({ DISCORD_WEBHOOK_URL: "" }));
        expect(res.status).toBe(500);
    });
});

describe("body", () => {
    it("rejects invalid JSON with 400", async () => {
        const res = await worker.fetch(post("/s3cret", "{nope"), env);
        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([["null"], ["42"], ['"text"'], ["[]"]])("rejects the non-object body %s with 400", async (body) => {
        const res = await worker.fetch(post("/s3cret", body), env);
        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("forwarding", () => {
    it("queues the event, answers 204 and posts it from the alarm with with_components=true", async () => {
        const res = await worker.fetch(post("/s3cret", fileTranslated), env);
        expect(res.status).toBe(204);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(storage.alarm).not.toBeNull();

        await runAlarm();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0]!;
        const target = new URL(String(url));
        expect(target.origin + target.pathname).toBe(WEBHOOK);
        expect(target.searchParams.get("with_components")).toBe("true");
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("content-type")).toBe("application/json");

        const sent = JSON.parse(String(init?.body));
        expect(sent.flags).toBe(32768);
        expect(sent.username).toBe("Crowdin");
    });

    it("keeps query parameters already on the webhook url", async () => {
        env = withEnv({ DISCORD_WEBHOOK_URL: `${WEBHOOK}?thread_id=9` });
        await worker.fetch(post("/s3cret", fileTranslated), env);
        await runAlarm();
        const target = new URL(String(fetchMock.mock.calls[0]![0]));
        expect(target.searchParams.get("thread_id")).toBe("9");
        expect(target.searchParams.get("with_components")).toBe("true");
    });

    it("keeps the event when Discord rejects it", async () => {
        fetchMock.mockResolvedValueOnce(new Response('{"message":"bad"}', { status: 400 }));
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const res = await worker.fetch(post("/s3cret", fileTranslated), env);
        expect(res.status).toBe(204);

        await runAlarm();
        expect([...storage.data.keys()].some((k) => k.startsWith("out:"))).toBe(true);
        expect(storage.alarm).not.toBeNull();
    });

    it("answers 503 when the events cannot be queued", async () => {
        relayFetch = () => Promise.reject(new Error("storage down"));
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const res = await worker.fetch(post("/s3cret", fileTranslated), env);
        expect(res.status).toBe(503);
        expect(error).toHaveBeenCalledWith("Could not queue the events");
    });

    it("never logs the webhook url or the path secret", async () => {
        relayFetch = () => Promise.reject(new Error(`failed for ${WEBHOOK}`));
        fetchMock.mockRejectedValue(new Error(`failed for ${WEBHOOK}`));
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        await worker.fetch(post("/s3cret", fileTranslated), env);
        env = withEnv();
        await worker.fetch(post("/s3cret", fileTranslated), env);
        await runAlarm();
        const logged = JSON.stringify([...error.mock.calls, ...warn.mock.calls, ...log.mock.calls]);
        expect(logged).not.toContain("token");
        expect(logged).not.toContain("s3cret");
    });
});

describe("batched bodies", () => {
    const batch = { events: [fileTranslated, { ...fileTranslated, event: "file.added" }] };

    it("posts one message per file event, in order", async () => {
        const res = await worker.fetch(post("/s3cret", batch), env);
        expect(res.status).toBe(204);
        await runAlarm();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const headers = fetchMock.mock.calls.map(([, init]) =>
            JSON.stringify(JSON.parse(String(init?.body)).components[0].components[0]),
        );
        expect(headers[0]).toContain("File translated");
        expect(headers[1]).toContain("File added");
    });

    it("still posts a single message for an empty events array", async () => {
        const res = await worker.fetch(post("/s3cret", { events: [] }), env);
        expect(res.status).toBe(204);
        await runAlarm();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
