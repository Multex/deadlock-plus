import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { kvDelete, kvGet, kvSet } from "./kv";

describe("kv", () => {
    beforeEach(() => {
        invoke.mockReset();
    });

    it("reads a missing key as null", async () => {
        invoke.mockResolvedValue(null);
        expect(await kvGet("app-settings", "theme")).toBeNull();
        expect(invoke).toHaveBeenCalledWith("kv_get", { store: "app-settings", key: "theme" });
    });

    it("returns a stored falsy value as is", async () => {
        invoke.mockResolvedValue(false);
        expect(await kvGet<boolean>("app-settings", "closeToTray")).toBe(false);
    });

    it("passes writes and deletes to the backend", async () => {
        invoke.mockResolvedValue(undefined);
        await kvSet("presets", "presets", [1]);
        await kvDelete("app-settings", "theme");
        expect(invoke).toHaveBeenCalledWith("kv_set", { store: "presets", key: "presets", value: [1] });
        expect(invoke).toHaveBeenCalledWith("kv_delete", { store: "app-settings", key: "theme" });
    });

    it("surfaces backend failures", async () => {
        invoke.mockRejectedValue(new Error("nope"));
        await expect(kvSet("presets", "presets", [])).rejects.toThrow("nope");
    });

    function deferred() {
        let resolve!: (v?: unknown) => void;
        let reject!: (e: unknown) => void;
        const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
        return { promise, resolve, reject };
    }
    const flush = () => new Promise((r) => setTimeout(r, 0));

    it("sends a store's writes one at a time, in call order", async () => {
        const first = deferred();
        invoke.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
        const a = kvSet("stats-cache", "k", 1);
        const b = kvSet("stats-cache", "k", 2);
        await flush();
        expect(invoke).toHaveBeenCalledTimes(1);
        first.resolve();
        await Promise.all([a, b]);
        expect(invoke.mock.calls.map((c) => c[1].value)).toEqual([1, 2]);
    });

    it("reads a store after the writes already sent to it", async () => {
        const write = deferred();
        invoke.mockReturnValueOnce(write.promise).mockResolvedValue("new");
        void kvSet("stats-cache", "k", "new");
        const read = kvGet("stats-cache", "k");
        await flush();
        expect(invoke).toHaveBeenCalledTimes(1);
        write.resolve();
        expect(await read).toBe("new");
    });

    it("keeps going after a failed write", async () => {
        invoke.mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
        const failed = kvSet("presets", "a", 1);
        const next = kvDelete("presets", "a");
        await expect(failed).rejects.toThrow("disk full");
        await expect(next).resolves.toBeUndefined();
    });

    it("does not hold one store's writes behind another's", async () => {
        invoke.mockReturnValueOnce(deferred().promise).mockResolvedValue(undefined);
        void kvSet("stats-cache", "k", 1);
        await kvSet("presets", "k", 2);
        expect(invoke).toHaveBeenCalledTimes(2);
    });
});
