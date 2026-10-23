import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ConflictView } from "@deadlock-plus/ipc-types/ConflictView";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import type { FlushView } from "@deadlock-plus/ipc-types/FlushView";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import type { SaveRequest } from "@deadlock-plus/ipc-types/SaveRequest";
import type { SaveResult } from "@deadlock-plus/ipc-types/SaveResult";
import { t } from "$lib/core/i18n.svelte";
import type { Unlisten } from "$lib/core/tauri";
import { buildsDraftDelete, buildsDraftSave, buildsLocal, buildsQueueCancel, buildsSave, onFlushed } from "../api";
import { pickLocal } from "../build-detail.svelte";
import { updateBuild, type ItemRef } from "./document";
import { History } from "./history";
import {
    draftOf,
    flushOutcome,
    nextSelection,
    saveRequest,
    savedOrigin,
    selectionSurvives,
    type EditOrigin,
    type QueuedSave,
    type SelectMode,
} from "./session";
import { SUPPORT_HOST, hasFooter, readSupportPreference, withFooter } from "./support-footer";

export type { EditOrigin, SelectMode } from "./session";

export type SaveStatus = "saved" | "queued" | "draft" | "unsaved" | "saving" | "conflict";

export interface EditorApi {
    draftSave(draft: DraftView): Promise<DraftView>;
    save(request: SaveRequest, draftId?: string): Promise<SaveResult>;
    /** Reads the file after a written save, to edit that build on the next one. */
    local(): Promise<LocalBuilds>;
    /** Resolves to false when the queued save is gone: written, or dropped on a conflict. */
    cancel(id: string): Promise<boolean>;
    draftDelete(id: string): Promise<boolean>;
    onFlushed(handler: (view: FlushView) => void): Promise<Unlisten>;
}

export interface EditorOptions {
    build: BuildView;
    origin: EditOrigin;
    /** The stored draft the build was opened from. */
    draftId?: string;
    api?: EditorApi;
    /** The footer a new build starts with; `null` while the player has "Support Deadlock+" off. */
    supportFooter?: () => Promise<string | null>;
}

const AUTOSAVE_MS = 800;

const defaultApi: EditorApi = {
    draftSave: buildsDraftSave,
    save: buildsSave,
    local: buildsLocal,
    cancel: buildsQueueCancel,
    draftDelete: buildsDraftDelete,
    onFlushed,
};

/** The line "Support Deadlock+" adds under a build's description. */
export function supportFooterText(): string {
    return t("builds.editor.details.support_footer", { url: SUPPORT_HOST });
}

async function preferredFooter(): Promise<string | null> {
    return (await readSupportPreference()) ? supportFooterText() : null;
}

export class BuildEditor {
    build = $state.raw<BuildView>(null!);
    selection = $state.raw<ItemRef[]>([]);
    activeCategory = $state<number | null>(null);
    origin = $state.raw<EditOrigin>(null!);
    draftId = $state<string | undefined>();
    saving = $state(false);
    /** Why the last autosave failed; cleared by the next one that works. */
    draftError = $state<unknown>(null);
    /** What the game file holds instead, after a save made right away was refused; `keepMine` or `keepGame` settles it. */
    conflict = $state.raw<ConflictView | null>(null);
    history: History<BuildView>;

    /** The build as the game file holds it; `null` when that is unknown, as for a stored draft. */
    #clean = $state.raw<BuildView | null>(null);
    #revision = $state(0);
    #anchor: ItemRef | null = null;
    #timer: ReturnType<typeof setTimeout> | null = null;
    /** Changes since the last stored draft or save that still need a draft. */
    #pending = $state(false);
    #drafting: Promise<void> = Promise.resolve();
    /** The last save still waiting for Deadlock to close; the next save replaces it. */
    #queued = $state.raw<QueuedSave | null>(null);
    #conflict = $state(false);
    /** Reading back the build a flush wrote; a save has to plan against the origin it ends on. */
    #following: Promise<void> = Promise.resolve();
    #unlisten: Unlisten | null = null;
    #disposed = false;
    readonly #api: EditorApi;

