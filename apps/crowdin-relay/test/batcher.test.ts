import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Batcher, MAX_ATTEMPTS, MAX_WINDOW_MS, QUIET_MS } from "../src/batcher";
import { render } from "../src/render";
import fileTranslated from "./fixtures/file-translated.json";
import stringAdded from "./fixtures/string-added.json";
import suggestionAdded from "./fixtures/suggestion-added.json";
import suggestionApproved from "./fixtures/suggestion-approved.json";
import { FakeStorage } from "./fake-storage";

const WEBHOOK = "https://discord.com/api/webhooks/123/token";
const T0 = Date.UTC(2026, 9, 28, 12, 0, 0);
const MINUTE = 60_000;

type Event = Record<string, any>;

function suggestion(
    fixture: unknown,
    lang: { id: string; name: string; editorCode: string },
    author: string,
    reviewer?: string,
): Event {
    const event = structuredClone(fixture) as Event;
    event.translation.targetLanguage = { ...lang, locale: lang.id };
    event.translation.user = { username: author.toLowerCase(), fullName: author };
    if (reviewer) event.user = { username: reviewer.toLowerCase(), fullName: reviewer };
    return event;
}

const RU = { id: "ru", name: "Russian", editorCode: "ru" };
const PT = { id: "pt-BR", name: "Portuguese, Brazilian", editorCode: "ptbr" };

const translated = (lang: typeof RU, author: string) => suggestion(suggestionAdded, lang, author);
const approved = (lang: typeof RU, author: string, reviewer: string) =>
    suggestion(suggestionApproved, lang, author, reviewer);

const fetchMock = vi.fn<typeof fetch>();
let storage: FakeStorage;
let batcher: Batcher;

function at(ms: number): void {
    vi.setSystemTime(ms);
}

async function fire(): Promise<void> {
    expect(storage.alarm).not.toBeNull();
    at(Math.max(Date.now(), storage.alarm!));
    await batcher.alarm();
}

