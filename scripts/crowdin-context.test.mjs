import { describe, expect, it } from "vitest";
import { batches, contextOps, readConfig, request } from "./crowdin-context.mjs";

describe("contextOps", () => {
    const notes = { "common.save": "Button.", n: "Count." };

    it("writes the key and the note for every string whose context differs", () => {
        const strings = [
            { id: 1, identifier: "common.save", context: "common.save" },
            { id: 2, identifier: "n", context: "n\n\nCount." },
        ];
        expect(contextOps(strings, notes)).toEqual({
            ops: [{ op: "replace", path: "/1/context", value: "common.save\n\nButton." }],
            unmatched: [],
        });
    });

    it("leaves strings without a note alone and lists notes Crowdin has no string for", () => {
        const strings = [{ id: 3, identifier: "other", context: "other" }];
        expect(contextOps(strings, notes)).toEqual({ ops: [], unmatched: ["common.save", "n"] });
    });
});

describe("batches", () => {
    it("splits into groups of at most the given size", () => {
        expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
        expect(batches([], 100)).toEqual([]);
    });
});

describe("readConfig", () => {
    it("fails with a clear message when the token or project id is missing", () => {
        expect(() => readConfig({ CROWDIN_PROJECT_ID: "1" })).toThrow("CROWDIN_PERSONAL_TOKEN is not set");
        expect(() => readConfig({ CROWDIN_PERSONAL_TOKEN: "t" })).toThrow("CROWDIN_PROJECT_ID is not set");
    });

    it("reads both from the environment", () => {
        expect(readConfig({ CROWDIN_PERSONAL_TOKEN: "t", CROWDIN_PROJECT_ID: "9" })).toEqual({
            token: "t",
            projectId: "9",
        });
    });
});

describe("request", () => {
    const reply = (status, body = "") => ({ ok: status < 400, status, text: async () => body });

    it("retries a 429 and returns the parsed body", async () => {
        const replies = [reply(429), reply(429), reply(200, '{"data":1}')];
        const calls = [];
        const fetcher = async (url, init) => (calls.push([url, init]), replies.shift());
        const result = await request({ token: "t", fetcher, sleep: async () => {} }, "GET", "/projects/1/files");
        expect(result).toEqual({ data: 1 });
        expect(calls).toHaveLength(3);
        expect(calls[0][0]).toBe("https://api.crowdin.com/api/v2/projects/1/files");
        expect(calls[0][1].headers.Authorization).toBe("Bearer t");
    });

    it("throws on an error status without echoing the token", async () => {
        const fetcher = async () => reply(403, "forbidden");
        const call = request({ token: "secret", fetcher, sleep: async () => {} }, "PATCH", "/x", []);
        await expect(call).rejects.toThrow("PATCH /x -> 403: forbidden");
        await expect(call).rejects.not.toThrow("secret");
    });
});
