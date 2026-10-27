import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
    command: vi.fn(async () => null),
    listen: vi.fn(async () => () => {}),
}));
vi.mock("$lib/core/tauri", () => tauri);

import * as api from "./api";

describe("builds api", () => {
    beforeEach(() => {
        tauri.command.mockClear();
        tauri.listen.mockClear();
    });

    it("calls each command with the argument names Tauri expects", async () => {
        const build = {} as never;
        const draft = { id: "" } as never;
        await api.buildsLocal().catch(() => {});
        await api.buildsSave({ kind: "new", build });
        await api.buildsSave({ kind: "new", build }, "d-1");
        await api.buildsDelete("Unpublished", 3, "ab");
        await api.buildsFavourite({ base: "cd" });
        await api.buildsFavourite({ id: 3 });
        await api.buildsFavourite({ view: build });
        await api.buildsUnfavourite(381204);
        await api.buildsQueueCancel("100-0");
        await api.buildsQueueResolve("100-0", "game");
        await api.buildsFlush();
        await api.buildsHistory(3);
        await api.buildsHistoryGet(3, "100-0");
        await api.buildsBackups();
        await api.buildsDrafts();
        await api.buildsDraftSave(draft);
        await api.buildsDraftDelete("d-1");
        await api.buildCodeExport({ kind: "new", build });
        await api.buildCodeImport("KLUv/Q==");

        expect(tauri.command.mock.calls).toEqual([
            ["builds_local"],
            ["builds_save", { request: { kind: "new", build } }],
            ["builds_save", { request: { kind: "new", build }, draftId: "d-1" }],
            ["builds_delete", { section: "Unpublished", id: 3, base: "ab" }],
            ["builds_favourite", { base: "cd", id: null, view: null }],
            ["builds_favourite", { base: null, id: 3, view: null }],
            ["builds_favourite", { base: null, id: null, view: build }],
            ["builds_unfavourite", { id: 381204 }],
            ["builds_queue_cancel", { id: "100-0" }],
            ["builds_queue_resolve", { id: "100-0", choice: "game" }],
            ["builds_flush"],
            ["builds_history", { buildId: 3 }],
            ["builds_history_get", { buildId: 3, versionId: "100-0" }],
            ["builds_backups"],
            ["builds_drafts"],
            ["builds_draft_save", { draft }],
            ["builds_draft_delete", { id: "d-1" }],
            ["build_code_export", { request: { kind: "new", build } }],
            ["build_code_import", { code: "KLUv/Q==" }],
        ]);
    });

    it("passes a well formed local file through", async () => {
        const local = {
            accountId: 1,
            exists: true,
            gameRunning: false,
            builds: [{ section: "Favorites", build: {}, base: "ab", warnings: [] }],
            lastUsed: [],
            queue: [],
            nextLocalId: null,
        };
        tauri.command.mockResolvedValueOnce(local as never);
        await expect(api.buildsLocal()).resolves.toEqual(local);
    });

    it.each([
        ["null", null],
        ["garbage", { garbage: true }],
        [
            "a builds field that is not a list",
            { accountId: 1, gameRunning: false, builds: {}, lastUsed: [], queue: [] },
        ],
        [
            "a build entry without its build",
            { accountId: 1, gameRunning: false, builds: [{ section: "Favorites" }], lastUsed: [], queue: [] },
        ],
        ["a missing queue", { accountId: 1, gameRunning: false, builds: [], lastUsed: [] }],
    ])("rejects a local file of %s as a normal failure", async (_, bad) => {
        tauri.command.mockResolvedValueOnce(bad as never);
        await expect(api.buildsLocal()).rejects.toThrow("builds_local answered an unexpected shape");
    });

    it("listens for queued saves written after the game closes", async () => {
        const handler = vi.fn();
        await api.onFlushed(handler);
        expect(tauri.listen).toHaveBeenCalledWith("builds://flushed", handler);
    });
});
