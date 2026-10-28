import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ command: vi.fn() }));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$lib/core/tauri", () => ({ command: mocks.command, listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock("$lib/core/i18n.svelte", () => ({ t: (key: string) => key }));

import { NotificationsStore } from "./notifications.svelte";

const item = {
    id: "a",
    kind: "maintenance",
    key: null,
    params: {},
    title: "Old",
    body: null,
    timestamp: 0,
    read: false,
    link: null,
};

function answer(value: unknown) {
    mocks.command.mockImplementation((name: string) =>
        name === "list_notifications" ? Promise.resolve(value) : Promise.resolve(undefined),
    );
}

describe("NotificationsStore.refresh", () => {
    it("loads a well-formed list", async () => {
        answer([item, { ...item, id: "b", read: true }]);
        const store = new NotificationsStore();
        await store.refresh();
        expect(store.status).toBe("ready");
        expect(store.items.map((n) => n.id)).toEqual(["a", "b"]);
        expect(store.unread).toBe(1);
    });

    it.each([
        ["null", null],
        ["an object", { items: [] }],
        ["a number", 7],
    ])("settles in an error state when list_notifications answers %s", async (_label, value) => {
        answer(value);
        const store = new NotificationsStore();
        await store.refresh();
        expect(() => store.unread).not.toThrow();
        expect(store.unread).toBe(0);
        expect(store.items).toEqual([]);
        expect(store.status).toBe("error");
    });

    it("drops malformed entries and keeps the valid ones", async () => {
        answer([null, "x", { id: "x" }, { ...item, params: null }, { ...item, timestamp: "now" }, item]);
        const store = new NotificationsStore();
        await store.refresh();
        expect(store.unread).toBe(1);
        expect(store.items.map((n) => n.id)).toEqual(["a"]);
        expect(store.status).toBe("ready");
    });

    it("settles in an error state when list_notifications throws", async () => {
        mocks.command.mockImplementation(() => Promise.reject({ code: "common.internal" }));
        const store = new NotificationsStore();
        await store.refresh();
        expect(store.status).toBe("error");
        expect(store.unread).toBe(0);
    });

    it("keeps the last good list when a later answer is malformed", async () => {
        answer([item]);
        const store = new NotificationsStore();
        await store.refresh();
        answer(null);
        await store.refresh();
        expect(store.status).toBe("error");
        expect(store.items.map((n) => n.id)).toEqual(["a"]);
    });

    it("markRead settles when the command throws", async () => {
        answer([item]);
        const store = new NotificationsStore();
        await store.refresh();
        mocks.command.mockImplementation(() => Promise.reject(new Error("boom")));
        await store.markRead("a");
    });
});
