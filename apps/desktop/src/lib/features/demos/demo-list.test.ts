import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

const { answers, current } = vi.hoisted(() => ({
    answers: new Map<string, () => unknown>(),
    current: { store: null as unknown },
}));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));

// The page loads in onMount, which never runs under svelte/server, so the test loads the store the
// page will render beforehand and hands that instance to the page's constructor call.
vi.mock("$lib/features/demos/demo-list.svelte", async (original) => {
    const real = (await original()) as typeof import("./demo-list.svelte");
    return {
        ...real,
        DemoList: class {
            constructor() {
                return current.store as never;
            }
        },
    };
});

import { fetchDemoMetadata, listDemos, localAccountIds } from "./api";
import ReplaysPage from "../../../routes/(app)/demos/+page.svelte";

const { DemoList } = await vi.importActual<typeof import("./demo-list.svelte")>("./demo-list.svelte");
type DemoList = InstanceType<typeof DemoList>;
import ListError from "./components/list-error.svelte";

const LISTING = { dir: "C:/replays", referenceBuild: null, demos: [] };

function renderError(list: DemoList) {
    return render(ListError, { props: { onretry: list.load } }).body;
}

describe("replays list load failure", () => {
    beforeEach(() => {
        answers.clear();
        answers.set("list_demos", () => LISTING);
    });

    it("rejects a list_demos answer that is not a listing", async () => {
        answers.set("list_demos", () => null);
        await expect(listDemos()).rejects.toThrow();
        answers.set("list_demos", () => ({ dir: "C:/replays", demos: "nope" }));
        await expect(listDemos()).rejects.toThrow();
    });

    for (const [label, answer] of [
        ["throws", () => Promise.reject({ code: "common.internal" })],
        ["answers null", () => null],
    ] as const) {
        it(`shows a calm region error with a retry when list_demos ${label}`, async () => {
            answers.set("list_demos", answer);
            const list = new DemoList();
            await list.load();
            expect(list.loading).toBe(false);
            expect(list.error).toBeTruthy();
            const body = renderError(list);
            expect(body).toContain('data-region="demos-list"');
            expect(body).toContain('data-region-state="error"');
            expect(body).toContain("Retry");
            expect(body).not.toContain("Check the log");
            expect(body).not.toContain("Something went wrong");
            expect(body).not.toContain("Reading replays");
        });
    }

    it("the Replays page shows the region error in place of the list", async () => {
        answers.set("list_demos", () => null);
        const list = new DemoList();
        current.store = list;
        await list.load();
        const body = render(ReplaysPage).body;
        expect(body).toContain('data-region="demos-list"');
        expect(body).toContain("Couldn't read your replays.");
        expect(body).not.toContain("Reading replays");
    });

    it("retry reloads the list after a failure", async () => {
        answers.set("list_demos", () => null);
        const list = new DemoList();
        await list.load();
        expect(list.error).toBeTruthy();
        answers.set("list_demos", () => LISTING);
        await list.load();
        expect(list.error).toBeNull();
        expect(list.listing).toEqual(LISTING);
    });
});

describe("replays rows when a per-row command answers a bad shape", () => {
    beforeEach(() => {
        answers.clear();
        answers.set("list_demos", () => LISTING);
    });

    it("rejects a local_steam_account_ids answer that is not a list of ids", async () => {
        answers.set("local_steam_account_ids", () => null);
        await expect(localAccountIds()).rejects.toThrow();
        answers.set("local_steam_account_ids", () => ["76561198000000000"]);
        await expect(localAccountIds()).rejects.toThrow();
        answers.set("local_steam_account_ids", () => [12, 34]);
        await expect(localAccountIds()).resolves.toEqual([12, 34]);
    });

    it("keeps the account ids empty when local_steam_account_ids answers null", async () => {
        answers.set("local_steam_account_ids", () => null);
        const list = new DemoList();
        list.init();
        await new Promise((r) => setTimeout(r, 0));
        expect(list.accountIds).toEqual([]);
    });

    it("rejects a demo_metadata answer that is not a meta result", async () => {
        for (const bad of [null, "ok", { state: "ok" }, { state: "ok", summary: { players: null } }, { state: "?" }]) {
            answers.set("demo_metadata", () => bad);
            await expect(fetchDemoMetadata(1)).rejects.toThrow();
        }
        answers.set("demo_metadata", () => ({ state: "missing" }));
        await expect(fetchDemoMetadata(1)).resolves.toEqual({ state: "missing" });
    });

    it("marks only that row as unavailable when demo_metadata answers null", async () => {
        answers.set("demo_metadata", () => null);
        const list = new DemoList();
        const fetchMetadata = (list as unknown as { fetchMetadata(ids: number[]): Promise<void> }).fetchMetadata;
        await expect(fetchMetadata.call(list, [7])).resolves.toBeUndefined();
        expect(list.meta[7]?.state).toBe("error");
    });
});
