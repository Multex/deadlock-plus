import { command } from "$lib/core/tauri";

import type { DetailCoverage } from "@deadlock-plus/ipc-types/DetailCoverage";
import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";

export const gcStatus = () => command<GcStatus>("gc_status");
export const matchDetailCoverage = (matchIds: number[]) =>
    command<DetailCoverage>("match_detail_coverage", { matchIds });
export const recoverMatches = (matchIds: number[], withHistory: boolean) =>
    command("recover_matches", { matchIds, withHistory });
export const pauseMatchRecovery = () => command("pause_match_recovery");
export const resumeMatchRecovery = () => command("resume_match_recovery");
export const cancelMatchRecovery = () => command("cancel_match_recovery");
