import { command } from "$lib/core/tauri";

import type { DetailCoverage } from "@deadlock-plus/ipc-types/DetailCoverage";
import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";

export const gcStatus = () => command<GcStatus>("gc_status");
const isIdList = (value: unknown): value is number[] =>
    Array.isArray(value) && value.every((id) => typeof id === "number");

const isCoverage = (value: unknown): value is DetailCoverage => {
    if (typeof value !== "object" || value === null) return false;
    const { withDetails, withReplay } = value as Record<string, unknown>;
    return isIdList(withDetails) && isIdList(withReplay);
};

export async function matchDetailCoverage(matchIds: number[]): Promise<DetailCoverage> {
    const value = await command<unknown>("match_detail_coverage", { matchIds });
    if (!isCoverage(value)) throw new Error("match_detail_coverage answered an unexpected shape");
    return value;
}
export const recoverMatches = (matchIds: number[], replayIds: number[], withHistory: boolean) =>
    command("recover_matches", { matchIds, replayIds, withHistory });
export const pauseMatchRecovery = () => command("pause_match_recovery");
export const resumeMatchRecovery = () => command("resume_match_recovery");
export const cancelMatchRecovery = () => command("cancel_match_recovery");
