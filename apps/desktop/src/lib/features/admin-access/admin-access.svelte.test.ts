import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import catalog from "../../../../../../locales/en.json";
import type { AdminAccessOutcome } from "@deadlock-plus/ipc-types/AdminAccessOutcome";
import type { AdminAccessStatus } from "@deadlock-plus/ipc-types/AdminAccessStatus";
import type { LiveState } from "@deadlock-plus/ipc-types/LiveState";
import { t } from "$lib/core/i18n.svelte";

vi.mock("$lib/features/live/live.svelte", () => ({ live: { state: null } }));

import { AdminAccessStore, type AdminAccessDeps } from "./admin-access.svelte";

const ERRORS = catalog.errors.admin_access;

class FakeLive {
    state = $state.raw<LiveState | null>(null);
}

function status(over: Partial<AdminAccessStatus> = {}): AdminAccessStatus {
    return { elevated: false, route: "needsPermission", canPrompt: true, gameRunsAsAdmin: false, ...over };
}

let poll = () => {};

// Vitest compiles Svelte for the server here, where `$effect` never runs, so the store's watch is driven by hand.
const pollingWatch: AdminAccessDeps["watch"] = (read, onChange) => {
    let last: string | null | undefined;
    poll = () => {
        const key = read();
        if (key === last) return;
        last = key;
        onChange(key);
    };
    poll();
    return () => {
        poll = () => {};
    };
};

