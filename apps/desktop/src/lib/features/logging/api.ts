import { command } from "$lib/core/tauri";

import type { LogEntry } from "./logs";

const FIELDS = ["time", "thread", "level", "logger", "message"] as const;

const isEntry = (value: unknown): value is LogEntry =>
    typeof value === "object" &&
    value !== null &&
    FIELDS.every((field) => typeof (value as Record<string, unknown>)[field] === "string");

export async function readLogs() {
    const value = await command<unknown>("read_logs");
    if (!Array.isArray(value) || !value.every(isEntry)) throw new Error("read_logs answered an unexpected shape");
    return value;
}
export const exportLogs = () => command<string>("export_logs");
export const openLogDir = () => command<void>("open_log_dir");
