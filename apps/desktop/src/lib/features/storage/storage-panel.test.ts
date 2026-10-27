import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

const { answers, current } = vi.hoisted(() => ({
    answers: new Map<string, () => unknown>(),
    current: { list: null as unknown, sizes: null as unknown },
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

vi.mock("$lib/features/storage/sizes.svelte", async (original) => {
    const real = (await original()) as typeof import("./sizes.svelte");
    return {
        ...real,
        StorageSizes: class {
            constructor(read: never) {
                return (current.sizes ?? new real.StorageSizes(read)) as never;
            }
        },
    };
});

import { storageEntries, storageEntryStats } from "./storage";
import StoragePanel from "./components/storage-panel.svelte";

const { StorageList } = await vi.importActual<typeof import("./entries.svelte")>("./entries.svelte");
const { StorageSizes } = await vi.importActual<typeof import("./sizes.svelte")>("./sizes.svelte");

async function renderAfterLoad() {
    const list = new StorageList(storageEntries);
    current.list = list;
    await list.load();
    return { list, body: render(StoragePanel).body };
}

describe("storage list load failure", () => {
    beforeEach(() => {
        answers.clear();
        current.sizes = null;
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

describe("storage entry sizes", () => {
    beforeEach(() => {
        answers.clear();
        current.sizes = null;
        answers.set("storage_entries", () => [{ id: "replays", path: "C:/x/replays", clearable: true }]);
    });

    it("rejects a storage_entry_stats answer that is not a size", async () => {
        for (const answer of [null, { garbage: true }, { bytes: "12", count: null, oldestSecs: null }]) {
            answers.set("storage_entry_stats", () => answer);
            await expect(storageEntryStats("replays")).rejects.toThrow();
        }
    });

    it("passes a good storage_entry_stats answer through", async () => {
        const stats = { bytes: 2048, count: 3, oldestSecs: null };
        answers.set("storage_entry_stats", () => stats);
        await expect(storageEntryStats("replays")).resolves.toEqual(stats);
    });

    it("shows Couldn't measure on the row when storage_entry_stats answers null", async () => {
        answers.set("storage_entry_stats", () => null);
        const list = new StorageList(storageEntries);
        const sizes = new StorageSizes(storageEntryStats);
        current.list = list;
        current.sizes = sizes;
        await list.load();
        await sizes.measure("replays");

        expect(sizes.row("replays")).toBe("failed");
        const body = render(StoragePanel).body;
        expect(body).toContain("Couldn't measure");
        expect(body).toContain("At least");
    });
});
