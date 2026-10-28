import { command } from "$lib/core/tauri";

import type { CleanupMatch } from "@deadlock-plus/ipc-types/CleanupMatch";
import type { CleanupRule } from "@deadlock-plus/ipc-types/CleanupRule";
import type { DeleteMode } from "@deadlock-plus/ipc-types/DeleteMode";
import type { DeletePreview } from "@deadlock-plus/ipc-types/DeletePreview";
import type { DeleteReport } from "@deadlock-plus/ipc-types/DeleteReport";
import type { Demo } from "@deadlock-plus/ipc-types/Demo";
import type { DemoListing } from "@deadlock-plus/ipc-types/DemoListing";
import type { MetaResult } from "@deadlock-plus/ipc-types/MetaResult";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isMetaResult = (value: unknown): value is MetaResult => {
    if (!isRecord(value)) return false;
    if (value.state === "missing") return true;
    if (value.state === "error") return typeof value.message === "string";
    return value.state === "ok" && isRecord(value.summary) && Array.isArray(value.summary.players);
};

export async function fetchDemoMetadata(matchId: number) {
    const value = await command<unknown>("demo_metadata", { matchId });
    if (!isMetaResult(value)) throw new Error("demo_metadata answered an unexpected shape");
    return value;
}

export async function localAccountIds() {
    const value = await command<unknown>("local_steam_account_ids");
    if (!Array.isArray(value) || !value.every((id) => typeof id === "number"))
        throw new Error("local_steam_account_ids answered an unexpected shape");
    return value as number[];
}

const isListing = (value: unknown): value is DemoListing => {
    if (typeof value !== "object" || value === null) return false;
    const { dir, demos } = value as Record<string, unknown>;
    return (dir === null || typeof dir === "string") && Array.isArray(demos);
};

export async function listDemos() {
    const value = await command<unknown>("list_demos");
    if (!isListing(value)) throw new Error("list_demos answered an unexpected shape");
    return value;
}

export function openReplaysDir() {
    return command<void>("open_replays_dir");
}

export function revealDemo(demo: Demo) {
    return command<void>("reveal_demo", { matchId: String(demo.matchId), partial: demo.status === "partial" });
}

export function previewDelete(fileNames: string[]) {
    return command<DeletePreview>("delete_preview", { fileNames });
}

export function deleteDemos(fileNames: string[], mode: DeleteMode) {
    return command<DeleteReport>("delete_demos", { fileNames, mode });
}

export function listPinned() {
    return command<number[]>("list_pinned");
}

export function setPinned(matchId: number, pinned: boolean) {
    return command<number[]>("set_pinned", { matchId, pinned });
}

export function listCleanupRules() {
    return command<CleanupRule[]>("list_cleanup_rules");
}

export function saveCleanupRules(rules: CleanupRule[]) {
    return command<void>("save_cleanup_rules", { rules });
}

export function cleanupMatches() {
    return command<CleanupMatch[]>("cleanup_matches");
}
