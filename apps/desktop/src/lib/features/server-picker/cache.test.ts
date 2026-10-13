import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerData } from "./types";

const mocks = vi.hoisted(() => ({ kvGet: vi.fn(), kvSet: vi.fn(), fetchServerGroups: vi.fn() }));

vi.mock("$lib/core/kv", () => ({ kvGet: mocks.kvGet, kvSet: mocks.kvSet }));
vi.mock("./api", () => ({ fetchServerGroups: mocks.fetchServerGroups }));

import { savedOrFetchedServerData } from "./cache";

const saved = { clustered: [], unclustered: [], saved: true } as unknown as ServerData;
const fetched = { clustered: [], unclustered: [], saved: false } as unknown as ServerData;

beforeEach(() => {
    mocks.kvGet.mockReset();
    mocks.kvSet.mockReset().mockResolvedValue(undefined);
    mocks.fetchServerGroups.mockReset().mockResolvedValue(fetched);
});

describe("savedOrFetchedServerData", () => {
    it("answers from the saved list without fetching", async () => {
        mocks.kvGet.mockResolvedValue(saved);
        expect(await savedOrFetchedServerData("deadlock")).toBe(saved);
        expect(mocks.fetchServerGroups).not.toHaveBeenCalled();
    });

    it("fetches the list when none is saved yet, and saves it", async () => {
        mocks.kvGet.mockResolvedValue(null);
        expect(await savedOrFetchedServerData("deadlock")).toBe(fetched);
        expect(mocks.fetchServerGroups).toHaveBeenCalledWith("deadlock");
        expect(mocks.kvSet).toHaveBeenCalledWith("server-picker-cache", "serverData:deadlock", fetched);
    });

    it("rejects when nothing is saved and the fetch fails", async () => {
        mocks.kvGet.mockResolvedValue(null);
        mocks.fetchServerGroups.mockRejectedValue(new Error("no route"));
        await expect(savedOrFetchedServerData("deadlock")).rejects.toThrow("no route");
    });
});
