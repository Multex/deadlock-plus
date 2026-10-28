import { command, listen, type Unlisten } from "$lib/core/tauri";

import type { BuildBackup } from "@deadlock-plus/ipc-types/BuildBackup";
import type { BuildSection } from "@deadlock-plus/ipc-types/BuildSection";
import type { BuildVersionMeta } from "@deadlock-plus/ipc-types/BuildVersionMeta";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import type { FlushView } from "@deadlock-plus/ipc-types/FlushView";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import type { ResolveChoice } from "@deadlock-plus/ipc-types/ResolveChoice";
import type { SaveRequest } from "@deadlock-plus/ipc-types/SaveRequest";
import type { SaveResult } from "@deadlock-plus/ipc-types/SaveResult";

const FLUSHED_EVENT = "builds://flushed";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function isLocalBuilds(value: unknown): value is LocalBuilds {
    if (!isRecord(value)) return false;
    const { accountId, gameRunning, builds, lastUsed, queue } = value;
    return (
        typeof accountId === "number" &&
        typeof gameRunning === "boolean" &&
        Array.isArray(builds) &&
        builds.every((b) => isRecord(b) && typeof b.section === "string" && isRecord(b.build)) &&
        Array.isArray(lastUsed) &&
        Array.isArray(queue)
    );
}

export async function buildsLocal(): Promise<LocalBuilds> {
    const local = await command<LocalBuilds>("builds_local");
    if (!isLocalBuilds(local)) throw new Error("builds_local answered an unexpected shape");
    return local;
}

/** A written or queued save also drops the draft `draftId` and every draft of the saved build. */
export function buildsSave(request: SaveRequest, draftId?: string) {
    return command<SaveResult>("builds_save", draftId === undefined ? { request } : { request, draftId });
}

/** `base` is the build's `base` hex as `buildsLocal` listed it; a stale one comes back as a conflict. */
export function buildsDelete(section: BuildSection, id: number, base: string) {
    return command<SaveResult>("builds_delete", { section, id, base });
}

/** Favourites a build from its hex blob, a build already in the file by id, or a published build (id >= 1000) by its view. */
export function buildsFavourite(target: { base: string } | { id: number } | { view: BuildView }) {
    const base = "base" in target ? target.base : null;
    const id = "id" in target ? target.id : null;
    const view = "view" in target ? target.view : null;
    return command<SaveResult>("builds_favourite", { base, id, view });
}

export function buildsUnfavourite(id: number) {
    return command<SaveResult>("builds_unfavourite", { id });
}

/** Resolves to whether a queued save with that id was there to cancel. */
export function buildsQueueCancel(id: string) {
    return command<boolean>("builds_queue_cancel", { id });
}

export function buildsQueueResolve(id: string, choice: ResolveChoice) {
    return command<FlushView>("builds_queue_resolve", { id, choice });
}

export function buildsFlush() {
    return command<FlushView>("builds_flush");
}

/** Newest first. */
export function buildsHistory(buildId: number) {
    return command<BuildVersionMeta[]>("builds_history", { buildId });
}

export function buildsHistoryGet(buildId: number, versionId: string) {
    return command<BuildView>("builds_history_get", { buildId, versionId });
}

/** Newest first. */
export function buildsBackups() {
    return command<BuildBackup[]>("builds_backups");
}

/** Newest first. */
export function buildsDrafts() {
    return command<DraftView[]>("builds_drafts");
}

/** Stores the draft under its id, or under a new one when `id` is empty. */
export function buildsDraftSave(draft: DraftView) {
    return command<DraftView>("builds_draft_save", { draft });
}

/** Resolves to whether a draft with that id was there to remove. */
export function buildsDraftDelete(id: string) {
    return command<boolean>("builds_draft_delete", { id });
}

/** The code Deadlock's "Create New Build" accepts, for the build `request` would save. Writes nothing. */
export function buildCodeExport(request: SaveRequest) {
    return command<string>("build_code_export", { request });
}

/** A code from the game's "Copy build to clipboard", as a build to open; save it as a `copyView`. */
export function buildCodeImport(code: string) {
    return command<BuildView>("build_code_import", { code });
}

/** Fires when saves queued while the game ran were written, or could not be, after it closed. */
export const onFlushed = (handler: (view: FlushView) => void): Promise<Unlisten> =>
    listen<FlushView>(FLUSHED_EVENT, handler);
