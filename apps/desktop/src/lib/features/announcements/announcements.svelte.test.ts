import { describe, expect, it, vi } from "vitest";
import type { Announcement } from "@deadlock-plus/ipc-types/Announcement";
import { Announcements, REFRESH_MS, type AnnouncementDeps } from "./announcements.svelte";

const item = (id: string, severity: Announcement["severity"] = "info"): Announcement => ({
    id,
    title: id,
    body: "",
    severity,
    link: null,
});

function setup(feed: Announcement[] = [], stored: unknown = null) {
    const state = { online: true, feed, stored };
    const startup: (() => void)[] = [];
    const timers: { run: () => void; ms: number }[] = [];
    const onlines: (() => void)[] = [];
    const deps = {
        fetch: vi.fn(async () => state.feed),
        online: () => state.online,
        load: vi.fn(async () => state.stored),
        save: vi.fn(async (ids: string[]) => void (state.stored = ids)),
        afterStartup: (run: () => void) => {
            startup.push(run);
            return () => {};
        },
        every: (run: () => void, ms: number) => {
            timers.push({ run, ms });
            return () => {};
        },
        onOnline: (run: () => void) => {
            onlines.push(run);
            return () => {};
        },
    } satisfies AnnouncementDeps;
    const store = new Announcements(deps);
    return { store, deps, state, startup, timers, onlines };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("announcements store", () => {
    it("fetches only once startup is idle, then every 6 hours", async () => {
        const { store, deps, startup, timers } = setup([item("a")]);
        store.start();
        await flush();
        expect(deps.fetch).not.toHaveBeenCalled();
        expect(store.shown).toEqual([]);

        startup.forEach((run) => run());
        await flush();
        expect(store.shown.map((a) => a.id)).toEqual(["a"]);

        expect(timers.map((t) => t.ms)).toEqual([REFRESH_MS]);
        expect(REFRESH_MS).toBe(6 * 60 * 60 * 1000);
        timers[0]!.run();
        await flush();
        expect(deps.fetch).toHaveBeenCalledTimes(2);
    });

    it("skips the fetch while offline and catches up once back online", async () => {
        const { store, deps, state, onlines } = setup([item("a")]);
        store.start();
        state.online = false;
        await store.refresh();
        expect(deps.fetch).not.toHaveBeenCalled();

        state.online = true;
        onlines.forEach((run) => run());
        await flush();
        expect(deps.fetch).toHaveBeenCalledTimes(1);
        expect(store.shown.map((a) => a.id)).toEqual(["a"]);

        onlines.forEach((run) => run());
        await flush();
        expect(deps.fetch).toHaveBeenCalledTimes(1);
    });

    it("stays silent when the fetch fails and keeps what it showed", async () => {
        const { store, deps } = setup([item("a")]);
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        await store.refresh();
        deps.fetch.mockRejectedValueOnce({ code: "announcements.bad_signature" });
        await expect(store.refresh()).resolves.toBeUndefined();
        expect(store.shown.map((a) => a.id)).toEqual(["a"]);
        expect(error).not.toHaveBeenCalled();
        error.mockRestore();
    });

    it("dismisses info and warning items for good, by id", async () => {
        const { store, deps, state } = setup([item("i", "info"), item("w", "warning")]);
        store.start();
        await store.refresh();
        await store.dismiss("i");
        await store.dismiss("w");
        expect(store.shown).toEqual([]);
        expect(deps.save).toHaveBeenLastCalledWith(["i", "w"]);

        const relaunched = new Announcements({ ...deps, load: async () => state.stored });
        relaunched.start();
        await relaunched.refresh();
        expect(relaunched.shown).toEqual([]);
    });

    it("never dismisses a critical item", async () => {
        const { store, deps } = setup([item("c", "critical")]);
        store.start();
        await store.refresh();
        await store.dismiss("c");
        expect(store.shown.map((a) => a.id)).toEqual(["c"]);
        expect(deps.save).not.toHaveBeenCalled();
    });

    it("prunes dismissed ids the feed no longer has, after a fetch", async () => {
        const { store, deps, state } = setup([item("kept")], ["gone", "kept"]);
        store.start();
        await store.refresh();
        expect(deps.save).toHaveBeenCalledWith(["kept"]);
        expect(state.stored).toEqual(["kept"]);
    });

    it("leaves the stored list alone when the fetch fails", async () => {
        const { store, deps } = setup([], ["kept"]);
        deps.fetch.mockRejectedValue(new Error("offline"));
        store.start();
        await store.refresh();
        expect(deps.save).not.toHaveBeenCalled();
    });

    it("treats a list it cannot read as nothing dismissed", async () => {
        const { store, deps } = setup([item("a")]);
        deps.load.mockRejectedValue(new Error("kv"));
        store.start();
        await store.refresh();
        expect(store.shown.map((a) => a.id)).toEqual(["a"]);
    });
});
