import { invoke } from "@tauri-apps/api/core";

export type KvStore =
    | "app-settings"
    | "connection-settings"
    | "server-picker-cache"
    | "presets"
    | "stats-cache"
    | "frame-runs"
    | "dispatch-editions";

// The backend runs each call on its own worker thread, so two calls in flight can land in either order.
// Waiting on the store's previous call keeps the last write the one that sticks, and a read sees it.
const pending = new Map<KvStore, Promise<unknown>>();

function inOrder<T>(store: KvStore, run: () => Promise<T>): Promise<T> {
    const next = (pending.get(store) ?? Promise.resolve()).then(run, run);
    const settled = next.catch(() => {});
    pending.set(store, settled);
    void settled.then(() => {
        if (pending.get(store) === settled) pending.delete(store);
    });
    return next;
}

export async function kvGet<T>(store: KvStore, key: string): Promise<T | null> {
    return (await inOrder(store, () => invoke<T | null>("kv_get", { store, key }))) ?? null;
}

export function kvSet(store: KvStore, key: string, value: unknown): Promise<void> {
    return inOrder(store, () => invoke("kv_set", { store, key, value }));
}

export function kvDelete(store: KvStore, key: string): Promise<void> {
    return inOrder(store, () => invoke("kv_delete", { store, key }));
}
