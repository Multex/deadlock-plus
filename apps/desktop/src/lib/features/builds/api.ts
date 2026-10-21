import { command, listen, type Unlisten } from "$lib/core/tauri";

import type { BuildBackup } from "@deadlock-plus/ipc-types/BuildBackup";
import type { BuildSection } from "@deadlock-plus/ipc-types/BuildSection";
import type { BuildVersionMeta } from "@deadlock-plus/ipc-types/BuildVersionMeta";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { FlushView } from "@deadlock-plus/ipc-types/FlushView";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import type { ResolveChoice } from "@deadlock-plus/ipc-types/ResolveChoice";
import type { SaveRequest } from "@deadlock-plus/ipc-types/SaveRequest";
import type { SaveResult } from "@deadlock-plus/ipc-types/SaveResult";

const FLUSHED_EVENT = "builds://flushed";

export function buildsLocal() {
    return command<LocalBuilds>("builds_local");
}

export function buildsSave(request: SaveRequest) {
    return command<SaveResult>("builds_save", { request });
}

/** `base` is the build's `base` hex as `buildsLocal` listed it; a stale one comes back as a conflict. */
export function buildsDelete(section: BuildSection, id: number, base: string) {
    return command<SaveResult>("builds_delete", { section, id, base });
}

/** Favourites a build from its hex blob, or a build already in the file by id. */
export function buildsFavourite(target: { base: string } | { id: number }) {
    const base = "base" in target ? target.base : null;
    const id = "id" in target ? target.id : null;
    return command<SaveResult>("builds_favourite", { base, id });
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

/** Fires when saves queued while the game ran were written, or could not be, after it closed. */
export const onFlushed = (handler: (view: FlushView) => void): Promise<Unlisten> =>
    listen<FlushView>(FLUSHED_EVENT, handler);
