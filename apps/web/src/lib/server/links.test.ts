import { DEFAULT_LINKS, INVITES } from "@deadlock-plus/links";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadLinks, resetLinks } from "./links";

const STORED = {
    invites: [...INVITES, { ref: "instagram", channel: "web", code: "abcDEF12" }],
    landings: [{ path: "ig", ref: "instagram" }],
};

function store(value: string | null | (() => never)) {
    return { get: vi.fn(async () => (typeof value === "function" ? value() : value)) };
}

beforeEach(() => resetLinks());

describe("loadLinks", () => {
    it("reads the stored table", async () => {
        expect(await loadLinks(store(JSON.stringify(STORED)), 0)).toEqual(STORED);
    });

    it("uses the built-in list without a store, a stored table or a valid one", async () => {
        expect(await loadLinks(undefined, 0)).toBe(DEFAULT_LINKS);
        resetLinks();
        expect(await loadLinks(store(null), 0)).toBe(DEFAULT_LINKS);
        resetLinks();
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect(await loadLinks(store("{ broken"), 0)).toBe(DEFAULT_LINKS);
    });

    it("uses the built-in list when the store cannot be read", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const failing = store(() => {
            throw new Error("KV down");
        });
        expect(await loadLinks(failing, 0)).toBe(DEFAULT_LINKS);
    });

    it("reads the store at most once a minute", async () => {
        const kv = store(JSON.stringify(STORED));
        await loadLinks(kv, 0);
        await loadLinks(kv, 59_000);
        expect(kv.get).toHaveBeenCalledTimes(1);
        await loadLinks(kv, 60_000);
        expect(kv.get).toHaveBeenCalledTimes(2);
    });
});
