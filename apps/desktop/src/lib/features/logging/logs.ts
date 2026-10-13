import type { LogEntry as GeneratedLogEntry } from "@deadlock-plus/ipc-types/LogEntry";

export type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE";

export type LogEntry = Omit<GeneratedLogEntry, "level"> & { level: LogLevel };

export type LogSink = Record<"error" | "warn" | "info" | "debug", (message: string) => unknown>;

type ConsoleLike = Pick<Console, "log" | "info" | "warn" | "error" | "debug">;

export const LEVELS: LogLevel[] = ["ERROR", "WARN", "INFO", "DEBUG"];

export { exportLogs, openLogDir, readLogs } from "./api";

export function filterEntries(entries: LogEntry[], minLevel: LogLevel, query: string): LogEntry[] {
    const cutoff = LEVELS_BY_SEVERITY.indexOf(minLevel);
    const needle = query.trim().toLowerCase();
    return entries.filter(
        (e) =>
            LEVELS_BY_SEVERITY.indexOf(e.level) <= cutoff &&
            (!needle || e.message.toLowerCase().includes(needle) || e.logger.toLowerCase().includes(needle)),
    );
}

const LEVELS_BY_SEVERITY: LogLevel[] = ["ERROR", "WARN", "INFO", "DEBUG", "TRACE"];

function formatArg(arg: unknown): string {
    if (typeof arg === "string") return arg;
    if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
    if (arg !== null && typeof arg === "object") {
        try {
            return JSON.stringify(arg);
        } catch {
            return String(arg);
        }
    }
    return String(arg);
}

export function formatArgs(args: unknown[]): string {
    return args.map(formatArg).join(" ");
}

/**
 * Sends everything printed to `target` on to `sink` as well. A sink that throws, rejects, or prints
 * to the console itself never feeds back into the log.
 */
export function forwardConsole(target: ConsoleLike, sink: LogSink): () => void {
    const originals = { ...target };
    const levels: Record<keyof ConsoleLike, keyof LogSink> = {
        log: "info",
        info: "info",
        warn: "warn",
        error: "error",
        debug: "debug",
    };
    let forwarding = false;

    for (const name of Object.keys(levels) as (keyof ConsoleLike)[]) {
        target[name] = (...args: unknown[]) => {
            originals[name].apply(target, args);
            if (forwarding) return;
            forwarding = true;
            try {
                Promise.resolve(sink[levels[name]](formatArgs(args))).catch(() => {});
            } catch {
                // The log bridge is unavailable; the console output above still happened.
            } finally {
                forwarding = false;
            }
        };
    }

    return () => Object.assign(target, originals);
}
