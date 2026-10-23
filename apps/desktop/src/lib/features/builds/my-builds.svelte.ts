import { deadlockApi } from "$lib/core/deadlock-api";
import { playerNames } from "$lib/features/match-history/names";
import type { Build } from "@deadlock-plus/deadlock-api";
import type { ConflictView } from "@deadlock-plus/ipc-types/ConflictView";
import type { FlushView } from "@deadlock-plus/ipc-types/FlushView";
import type { QueuedSaveView } from "@deadlock-plus/ipc-types/QueuedSaveView";
import type { ResolveChoice } from "@deadlock-plus/ipc-types/ResolveChoice";
import type { SaveResult } from "@deadlock-plus/ipc-types/SaveResult";

import {
    buildsDelete,
    buildsDraftDelete,
    buildsDrafts,
    buildsFavourite,
    buildsFlush,
    buildsLocal,
    buildsQueueCancel,
    buildsQueueResolve,
    buildsSave,
    buildsUnfavourite,
    onFlushed,
} from "./api";
import {
    conflictsOf,
    copyRequest,
    deleteTargets,
    favouriteAction,
    flushFailure,
    foreignFavourites,
    mergeMine,
    statsHeroes,
    toDraft,
    type DraftSource,
    type FavouriteRow,
    type MineGroup,
    type MineRow,
} from "./my-builds";
import { buildWinRates, type WinRate } from "./public-builds";

export const storedDrafts: DraftSource = {
    list: async () => (await buildsDrafts()).map(toDraft),
    remove: async (id) => {
        await buildsDraftDelete(id);
    },
};

/** What an action ended in, for the page to tell the player. */
export type ActionOutcome = "done" | "queued" | "conflict";

export class MyBuildsStore {
    groups = $state<MineGroup[]>([]);
    /** Other players' builds the player favourited. */
    favourites = $state<FavouriteRow[]>([]);
    authors = $state.raw<ReadonlyMap<number, string>>(new Map());
    /** By build id; a build the API has too few matches for is missing. */
    winRates = $state.raw<ReadonlyMap<number, WinRate>>(new Map());
    queue = $state<QueuedSaveView[]>([]);
    gameRunning = $state(false);
    loading = $state(true);
    error = $state<unknown>(null);
    /** The Deadlock API did not answer, so published builds the file does not hold are missing. */
    publishedFailed = $state(false);
    conflicts = $state<ConflictView[]>([]);
    /** Why queued saves could not be written, as an app error; `null` when they could. */
    flushFailed = $state<unknown>(null);
    busy = $state(false);

    #generation = 0;
    #checkedLeftovers = false;
    readonly #drafts: DraftSource;

    constructor(drafts: DraftSource = storedDrafts) {
        this.#drafts = drafts;
    }

    async refresh() {
        const mine = ++this.#generation;
        try {
            const [local, drafts] = await Promise.all([buildsLocal(), this.#drafts.list()]);
            let published: Build[] = [];
            let publishedFailed = false;
            try {
                published = await deadlockApi.builds({ authorId: local.accountId, onlyLatest: true });
            } catch {
                publishedFailed = true;
            }
            if (mine !== this.#generation) return;
            this.groups = mergeMine({
                accountId: local.accountId,
                local: local.builds,
                queue: local.queue,
                published,
                drafts,
            });
            this.favourites = foreignFavourites(local.accountId, local.builds);
            void this.#loadAuthors(this.favourites);
            void this.#loadWinRates(statsHeroes(this.groups), mine);
            this.queue = local.queue;
            this.gameRunning = local.gameRunning;
            this.publishedFailed = publishedFailed;
            this.error = null;
            // Saves still queued with the game closed hit a conflict or failed before this page listened; one flush
            // brings that answer back. Only once, so a conflict that stays does not flush on every refresh.
            if (!this.#checkedLeftovers && !local.gameRunning && local.queue.length > 0) void this.flush();
            this.#checkedLeftovers = true;
        } catch (e) {
            if (mine === this.#generation) this.error = e;
        } finally {
            if (mine === this.#generation) this.loading = false;
        }
    }

    async #loadAuthors(rows: readonly FavouriteRow[]) {
        const ids = [...new Set(rows.map((r) => r.authorAccountId))].filter((id) => !this.authors.has(id));
        if (ids.length === 0) return;
        try {
            const names = await playerNames.resolve(ids);
            this.authors = new Map([...this.authors, ...names]);
        } catch {
            // Rows show no author until a later refresh resolves the names.
        }
    }

    async #loadWinRates(heroes: readonly number[], generation: number) {
        const maps = await Promise.all(heroes.map((id) => buildWinRates.load(id)));
        if (generation !== this.#generation) return;
        this.winRates = new Map(maps.flatMap((m) => [...m]));
    }

    start(): () => void {
        void this.refresh();
        let stopped = false;
        let unlisten: (() => void) | null = null;
        void onFlushed((view) => this.#flushed(view))
            .then((stop) => {
                if (stopped) stop();
                else unlisten = stop;
            })
            .catch(() => {
                // Not running inside Tauri.
            });
        return () => {
            stopped = true;
            unlisten?.();
        };
    }

    async flush() {
        try {
            this.#flushed(await buildsFlush());
        } catch (e) {
            this.flushFailed = e;
        }
    }

    #flushed(view: FlushView) {
        this.conflicts = conflictsOf(view);
        this.flushFailed = flushFailure(view);
        void this.refresh();
    }

    async #act(run: () => Promise<SaveResult | SaveResult[]>): Promise<ActionOutcome> {
        this.busy = true;
        try {
            const results = [await run()].flat();
            if (results.some((r) => r.kind === "conflict")) return "conflict";
            return results.some((r) => r.kind === "queued") ? "queued" : "done";
        } finally {
            this.busy = false;
            await this.refresh();
        }
    }

    delete(row: MineRow): Promise<ActionOutcome> {
        return this.#act(async () => {
            const results: SaveResult[] = [];
            for (const entry of deleteTargets(row)) {
                const result = await buildsDelete(entry.section, entry.build.heroBuildId, entry.base);
                results.push(result);
                if (result.kind === "conflict") break;
            }
            return results;
        });
    }

    copy(row: MineRow, name: string): Promise<ActionOutcome> {
        const request = copyRequest(row, name);
        if (!request) return Promise.resolve("done");
        return this.#act(() => buildsSave(request));
    }

    toggleFavourite(row: MineRow): Promise<ActionOutcome> {
        const action = favouriteAction(row);
        if (!action) return Promise.resolve("done");
        return this.#act(() => {
            if (action.kind === "unfavourite") return buildsUnfavourite(action.id);
            return buildsFavourite("view" in action ? { view: action.view } : { id: action.id });
        });
    }

    unfavourite(row: FavouriteRow): Promise<ActionOutcome> {
        return this.#act(() => buildsUnfavourite(row.buildId));
    }

    async discard(row: MineRow) {
        if (!row.draft) return;
        this.busy = true;
        try {
            await this.#drafts.remove(row.draft.id);
        } finally {
            this.busy = false;
            await this.refresh();
        }
    }

    async cancelQueued(row: MineRow) {
        this.busy = true;
        try {
            for (const save of row.queue) await buildsQueueCancel(save.id);
        } finally {
            this.busy = false;
            await this.refresh();
        }
    }

    async resolve(conflict: ConflictView, choice: ResolveChoice) {
        if (conflict.saveId === null) return;
        this.busy = true;
        try {
            this.#flushed(await buildsQueueResolve(conflict.saveId, choice));
        } catch (e) {
            this.flushFailed = e;
        } finally {
            this.busy = false;
        }
    }
}