async function settle() {
    flushSync();
    poll();
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

let events: Map<string, () => void>;
let unlistened: string[];

const fakeListen: AdminAccessDeps["listen"] = async (event, handler) => {
    events.set(event, handler);
    return () => {
        events.delete(event);
        unlistened.push(event);
    };
};

let fake: FakeLive;
let api: {
    status: ReturnType<typeof vi.fn<() => Promise<AdminAccessStatus>>>;
    allow: ReturnType<typeof vi.fn<(always: boolean) => Promise<AdminAccessOutcome>>>;
    remove: ReturnType<typeof vi.fn<() => Promise<void>>>;
};
let store: AdminAccessStore;

beforeEach(() => {
    fake = new FakeLive();
    api = {
        status: vi.fn(async () => status()),
        allow: vi.fn(async (): Promise<AdminAccessOutcome> => ({ status: "applied" })),
        remove: vi.fn(async () => {}),
    };
    events = new Map();
    unlistened = [];
    store = new AdminAccessStore({ live: fake, api, watch: pollingWatch, listen: fakeListen });
    poll = () => {};
});

describe("admin access status", () => {
    it("is unknown and shows no buttons until the first answer", () => {
        expect(store.status).toBeNull();
        expect(store.buttons).toEqual({ kind: "hidden" });
    });

    it("loads on start", async () => {
        store.start();
        await settle();
        expect(api.status).toHaveBeenCalledTimes(2);
        expect(store.status).toEqual(status());
        expect(store.buttons).toEqual({ kind: "prompt", allow: true, disabled: null });
    });

    it("refreshes when the live phase changes, so prompts lock during a match", async () => {
        store.start();
        await settle();
        api.status.mockResolvedValue(status({ canPrompt: false }));
        fake.state = { phase: "pregame", matchPresent: true };
        await settle();
        expect(api.status).toHaveBeenCalledTimes(3);
        expect(store.buttons).toEqual({ kind: "prompt", allow: true, disabled: "after_match" });

        fake.state = { phase: "pregame", matchPresent: false };
        await settle();
        expect(api.status).toHaveBeenCalledTimes(3);

        api.status.mockResolvedValue(status());
        fake.state = { phase: "postMatch", matchPresent: true };
        await settle();
        expect(api.status).toHaveBeenCalledTimes(4);
        expect(store.buttons).toEqual({ kind: "prompt", allow: true, disabled: null });
    });

    it("refreshes when the backend says the game's access changed, with no phase change", async () => {
        store.start();
        await settle();
        expect(api.status).toHaveBeenCalledTimes(2);

        api.status.mockResolvedValue(status({ gameRunsAsAdmin: true }));
        events.get("admin-access-changed")?.();
        await settle();
        expect(api.status).toHaveBeenCalledTimes(3);
        expect(store.status?.gameRunsAsAdmin).toBe(true);
    });

    it("re-checks once the listener is registered, so a flip during startup is not missed", async () => {
        let register: () => void = () => {};
        store = new AdminAccessStore({
            live: fake,
            api,
            watch: pollingWatch,
            listen: (event, handler) =>
                new Promise((resolve) => {
                    register = () => resolve(fakeListen(event, handler));
                }),
        });
        store.start();
        await settle();
        expect(store.status?.gameRunsAsAdmin).toBe(false);

        api.status.mockResolvedValue(status({ gameRunsAsAdmin: true }));
        register();
        await settle();
        expect(store.status?.gameRunsAsAdmin).toBe(true);
    });

    it("stops listening when stopped, even before the listener was registered", async () => {
        const stop = store.start();
        stop();
        await settle();
        expect(events.has("admin-access-changed")).toBe(false);
        expect(unlistened).toEqual(["admin-access-changed"]);

        const again = store.start();
        await settle();
        again();
        expect(events.size).toBe(0);
        expect(unlistened).toEqual(["admin-access-changed", "admin-access-changed"]);
    });

    it("keeps the last status when the status command fails", async () => {
        store.start();
        await settle();
        api.status.mockRejectedValue(new Error("not in Tauri"));
        await store.refresh();
        expect(store.status).toEqual(status());
    });

    it("ignores an older answer that arrives after a newer one", async () => {
        let resolveFirst: (s: AdminAccessStatus) => void = () => {};
        api.status.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
        const first = store.refresh();
        api.status.mockResolvedValueOnce(status({ route: "helper" }));
        await store.refresh();
        resolveFirst(status());
        await first;
        expect(store.status?.route).toBe("helper");
    });
});

describe("allow", () => {
    it("re-runs after access was applied and refreshes the status", async () => {
        api.status.mockResolvedValue(status({ route: "helper" }));
        const result = await store.allow(true);
        expect(api.allow).toHaveBeenCalledWith(true);
        expect(result).toEqual({ kind: "applied", retry: true, message: null });
        expect(store.status?.route).toBe("helper");
    });

    it("is busy while the request runs", async () => {
        let finish: (o: AdminAccessOutcome) => void = () => {};
        api.allow.mockImplementationOnce(() => new Promise((r) => (finish = r)));
        const pending = store.allow(false);
        expect(store.busy).toBe(true);
        finish({ status: "applied" });
        await pending;
        expect(store.busy).toBe(false);
    });

    it("says nothing changed after a cancelled prompt", async () => {
        api.allow.mockResolvedValueOnce({ status: "cancelled" });
        expect(await store.allow(false)).toEqual({
            kind: "cancelled",
            retry: false,
            message: t("admin_access.nothing_changed"),
        });
    });

    it("shows a blocked Always allow and still re-runs", async () => {
        api.allow.mockResolvedValueOnce({
            status: "failed",
            error: { code: "admin_access.always_allow_blocked", params: {} },
        });
        expect(await store.allow(true)).toEqual({ kind: "failed", retry: true, message: ERRORS.always_allow_blocked });
    });

    it("shows any other failure without re-running", async () => {
        api.allow.mockResolvedValueOnce({ status: "failed", error: { code: "admin_access.allow_failed", params: {} } });
        expect(await store.allow(true)).toEqual({ kind: "failed", retry: false, message: ERRORS.allow_failed });
    });

    it("turns a refused command into a message and refreshes", async () => {
        api.allow.mockRejectedValueOnce({ code: "admin_access.in_match", params: {} });
        expect(await store.allow(false)).toEqual({ kind: "failed", retry: false, message: ERRORS.in_match });
        expect(api.status).toHaveBeenCalledTimes(1);
        expect(store.busy).toBe(false);
    });

    it("never shows developer text from a thrown JavaScript error", async () => {
        api.allow.mockRejectedValueOnce(new Error("invoke failed"));
        expect(await store.allow(false)).toEqual({ kind: "failed", retry: false, message: ERRORS.allow_failed });
    });
});

describe("remove", () => {
    it("removes Always allow and refreshes the status", async () => {
        api.status.mockResolvedValue(status({ route: "needsPermission" }));
        expect(await store.remove()).toBeNull();
        expect(api.remove).toHaveBeenCalledTimes(1);
        expect(api.status).toHaveBeenCalledTimes(1);
        expect(store.busy).toBe(false);
    });

    it("turns a failure into a message", async () => {
        api.remove.mockRejectedValueOnce({ code: "admin_access.remove_failed", params: {} });
        expect(await store.remove()).toBe(ERRORS.remove_failed);
        api.remove.mockRejectedValueOnce(new Error("invoke failed"));
        expect(await store.remove()).toBe(ERRORS.remove_failed);
    });
});
