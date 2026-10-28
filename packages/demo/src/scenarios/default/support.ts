import type { LogEntry } from "@deadlock-plus/ipc-types/LogEntry";

import type { Handlers } from "../../backend";
import type { Module } from "../../scenario";
import { ARCH, GAME_CLIENT_VERSION, GAME_DIR, OS, WEBVIEW } from "./shell";

export interface SupportOptions {
    /** Version the app reports as its own. */
    appVersion: string;
}

type LogSeed = [secondsAgo: number, thread: string, level: string, logger: string, message: string];

const LOG_SEEDS: LogSeed[] = [
    [1126, "main", "INFO", "app", "Deadlock+ started"],
    [1126, "main", "INFO", "steam", "Steam install found, 1 account"],
    [1125, "main", "DEBUG", "kv", "opened 9 stores"],
    [1125, "jobs", "INFO", "jobs", "3 jobs registered, pause in game on"],
    [1124, "tokio-runtime-worker", "INFO", "gamedata", "game build 6712, map table up to date"],
    [1124, "tokio-runtime-worker", "INFO", "presence", "connected to Discord (stable, pipe 0)"],
    [1122, "tokio-runtime-worker", "INFO", "server_picker", "30 relay regions loaded, 9 blocked"],
    [1121, "tokio-runtime-worker", "DEBUG", "alerts", "5 alerts cached, 0 unread"],
    [1098, "jobs", "INFO", "addon_scan", "scanned 8 addons, 3 findings"],
    [912, "tokio-runtime-worker", "WARN", "ingest", "match history request timed out, retrying in 30 s"],
    [881, "tokio-runtime-worker", "INFO", "ingest", "match history up to date"],
    [640, "connection", "DEBUG", "connection", "relay fra, 24 ms"],
    [318, "tokio-runtime-worker", "INFO", "gc", "1 match salt delivered"],
    [42, "main", "DEBUG", "window", "window shown"],
];

const pad = (value: number) => String(value).padStart(2, "0");

function logEntries(now: number): LogEntry[] {
    return LOG_SEEDS.map(([secondsAgo, thread, level, logger, message]) => {
        const at = new Date(now - secondsAgo * 1000);
        const time = `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`;
        return { time, thread, level, logger, message };
    });
}

const logText = (entries: readonly LogEntry[]) =>
    entries.map((e) => `[${e.time}] [${e.thread} | ${e.level}] [${e.logger}]: ${e.message}\n`).join("");

function supportReport(appVersion: string, log: string): string {
    return [
        "Deadlock+ support report",
        "",
        "== App ==",
        `version: ${appVersion}`,
        "build: release",
        `target: ${ARCH}-windows`,
        `os: ${OS}`,
        `webview: ${WEBVIEW}`,
        "elevated: no",
        "",
        "== Game ==",
        "installed: found",
        `install path: ${GAME_DIR}`,
        `client version: ${GAME_CLIENT_VERSION}`,
        "running: no",
        "",
        "== Jobs ==",
        "game running: no",
        "all jobs enabled: yes",
        "pause in game: yes",
        "running: 0 of 0 listed",
        "",
        "== Crash ==",
        "none",
        "",
        "== Log ==",
        log,
    ].join("\n");
}

export function supportModule({ appVersion }: SupportOptions): Module {
    return {
        name: "support",
        create({ identity, now }) {
            const entries = logEntries(now);
            const crashDir = `C:\\Users\\${identity.persona}\\AppData\\Local\\app.deadlockplus\\crashes`;
            const crashReport = ({ id }: Record<string, unknown>) =>
                `${crashDir}\\deadlock-plus-crash-${String(id)}.txt`;

            const handlers: Handlers = {
                read_logs: () => entries,
                export_logs: () => `Deadlock+ ${appVersion} on ${OS} ${ARCH}\n\n${logText(entries)}`,
                open_log_dir: () => null,
                build_support_report: () => supportReport(appVersion, logText(entries)),

                write_crash_bundle: crashReport,
                reveal_crash_bundle: crashReport,
                open_crash_issue: crashReport,

                // True means the file was written; false is the user closing the save dialog.
                save_text_file: () => true,
                save_binary_file: () => true,
                dispatch_music_track: () => new ArrayBuffer(0),
                dispatch_sfx: () => new ArrayBuffer(0),
            };
            return { handlers };
        },
    };
}
