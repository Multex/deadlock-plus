import { command } from "$lib/core/tauri";
import type { CrashReport } from "@deadlock-plus/ipc-types/CrashReport";

/** The newest unhandled crash from the last run, or null. Call once at launch. */
export const pendingCrash = () => command<CrashReport | null>("pending_crash");
/** Writes the plain-text report for a crash id and returns its path. */
export const writeCrashBundle = (id: string) => command<string>("write_crash_bundle", { id });
/** Writes the report, shows it in the file manager and returns its path. */
export const revealCrashBundle = (id: string) => command<string>("reveal_crash_bundle", { id });
/** Writes the report, opens the pre-filled GitHub issue in the browser and returns the report's path. */
export const openCrashIssue = (id: string) => command<string>("open_crash_issue", { id });
/** Deletes every crash marker and report file, so the dialog does not return for them. */
export const dismissCrash = () => command("dismiss_crash");
/** Records a fatal web view error for the next launch. The backend keeps at most a few per run. */
export const reportWebviewCrash = (message: string) => command("report_webview_crash", { message });
