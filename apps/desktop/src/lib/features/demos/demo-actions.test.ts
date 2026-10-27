import { beforeEach, describe, expect, it, vi } from "vitest";

const { answers, toast } = vi.hoisted(() => ({
    answers: new Map<string, () => unknown>(),
    toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));
vi.mock("svelte-sonner", () => ({ toast }));

import { DemoList } from "./demo-list.svelte";
import type { Demo } from "./demos";

const demo = { fileName: "1.dem", matchId: 1, status: "complete" } as unknown as Demo;
const fail = () => Promise.reject(new Error("boom at line 3"));

function lastError(): string {
    return toast.error.mock.calls.at(-1)?.[0];
}

describe("replay actions that fail", () => {
    beforeEach(() => {
        answers.clear();
        answers.set("list_demos", () => ({ dir: "C:/replays", referenceBuild: null, demos: [] }));
        toast.error.mockReset();
    });

    it("pin says the pin did not change", async () => {
        answers.set("set_pinned", fail);
        await new DemoList().pin(demo, true);
        expect(lastError()).toBe("Couldn't pin that replay. Try again.");
    });

    it("delete says nothing was deleted and closes the dialog", async () => {
        answers.set("delete_demos", fail);
        const list = new DemoList();
        list.deleteOpen = true;
        list.deleteNames = ["1.dem"];
        await list.confirmDelete();
        expect(lastError()).toBe("Couldn't delete those replays. Try again.");
        expect(list.deleting).toBe(false);
        expect(list.deleteOpen).toBe(false);
    });

    it("delete preview failure does not open the dialog", async () => {
        answers.set("delete_preview", fail);
        const list = new DemoList();
        await list.askDelete(["1.dem"]);
        expect(lastError()).toBe("Couldn't delete those replays. Try again.");
        expect(list.deleteOpen).toBe(false);
    });

    it("reveal and open folder say the folder could not open", async () => {
        answers.set("reveal_demo", fail);
        answers.set("open_replays_dir", fail);
        const list = new DemoList();
        await list.reveal(demo);
        expect(lastError()).toBe("Couldn't open the replays folder.");
        await list.openFolder();
        expect(lastError()).toBe("Couldn't open the replays folder.");
    });

    it("never shows the log hint for an unknown error code", async () => {
        answers.set("set_pinned", () => Promise.reject({ code: "common.internal" }));
        await new DemoList().pin(demo, false);
        expect(lastError()).not.toMatch(/log/i);
    });
});