    constructor(options: EditorOptions) {
        this.build = options.build;
        this.origin = options.origin;
        this.draftId = options.draftId;
        this.#clean = options.draftId === undefined ? options.build : null;
        this.history = new History(options.build);
        this.#api = options.api ?? defaultApi;
        void this.#api
            .onFlushed((view) => void this.#flushed(view))
            .then((stop) => {
                if (this.#disposed) stop();
                else this.#unlisten = stop;
            })
            .catch(() => {
                // Not running inside Tauri.
            });
        const footer = options.supportFooter ?? (options.api ? undefined : preferredFooter);
        if (footer && options.origin.kind !== "local" && options.draftId === undefined) {
            void footer().then(
                (text) => text !== null && this.#startWithFooter(options.build, text),
                () => {},
            );
        }
    }

    get status(): SaveStatus {
        if (this.saving) return "saving";
        if (this.#conflict) return "conflict";
        if (this.dirty) return this.draftId !== undefined && !this.#pending ? "draft" : "unsaved";
        if (this.#queued) return "queued";
        return this.origin.kind === "local" ? "saved" : "unsaved";
    }

    get dirty(): boolean {
        return this.build !== this.#clean;
    }

    get canUndo(): boolean {
        void this.#revision;
        return this.history.canUndo;
    }

    get canRedo(): boolean {
        void this.#revision;
        return this.history.canRedo;
    }

    /** Applies in a row with the same `mergeKey` are one undo step: one per drag or resize. */
    apply(next: BuildView, mergeKey?: string): void {
        if (next === this.build) return;
        this.history.push(next, mergeKey);
        this.#show(next);
        this.#schedule();
    }

    undo(): void {
        if (!this.history.canUndo) return;
        this.#show(this.history.undo());
        this.#schedule();
    }

    redo(): void {
        if (!this.history.canRedo) return;
        this.#show(this.history.redo());
        this.#schedule();
    }

    select(refs: readonly ItemRef[], mode: SelectMode): void {
        this.selection = nextSelection(this.build, this.selection, this.#anchor, refs, mode);
        const last = refs.at(-1);
        if (mode !== "range") this.#anchor = last ?? null;
        if (last) this.activeCategory = last.category;
    }

    /** Stores the draft now instead of after the debounce; nothing happens without unsaved changes. */
    flushDraft(): Promise<void> {
        this.#clearTimer();
        this.#drafting = this.#drafting.then(async () => {
            // A draft stored while saving would outlive the save, which drops the draft it was handed.
            if (!this.#pending || this.saving) return;
            this.#pending = false;
            try {
                const stored = await this.#api.draftSave(
                    draftOf(this.draftId, this.origin, this.build, Math.floor(Date.now() / 1000)),
                );
                this.draftId = stored.id;
                this.draftError = null;
            } catch (e) {
                this.#pending = true;
                this.draftError = e;
            }
        });
        return this.#drafting;
    }

    async saveToGame(): Promise<SaveResult> {
        this.#clearTimer();
        this.saving = true;
        // Taken before any await, so a flush event during the save leaves the origin to this save.
        const queued = this.#queued;
        this.#queued = null;
        // The save is handed the draft id, so a draft still being stored has to land first.
        await this.#drafting;
        await this.#following;
        const build = this.build;
        try {
            // Two queued saves of one build would both be written: a second new build, or an edit
            // whose base the first one already replaced.
            if (queued && !(await this.#cancel(queued))) await this.#followWritten(queued.buildId);
            const result = await this.#api.save(saveRequest(this.origin, build), this.draftId);
            this.#conflict = result.kind === "conflict";
            this.conflict = result.kind === "conflict" ? this.#conflictOf(result.conflicts) : null;
            if (result.kind === "conflict") return result;
            if (result.kind === "queued") this.#queued = { id: result.id, buildId: result.buildId };
            this.draftId = undefined;
            if (result.kind === "written") await this.#followWritten(result.buildId);
            this.#clean = build;
            // A change made while the save ran still needs its draft.
            this.#pending = this.build !== build;
            return result;
        } finally {
            this.saving = false;
            if (this.#pending) this.#schedule();
        }
    }

    /** Saves this build over the game's version; the backend backs up what it replaces. */
    keepMine(): Promise<SaveResult> {
        const conflict = this.conflict;
        if (conflict) {
            this.origin =
                conflict.gameBlob === null
                    ? { kind: "copyView" }
                    : { kind: "local", section: conflict.section, base: conflict.gameBlob, buildId: conflict.id };
        }
        return this.saveToGame();
    }

    /** Drops the draft and shows the build as the file holds it; false when the game deleted it. */
    async keepGame(): Promise<boolean> {
        const conflict = this.conflict;
        if (!conflict) return true;
        this.#clearTimer();
        await this.#drafting;
        this.#pending = false;
        if (this.draftId !== undefined) {
            await this.#api.draftDelete(this.draftId);
            this.draftId = undefined;
        }
        const builds = (await this.#api.local()).builds;
        const entry =
            builds.find((b) => b.section === conflict.section && b.build.heroBuildId === conflict.id) ??
            pickLocal(builds, conflict.id);
        this.#conflict = false;
        this.conflict = null;
        if (!entry) return false;
        this.origin = { kind: "local", section: entry.section, base: entry.base, buildId: entry.build.heroBuildId };
        this.history = new History(entry.build);
        this.#clean = entry.build;
        this.#show(entry.build);
        return true;
    }

    dispose(): void {
        this.#clearTimer();
        this.#disposed = true;
        this.#unlisten?.();
        this.#unlisten = null;
    }

    async #cancel(queued: QueuedSave): Promise<boolean> {
        try {
            return await this.#api.cancel(queued.id);
        } catch (e) {
            this.#queued = queued;
            throw e;
        }
    }

    #conflictOf(conflicts: readonly ConflictView[]): ConflictView | null {
        const id = this.origin.kind === "local" ? this.origin.buildId : this.build.heroBuildId;
        return conflicts.find((c) => c.id === id) ?? conflicts[0] ?? null;
    }

    async #flushed(view: FlushView): Promise<void> {
        const queued = this.#queued;
        if (!queued) return;
        const outcome = flushOutcome(view, queued);
        if (outcome === "conflict") this.#conflict = true;
        if (outcome !== "saved") return;
        this.#queued = null;
        this.#conflict = false;
        this.#following = this.#followWritten(queued.buildId);
        await this.#following;
    }

    async #followWritten(buildId: number): Promise<void> {
        try {
            this.origin = savedOrigin(this.origin, buildId, (await this.#api.local()).builds);
        } catch {
            // The file could not be read back: the origin stays, so the next save repeats this one's kind.
        }
    }

    /** A saved or drafted build keeps the description it has; only an untouched new one takes the preference. */
    #startWithFooter(initial: BuildView, footer: string): void {
        if (this.#disposed || this.build !== initial || hasFooter(initial.description)) return;
        const next = updateBuild(initial, { description: withFooter(initial.description, true, footer) });
        this.history = new History(next);
        this.#clean = next;
        this.build = next;
        this.#revision++;
    }

    #show(next: BuildView): void {
        if (!selectionSurvives(this.build, next, this.selection)) {
            this.selection = [];
            this.#anchor = null;
        }
        const count = next.modCategories.length;
        if (this.activeCategory !== null && this.activeCategory >= count) {
            this.activeCategory = count > 0 ? count - 1 : null;
        }
        this.build = next;
        this.#revision++;
    }

    #schedule(): void {
        this.#pending = true;
        this.#clearTimer();
        this.#timer = setTimeout(() => {
            this.#timer = null;
            void this.flushDraft();
        }, AUTOSAVE_MS);
    }

    #clearTimer(): void {
        if (this.#timer !== null) clearTimeout(this.#timer);
        this.#timer = null;
    }
}