function posted(): any[] {
    return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

function lines(): string[] {
    return posted().map((message) => message.components[0].components[1].content);
}

function ok(headers: Record<string, string> = {}): Response {
    return new Response(null, { status: 204, headers });
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(T0);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);
    storage = new FakeStorage();
    batcher = new Batcher(storage, WEBHOOK);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("grouping", () => {
    it("posts one summary per language with counts and names", async () => {
        await batcher.receive([translated(RU, "Anna"), translated(RU, "Boris"), translated(PT, "Caio")]);
        await batcher.receive([translated(RU, "Anna"), approved(RU, "Anna", "Rae")]);
        expect(fetchMock).not.toHaveBeenCalled();

        await fire();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(lines().sort()).toEqual([
            "pt-BR: 1 string translated by Caio",
            "ru: 3 strings translated by Anna, Boris; 1 approved by Rae",
        ]);
    });

    it("titles the summary with the language and links its editor", async () => {
        await batcher.receive([translated(RU, "Anna")]);
        await fire();

        const [message] = posted();
        expect(message.username).toBe("Crowdin");
        expect(message.components[0].components[0]).toEqual({
            type: 9,
            components: [{ type: 10, content: "### Russian translations" }],
            accessory: {
                type: 2,
                style: 5,
                label: "Open in editor",
                url: "https://crowdin.com/editor/deadlock-plus/all/en-ru",
            },
        });
        expect(message.components[0].components.at(-1)).toEqual({ type: 10, content: "**Project**\nDeadlock+" });
    });

    it("keeps projects apart", async () => {
        const other = translated(RU, "Anna");
        other.translation.string.project = { id: "888", identifier: "other", name: "Other" };
        await batcher.receive([translated(RU, "Anna"), other]);
        await fire();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("summarises source string changes per project", async () => {
        const updated = { ...structuredClone(stringAdded), event: "string.updated" };
        await batcher.receive([stringAdded, stringAdded, updated]);
        await fire();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(lines()).toEqual(["2 strings added by John Smith; 1 updated by John Smith"]);
        expect(posted()[0].components[0].components[0].components[0].content).toBe("### Source strings");
    });

    it("posts file events at once, exactly as rendered", async () => {
        await batcher.receive([fileTranslated]);
        expect(storage.alarm).toBe(T0);
        await fire();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(posted()[0]).toEqual(JSON.parse(JSON.stringify(render(fileTranslated))));
    });

    it("posts with with_components=true", async () => {
        await batcher.receive([fileTranslated]);
        await fire();
        const target = new URL(String(fetchMock.mock.calls[0]![0]));
        expect(target.searchParams.get("with_components")).toBe("true");
    });
});

describe("window", () => {
    it("closes after the stream has been quiet for three minutes", async () => {
        await batcher.receive([translated(RU, "Anna")]);
        expect(storage.alarm).toBe(T0 + QUIET_MS);

        at(T0 + 2 * MINUTE);
        await batcher.receive([translated(RU, "Anna")]);
        expect(storage.alarm).toBe(T0 + 2 * MINUTE + QUIET_MS);

        at(T0 + 4 * MINUTE);
        await batcher.alarm();
        expect(fetchMock).not.toHaveBeenCalled();

        await fire();
        expect(Date.now()).toBe(T0 + 5 * MINUTE);
        expect(lines()).toEqual(["ru: 2 strings translated by Anna"]);
        expect(storage.alarm).toBeNull();
    });

    it("closes fifteen minutes after the first event while events keep coming", async () => {
        for (let minute = 0; minute <= 16; minute += 2) {
            at(T0 + minute * MINUTE);
            if (storage.alarm !== null && storage.alarm <= Date.now()) await batcher.alarm();
            await batcher.receive([translated(RU, "Anna")]);
        }

        expect(lines()).toEqual(["ru: 8 strings translated by Anna"]);
        expect(MAX_WINDOW_MS).toBe(15 * MINUTE);

        at(T0 + 40 * MINUTE);
        await batcher.alarm();
        expect(lines()).toEqual(["ru: 8 strings translated by Anna", "ru: 1 string translated by Anna"]);
    });

    it("never arms the alarm past the fifteen minute mark", async () => {
        await batcher.receive([translated(RU, "Anna")]);
        at(T0 + 14 * MINUTE);
        await batcher.receive([translated(RU, "Anna")]);
        expect(storage.alarm).toBe(T0 + MAX_WINDOW_MS);
    });

    it("starts a new summary for events that arrive while one is being posted", async () => {
        await batcher.receive([translated(RU, "Anna")]);
        fetchMock.mockImplementationOnce(async () => {
            await batcher.receive([translated(RU, "Boris")]);
            return ok();
        });
        await fire();
        expect(lines()).toEqual(["ru: 1 string translated by Anna"]);

        await fire();
        expect(lines()).toEqual(["ru: 1 string translated by Anna", "ru: 1 string translated by Boris"]);
    });
});

describe("rate limits", () => {
    it("keeps the summary on 429 and retries after retry_after", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        await batcher.receive([translated(RU, "Anna"), translated(RU, "Boris")]);
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ message: "You are being rate limited.", retry_after: 2.5, global: false }), {
                status: 429,
                headers: { "content-type": "application/json", "retry-after": "3" },
            }),
        );

        await fire();
        const closedAt = Date.now();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(storage.alarm).toBe(closedAt + 2500);
        expect(warn).toHaveBeenCalled();

        at(closedAt + 2499);
        await batcher.alarm();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await fire();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(lines()[1]).toBe("ru: 2 strings translated by Anna, Boris");
        expect(storage.alarm).toBeNull();
        expect([...storage.data.keys()].filter((k) => k.startsWith("out:"))).toEqual([]);
    });

    it("waits for the bucket to reset when Discord says none are left", async () => {
        fetchMock.mockResolvedValueOnce(ok({ "x-ratelimit-remaining": "0", "x-ratelimit-reset-after": "1.2" }));
        await batcher.receive([fileTranslated, { ...fileTranslated, event: "file.approved" }]);
        await fire();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(storage.alarm).toBe(T0 + 1200);
        await fire();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("keeps the order of messages behind a failed one", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
        await batcher.receive([fileTranslated, { ...fileTranslated, event: "file.approved" }]);
        await fire();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(storage.alarm).toBe(Date.now() + 5000);

        await fire();
        expect(storage.alarm).toBeNull();
        const headers = posted().map((m) => m.components[0].components[0].components[0].content);
        expect(headers).toEqual(["### File translated", "### File translated", "### File approved"]);
    });

    it("backs off on server errors and network failures", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 502 }));
        fetchMock.mockRejectedValueOnce(new Error("network down"));
        await batcher.receive([fileTranslated]);

        await fire();
        const first = storage.alarm! - Date.now();
        await fire();
        const second = storage.alarm! - Date.now();
        expect(first).toBeGreaterThan(0);
        expect(second).toBeGreaterThan(first);

        await fire();
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(storage.alarm).toBeNull();
    });

    it("stops retrying after the cap, logs what it keeps and retries on the next webhook", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
        await batcher.receive([translated(RU, "Anna")]);

        for (let i = 0; i < MAX_ATTEMPTS; i++) await fire();
        expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
        expect(storage.alarm).toBeNull();
        expect(JSON.stringify(error.mock.calls)).toContain("ru: 1 string translated by Anna");

        fetchMock.mockResolvedValue(ok());
        at(Date.now() + 60 * MINUTE);
        await batcher.receive([fileTranslated]);
        await fire();
        const [kept, file] = posted().slice(-2);
        expect(kept.components[0].components[1].content).toBe("ru: 1 string translated by Anna");
        expect(file).toEqual(JSON.parse(JSON.stringify(render(fileTranslated))));
    });

    it("waits instead of spinning when the webhook url is broken", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        batcher = new Batcher(storage, '"nope"');
        await batcher.receive([fileTranslated]);
        await fire();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith("DISCORD_WEBHOOK_URL is not a valid URL");
        expect(storage.alarm).toBe(Date.now() + 10 * MINUTE);
    });

    it("never logs the webhook url", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        fetchMock.mockRejectedValue(new Error(`failed for ${WEBHOOK}`));
        await batcher.receive([fileTranslated]);
        for (let i = 0; i < MAX_ATTEMPTS; i++) await fire();
        expect(JSON.stringify([...warn.mock.calls, ...error.mock.calls])).not.toContain("token");
    });
});
