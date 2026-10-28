import { command } from "$lib/core/tauri";
import type { ClearReport, EntryId, EntryInfo, EntryStats } from "./storage";

const isEntry = (value: unknown): value is EntryInfo => {
    if (typeof value !== "object" || value === null) return false;
    const { id, path, clearable } = value as Record<string, unknown>;
    return typeof id === "string" && (path === null || typeof path === "string") && typeof clearable === "boolean";
};

export async function storageEntries() {
    const value = await command<unknown>("storage_entries");
    if (!Array.isArray(value) || !value.every(isEntry)) throw new Error("storage_entries answered an unexpected shape");
    return value;
}

const nullableNumber = (value: unknown) => value === null || typeof value === "number";

const isStats = (value: unknown): value is EntryStats => {
    if (typeof value !== "object" || value === null) return false;
    const { bytes, count, oldestSecs } = value as Record<string, unknown>;
    return typeof bytes === "number" && nullableNumber(count) && nullableNumber(oldestSecs);
};

export async function storageEntryStats(id: EntryId) {
    const value = await command<unknown>("storage_entry_stats", { id });
    if (!isStats(value)) throw new Error("storage_entry_stats answered an unexpected shape");
    return value;
}

export function storageReveal(id: EntryId) {
    return command<void>("storage_reveal", { id });
}

export function storageClear(id: EntryId) {
    return command<ClearReport>("storage_clear", { id });
}
