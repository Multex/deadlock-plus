import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

const { answers, current } = vi.hoisted(() => ({
    answers: new Map<string, () => unknown>(),
    current: { list: null as unknown },
}));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
// The panel loads in onMount, which never runs under svelte/server, so the test loads the list the
// panel will render beforehand and hands that instance to the panel's constructor call.
vi.mock("$lib/features/storage/entries.svelte", async (original) => {
    const real = (await original()) as typeof import("./entries.svelte");
    return {
        ...real,
        StorageList: class {
            constructor() {
                return current.list as never;
            }
        },
    };
});

import { storageEntries } from "./storage";
import StoragePanel from "./components/storage-panel.svelte";

const { StorageList } = await vi.importActual<typeof import("./entries.svelte")>("./entries.svelte");

async function renderAfterLoad() {
    const list = new StorageList(storageEntries);
    current.list = list;
    await list.load();
    return { list, body: render(StoragePanel).body };
}

describe("storage list load failure", () => {
    beforeEach(() => {
        answers.clear();
        answers.set("storage_entries", () => [{ id: "replays", path: null, clearable: false }]);
    });

    it("rejects a storage_entries answer that is not a list of entries", async () => {
        answers.set("storage_entries", () => null);
        await expect(storageEntries()).rejects.toThrow();
        answers.set("storage_entries", () => [{ id: "replays" }]);
        await expect(storageEntries()).rejects.toThrow();
    });

    for (const [label, answer] of [
        ["throws", () => Promise.reject({ code: "common.internal" })],
        ["answers null", () => null],
    ] as const) {
        it(`shows a calm region error with a retry when storage_entries ${label}`, async () => {
            answers.set("storage_entries", answer);
            const { body } = await renderAfterLoad();
            expect(body).toContain('data-region="storage-list"');
            expect(body).toContain('data-region-state="error"');
            expect(body).toContain("Retry");
            expect(body).not.toContain("Check the log");
            expect(body).not.toContain("Something went wrong");
            expect(body).not.toContain("Looking around");
        });
    }

    it("retry reloads the list after a failure", async () => {
        answers.set("storage_entries", () => null);
        const { list } = await renderAfterLoad();
        expect(list.error).toBeTruthy();
        answers.set("storage_entries", () => [{ id: "replays", path: null, clearable: false }]);
        expect(await list.load()).toBe(true);
        expect(list.error).toBeNull();
        const body = render(StoragePanel).body;
        expect(body).not.toContain('data-region-state="error"');
        expect(body).toContain("Total found");
    });
});
