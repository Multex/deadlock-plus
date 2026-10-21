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
        await api.buildsLocal();
        await api.buildsSave({ kind: "new", build });
        await api.buildsDelete("Unpublished", 3, "ab");
        await api.buildsFavourite({ base: "cd" });
        await api.buildsFavourite({ id: 3 });
        await api.buildsUnfavourite(381204);
        await api.buildsQueueCancel("100-0");
        await api.buildsQueueResolve("100-0", "game");
        await api.buildsFlush();
        await api.buildsHistory(3);
        await api.buildsHistoryGet(3, "100-0");
        await api.buildsBackups();

        expect(tauri.command.mock.calls).toEqual([
            ["builds_local"],
            ["builds_save", { request: { kind: "new", build } }],
            ["builds_delete", { section: "Unpublished", id: 3, base: "ab" }],
            ["builds_favourite", { base: "cd", id: null }],
            ["builds_favourite", { base: null, id: 3 }],
            ["builds_unfavourite", { id: 381204 }],
            ["builds_queue_cancel", { id: "100-0" }],
            ["builds_queue_resolve", { id: "100-0", choice: "game" }],
            ["builds_flush"],
            ["builds_history", { buildId: 3 }],
            ["builds_history_get", { buildId: 3, versionId: "100-0" }],
            ["builds_backups"],
        ]);
    });

    it("listens for queued saves written after the game closes", async () => {
        const handler = vi.fn();
        await api.onFlushed(handler);
        expect(tauri.listen).toHaveBeenCalledWith("builds://flushed", handler);
    });
});
