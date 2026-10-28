import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ command: vi.fn() }));

vi.mock("$lib/core/tauri", () => ({ command: mocks.command, listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock("$lib/core/i18n.svelte", () => ({ formatDate: () => "", t: (key: string) => key }));

import { AlertsStore } from "./alerts.svelte";

const alert = {
    id: "a",
    title: "t",
    link: "https://forums.playdeadlock.com/threads/x",
    source: "forum",
    published: "2026-09-16T22:41:46Z",
    kind: "Minor Update",
    summary: "",
    image: null,
    read: false,
};

function answer(value: unknown) {
    mocks.command.mockImplementation((name: string) =>
        name === "list_alerts" ? Promise.resolve(value) : Promise.resolve(undefined),
    );
}

describe("AlertsStore.refresh", () => {
    it("loads a well-formed list", async () => {
        answer([alert, { ...alert, id: "b", read: true }]);
        const store = new AlertsStore();
        await store.refresh();
        expect(store.status).toBe("ready");
        expect(store.items.map((a) => a.id)).toEqual(["a", "b"]);
        expect(store.unread).toBe(1);
    });

    it.each([
        ["null", null],
        ["an object", { alerts: [] }],
        ["a string", "oops"],
    ])("settles in an error state when list_alerts answers %s", async (_label, value) => {
        answer(value);
        const store = new AlertsStore();
        await store.refresh();
        expect(() => store.unread).not.toThrow();
        expect(store.unread).toBe(0);
        expect(store.items).toEqual([]);
        expect(store.status).toBe("error");
    });

    it("drops malformed entries and keeps the valid ones", async () => {
        answer([null, 3, { id: "x" }, { ...alert, read: "no" }, alert]);
        const store = new AlertsStore();
        await store.refresh();
        expect(store.unread).toBe(1);
        expect(store.items.map((a) => a.id)).toEqual(["a"]);
        expect(store.status).toBe("ready");
    });

    it("settles in an error state when list_alerts throws", async () => {
        mocks.command.mockImplementation(() => Promise.reject({ code: "common.internal" }));
        const store = new AlertsStore();
        await store.refresh();
        expect(store.status).toBe("error");
        expect(store.unread).toBe(0);
    });

    it("keeps the last good list when a later answer is malformed", async () => {
        answer([alert]);
        const store = new AlertsStore();
        await store.refresh();
        answer(null);
        await store.refresh();
        expect(store.status).toBe("error");
        expect(store.items.map((a) => a.id)).toEqual(["a"]);
    });

    it("fetchNow settles when every command fails", async () => {
        mocks.command.mockImplementation(() => Promise.reject(new Error("boom")));
        const store = new AlertsStore();
        await store.fetchNow();
        expect(store.status).toBe("error");
    });
});
