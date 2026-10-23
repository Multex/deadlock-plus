import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import type { FlushView } from "@deadlock-plus/ipc-types/FlushView";
import type { LocalBuilds } from "@deadlock-plus/ipc-types/LocalBuilds";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import type { SaveRequest } from "@deadlock-plus/ipc-types/SaveRequest";
import type { SaveResult } from "@deadlock-plus/ipc-types/SaveResult";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), listen: vi.fn(), fileSrc: (p: string) => p }));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("$lib/core/i18n.svelte", () => ({ i18n: { locale: "en" }, t: (key: string) => key }));
vi.mock("$lib/core/errors", () => ({ failureText: (_e: unknown, fallback: string) => fallback }));
vi.mock("$lib/features/gamedata/gamedata", () => ({ loadAbilityArt: vi.fn(), loadItemArt: vi.fn() }));
vi.mock("$lib/features/heroes/heroes", () => ({ loadHeroes: vi.fn() }));
vi.mock("$lib/features/match-history/names", () => ({ playerNames: { resolve: vi.fn() } }));

import { addItems, moveCategory, removeCategory, removeItems, updateItem } from "./document";
import { BuildEditor, type EditorApi } from "./editor.svelte";

function cat(ids: number[]): ModCategoryView {
    return {
        mods: ids.map((abilityId) => ({
            abilityId,
            annotation: null,
            requiredFlexSlots: null,
            sellPriority: null,
            imbueTargetAbilityId: null,
        })),
        name: "",
        description: "",
        width: 340,
        height: 162.75,
        optional: false,
    };
}

function build(categories: ModCategoryView[] = [cat([1, 2]), cat([3])]): BuildView {
    return {
        heroBuildId: 0,
        heroId: 7,
        authorAccountId: 1,
        lastUpdatedTimestamp: null,
        name: "B",
        description: "",
        language: 0,
        version: 1,
        originBuildId: null,
        modCategories: categories,
        abilityOrder: [],
        tags: [],
        developmentBuild: false,
        publishTimestamp: null,
        favorited: false,
    };
}

function localBuilds(builds: LocalBuilds["builds"]): LocalBuilds {
    return { accountId: 1, exists: true, gameRunning: false, builds, lastUsed: [], queue: [], nextLocalId: null };
}

function fakeApi(result: SaveResult = { kind: "written", buildId: 9, backup: null }) {
    let next = 0;
    const draftSave = vi.fn(async (draft: DraftView) => ({ ...draft, id: draft.id || `d${++next}` }));
    const save = vi.fn(async (_request: SaveRequest, _draftId?: string) => result);
    const local = vi.fn(async () =>
        localBuilds([{ section: "Unpublished", build: { ...build(), heroBuildId: 9 }, base: "b9", warnings: [] }]),
    );
    const cancel = vi.fn(async (_id: string) => true);
    const draftDelete = vi.fn(async (_id: string) => true);
    const unlisten = vi.fn();
    let flushed: ((view: FlushView) => void) | undefined;
    const onFlushed = vi.fn(async (handler: (view: FlushView) => void) => {
        flushed = handler;
        return unlisten;
    });
    const flush = (view: FlushView) => flushed!(view);
    return { ...({ draftSave, save, local, cancel, draftDelete, onFlushed } satisfies EditorApi), unlisten, flush };
}

let editors: BuildEditor[] = [];
function editor(api: EditorApi, fields: Partial<ConstructorParameters<typeof BuildEditor>[0]> = {}) {
    const e = new BuildEditor({ build: build(), origin: { kind: "new" }, api, ...fields });
    editors.push(e);
    return e;
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    editors.forEach((e) => e.dispose());
    editors = [];
    vi.useRealTimers();
});

describe("BuildEditor history", () => {
    it("applies, undoes and redoes", () => {
        const e = editor(fakeApi());
        const start = e.build;
        expect(e.dirty).toBe(false);
        e.apply(addItems(e.build, 0, 0, [8]));
        expect(e.build.modCategories[0]!.mods.map((m) => m.abilityId)).toEqual([8, 1, 2]);
        expect(e.dirty).toBe(true);
        expect(e.canUndo).toBe(true);
        e.undo();
        expect(e.build).toBe(start);
        expect(e.canRedo).toBe(true);
        e.redo();
        expect(e.build.modCategories[0]!.mods).toHaveLength(3);
    });

    it("folds a gesture's applies into one step", () => {
        const e = editor(fakeApi());
        const start = e.build;
        e.apply(updateItem(e.build, { category: 0, index: 0 }, { annotation: "a" }), "note");
        e.apply(updateItem(e.build, { category: 0, index: 0 }, { annotation: "ab" }), "note");
        e.undo();
        expect(e.build).toBe(start);
    });

    it("counts a build opened from a draft as unsaved", () => {
        expect(editor(fakeApi(), { draftId: "d0" }).dirty).toBe(true);
    });
});

describe("BuildEditor autosave", () => {
    it("stores one draft 800 ms after the last change and keeps its id", async () => {
        const api = fakeApi();
        const e = editor(api);
        e.apply(addItems(e.build, 0, 0, [8]));
        await vi.advanceTimersByTimeAsync(500);
        e.apply(addItems(e.build, 0, 0, [9]));
        await vi.advanceTimersByTimeAsync(799);
        expect(api.draftSave).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(api.draftSave).toHaveBeenCalledTimes(1);
        const draft = api.draftSave.mock.calls[0]![0];
        expect(draft).toMatchObject({ id: "", heroId: 7, source: { kind: "new" } });
        expect(draft.build).toBe(e.build);
        expect(e.draftId).toBe("d1");

        e.undo();
        await vi.advanceTimersByTimeAsync(800);
        expect(api.draftSave).toHaveBeenCalledTimes(2);
        expect(api.draftSave.mock.calls[1]![0].id).toBe("d1");
    });

    it("stores under the draft it was opened from", async () => {
        const api = fakeApi();
        const e = editor(api, { draftId: "d0" });
        e.apply(addItems(e.build, 0, 0, [8]));
        await vi.advanceTimersByTimeAsync(800);
        expect(api.draftSave.mock.calls[0]![0].id).toBe("d0");
    });

    it("stops on dispose", async () => {
        const api = fakeApi();
        const e = editor(api);
        e.apply(addItems(e.build, 0, 0, [8]));
        e.dispose();
        await vi.advanceTimersByTimeAsync(2000);
        expect(api.draftSave).not.toHaveBeenCalled();
    });
});

describe("BuildEditor saveToGame", () => {
    it("saves a new build with its draft and does not autosave after", async () => {
        const api = fakeApi();
        const e = editor(api);
        e.apply(addItems(e.build, 0, 0, [8]));
        await vi.advanceTimersByTimeAsync(800);
        e.apply(addItems(e.build, 0, 0, [9]));
        const result = await e.saveToGame();
        expect(result).toEqual({ kind: "written", buildId: 9, backup: null });
        expect(api.save).toHaveBeenCalledWith({ kind: "new", build: e.build }, "d1");
        expect(e.dirty).toBe(false);
        expect(e.saving).toBe(false);
        await vi.advanceTimersByTimeAsync(5000);
        expect(api.draftSave).toHaveBeenCalledTimes(1);

        e.apply(addItems(e.build, 0, 0, [10]));
        await vi.advanceTimersByTimeAsync(800);
        expect(api.draftSave).toHaveBeenCalledTimes(2);
        expect(api.draftSave.mock.calls[1]![0].id).toBe("");
    });

    it("edits the written build on the next save", async () => {
        const api = fakeApi();
        const e = editor(api);
        await e.saveToGame();
        expect(e.origin).toEqual({ kind: "local", section: "Unpublished", base: "b9", buildId: 9 });
        await e.saveToGame();
        expect(api.save.mock.calls[1]![0]).toMatchObject({ kind: "edit", section: "Unpublished", base: "b9" });
    });

    it("waits for a draft being stored, so the save drops it", async () => {
        const api = fakeApi();
        let release!: () => void;
        api.draftSave.mockImplementationOnce(
            (draft) => new Promise((resolve) => (release = () => resolve({ ...draft, id: "slow" }))),
        );
        const e = editor(api);
        e.apply(addItems(e.build, 0, 0, [8]));
        await vi.advanceTimersByTimeAsync(800);
        const saving = e.saveToGame();
        await vi.advanceTimersByTimeAsync(0);
        expect(api.save).not.toHaveBeenCalled();
        release();
        await saving;
        expect(api.save.mock.calls[0]![1]).toBe("slow");
    });

    it("sends an edit for a local build and a copyView for a public one", async () => {
        const api = fakeApi({ kind: "queued", id: "q", buildId: 5 });
        await editor(api, { origin: { kind: "local", section: "SavedLastUsed", base: "ab", buildId: 5 } }).saveToGame();
        await editor(api, { origin: { kind: "copyView" } }).saveToGame();
        expect(api.save.mock.calls[0]![0]).toMatchObject({ kind: "edit", section: "SavedLastUsed", base: "ab" });
        expect(api.save.mock.calls[1]![0]).toMatchObject({ kind: "copyView" });
        expect(api.local).not.toHaveBeenCalled();
    });

    it("stops a pending autosave on a queued save", async () => {
        const api = fakeApi({ kind: "queued", id: "q", buildId: 5 });
        const e = editor(api, { draftId: "d0" });
        e.apply(addItems(e.build, 0, 0, [8]));
        await e.saveToGame();
        await vi.advanceTimersByTimeAsync(5000);
        expect(api.draftSave).not.toHaveBeenCalled();
        expect(api.save.mock.calls[0]![1]).toBe("d0");
    });

    it("stays unsaved on a conflict", async () => {
        const api = fakeApi({ kind: "conflict", conflicts: [] });
        const e = editor(api, { origin: { kind: "local", section: "Unpublished", base: "ab", buildId: 5 } });
        e.apply(addItems(e.build, 0, 0, [8]));
        expect((await e.saveToGame()).kind).toBe("conflict");
        expect(e.dirty).toBe(true);
        expect(e.origin).toEqual({ kind: "local", section: "Unpublished", base: "ab", buildId: 5 });
    });

    it("drops the draft id on an unchanged save, since the backend deletes that draft too", async () => {
        const api = fakeApi({ kind: "unchanged", buildId: 5 });
        const e = editor(api, {
            origin: { kind: "local", section: "Unpublished", base: "ab", buildId: 5 },
            draftId: "d0",
        });
        await e.saveToGame();
        expect(e.draftId).toBeUndefined();
    });
});

describe("BuildEditor save conflicts", () => {
    const STALE = { kind: "local", section: "Unpublished", base: "stale", buildId: 5 } as const;
    const conflictOn = (gameBlob: string | null): SaveResult => ({
        kind: "conflict",
        conflicts: [{ saveId: null, id: 5, section: "Unpublished", ours: null, game: null, base: null, gameBlob }],
    });
    const written: SaveResult = { kind: "written", buildId: 5, backup: "bk" };
    const gameBuild = { ...build([cat([42])]), heroBuildId: 5, name: "Game" };

    function conflicted(gameBlob: string | null) {
        const api = fakeApi();
        api.save.mockResolvedValueOnce(conflictOn(gameBlob)).mockResolvedValueOnce(written);
        api.local.mockResolvedValue(
            localBuilds([{ section: "Unpublished", build: gameBuild, base: "now", warnings: [] }]),
        );
        const e = editor(api, { origin: STALE, draftId: "d0" });
        return { api, e };
    }

    it("holds the conflict a save right away raised", async () => {
        const { e } = conflicted("now");
        await e.saveToGame();
        expect(e.status).toBe("conflict");
        expect(e.conflict).toMatchObject({ id: 5, gameBlob: "now" });
    });

    it("keeps mine by saving again on top of what the file holds now", async () => {
        const { api, e } = conflicted("now");
        await e.saveToGame();
        const result = await e.keepMine();
        expect(result).toEqual(written);
        expect(api.save.mock.calls[1]![0]).toMatchObject({ kind: "edit", section: "Unpublished", base: "now" });
        expect(api.save.mock.calls[1]![1]).toBe("d0");
        expect(e.conflict).toBeNull();
        expect(e.status).toBe("saved");
    });

    it("keeps mine as a new build when the game deleted it", async () => {
        const { api, e } = conflicted(null);
        await e.saveToGame();
        await e.keepMine();
        expect(api.save.mock.calls[1]![0]).toMatchObject({ kind: "copyView" });
        expect(e.status).not.toBe("conflict");
    });

    it("keeps the game's by dropping the draft and showing the build from the file", async () => {
        const { api, e } = conflicted("now");
        await e.saveToGame();
        expect(await e.keepGame()).toBe(true);
        expect(api.draftDelete).toHaveBeenCalledWith("d0");
        expect(e.draftId).toBeUndefined();
        expect(e.build).toBe(gameBuild);
        expect(e.origin).toEqual({ kind: "local", section: "Unpublished", base: "now", buildId: 5 });
        expect(e.conflict).toBeNull();
        expect(e.dirty).toBe(false);
        expect(e.canUndo).toBe(false);
        expect(e.status).toBe("saved");
        await vi.advanceTimersByTimeAsync(5000);
        expect(api.draftSave).not.toHaveBeenCalled();
    });

    it("keeps the game's deletion by reporting the build is gone", async () => {
        const { api, e } = conflicted(null);
        api.local.mockResolvedValue(localBuilds([]));
        await e.saveToGame();
        expect(await e.keepGame()).toBe(false);
        expect(api.draftDelete).toHaveBeenCalledWith("d0");
        expect(e.status).not.toBe("conflict");
    });
});

describe("BuildEditor queued saves", () => {
    const queued = (id: string, buildId = 9): SaveResult => ({ kind: "queued", id, buildId });
    const LOCAL = { kind: "local", section: "SavedLastUsed", base: "ab", buildId: 5 } as const;

    it("cancels the queued new build before queueing its replacement", async () => {
        const api = fakeApi();
        api.save.mockResolvedValueOnce(queued("q1")).mockResolvedValueOnce(queued("q2"));
        const e = editor(api);
        await e.saveToGame();
        expect(e.status).toBe("queued");
        e.apply(addItems(e.build, 0, 0, [8]));
        await e.saveToGame();
        expect(api.cancel).toHaveBeenCalledWith("q1");
        expect(api.cancel.mock.invocationCallOrder[0]).toBeLessThan(api.save.mock.invocationCallOrder[1]!);
        expect(api.save.mock.calls[1]![0]).toMatchObject({ kind: "new" });

        await e.saveToGame();
        expect(api.cancel).toHaveBeenLastCalledWith("q2");
    });

    it("edits the build the queue already wrote when the cancel comes too late", async () => {
        const api = fakeApi();
        api.save.mockResolvedValueOnce(queued("q1"));
        api.cancel.mockResolvedValueOnce(false);
        const e = editor(api);
        await e.saveToGame();
        e.apply(addItems(e.build, 0, 0, [8]));
        await e.saveToGame();
        expect(api.save.mock.calls[1]![0]).toMatchObject({ kind: "edit", section: "Unpublished", base: "b9" });
        expect(e.origin).toEqual({ kind: "local", section: "Unpublished", base: "b9", buildId: 9 });
    });

    it("replaces a queued edit, keeping the file's base while the queue has not run", async () => {
        const api = fakeApi(queued("q1", 5));
        const e = editor(api, { origin: LOCAL });
        await e.saveToGame();
        e.apply(addItems(e.build, 0, 0, [8]));
        await e.saveToGame();
        expect(api.cancel).toHaveBeenCalledWith("q1");
        expect(api.save.mock.calls[1]![0]).toMatchObject({ kind: "edit", section: "SavedLastUsed", base: "ab" });
        expect(api.local).not.toHaveBeenCalled();
    });

    it("edits on top of a queued edit the queue already wrote", async () => {
        const api = fakeApi(queued("q1", 5));
        api.cancel.mockResolvedValueOnce(false);
        api.local.mockResolvedValue(
            localBuilds([
                { section: "SavedLastUsed", build: { ...build(), heroBuildId: 5 }, base: "fresh", warnings: [] },
            ]),
        );
        const e = editor(api, { origin: LOCAL });
        await e.saveToGame();
        await e.saveToGame();
        expect(api.save.mock.calls[1]![0]).toMatchObject({ kind: "edit", section: "SavedLastUsed", base: "fresh" });
    });

    it("follows the written build once the queue flushes", async () => {
        const api = fakeApi(queued("q1"));
        const e = editor(api);
        await e.saveToGame();
        api.flush({ kind: "saved", buildIds: [9] });
        await vi.advanceTimersByTimeAsync(0);
        expect(e.origin).toEqual({ kind: "local", section: "Unpublished", base: "b9", buildId: 9 });
        expect(e.status).toBe("saved");
        await e.saveToGame();
        expect(api.cancel).not.toHaveBeenCalled();
        expect(api.save.mock.calls[1]![0]).toMatchObject({ kind: "edit", base: "b9" });
    });

    it("waits for the flushed build to be read before the next save", async () => {
        const api = fakeApi(queued("q1"));
        const e = editor(api);
        await e.saveToGame();
        const listed = await api.local();
        let release!: () => void;
        api.local.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(listed))));
        api.flush({ kind: "saved", buildIds: [9] });
        const saving = e.saveToGame();
        await vi.advanceTimersByTimeAsync(0);
        release();
        await saving;
        expect(api.save.mock.calls[1]![0]).toMatchObject({ kind: "edit", base: "b9" });
    });

    it("keeps the queued save to replace when the cancel fails", async () => {
        const api = fakeApi(queued("q1"));
        const e = editor(api);
        await e.saveToGame();
        api.cancel.mockRejectedValueOnce(new Error("io"));
        await expect(e.saveToGame()).rejects.toThrow("io");
        expect(e.status).toBe("queued");
        await e.saveToGame();
        expect(api.cancel).toHaveBeenLastCalledWith("q1");
        expect(api.save).toHaveBeenCalledTimes(2);
    });

    it("ignores a flush that did not write its save", async () => {
        const api = fakeApi(queued("q1"));
        const e = editor(api);
        await e.saveToGame();
        api.flush({ kind: "saved", buildIds: [3] });
        api.flush({ kind: "gameRunning" });
        await vi.advanceTimersByTimeAsync(0);
        expect(e.status).toBe("queued");
        expect(e.origin).toEqual({ kind: "new" });
        expect(api.local).not.toHaveBeenCalled();
    });

    it("shows a conflict the flush raised for its save", async () => {
        const api = fakeApi(queued("q1"));
        const e = editor(api);
        await e.saveToGame();
        api.flush({
            kind: "conflict",
            conflicts: [
                { saveId: "q1", id: 9, section: "Unpublished", ours: null, game: null, base: null, gameBlob: null },
            ],
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(e.status).toBe("conflict");
    });

    it("stops listening on dispose", async () => {
        const api = fakeApi();
        const e = editor(api);
        await vi.advanceTimersByTimeAsync(0);
        e.dispose();
        expect(api.unlisten).toHaveBeenCalledTimes(1);
    });
});

describe("BuildEditor status", () => {
    it("tracks the build from unsaved through draft and saving to saved", async () => {
        const api = fakeApi();
        let finish!: () => void;
        api.save.mockImplementationOnce(
            () => new Promise((resolve) => (finish = () => resolve({ kind: "written", buildId: 9, backup: null }))),
        );
        const e = editor(api);
        expect(e.status).toBe("unsaved");
        e.apply(addItems(e.build, 0, 0, [8]));
        expect(e.status).toBe("unsaved");
        await vi.advanceTimersByTimeAsync(800);
        expect(e.status).toBe("draft");
        const saving = e.saveToGame();
        expect(e.status).toBe("saving");
        await vi.advanceTimersByTimeAsync(0);
        finish();
        await saving;
        expect(e.status).toBe("saved");
        e.apply(addItems(e.build, 0, 0, [9]));
        expect(e.status).toBe("unsaved");
    });

    it("counts an unchanged local build as saved and a refused save as a conflict", async () => {
        const api = fakeApi({ kind: "conflict", conflicts: [] });
        const e = editor(api, { origin: { kind: "local", section: "Unpublished", base: "ab", buildId: 5 } });
        expect(e.status).toBe("saved");
        e.apply(addItems(e.build, 0, 0, [8]));
        await e.saveToGame();
        expect(e.status).toBe("conflict");
    });
});

describe("BuildEditor selection", () => {
    const r = (category: number, index: number) => ({ category, index });

    it("selects and sets the active category", () => {
        const e = editor(fakeApi());
        e.select([r(1, 0)], "replace");
        expect(e.selection).toEqual([r(1, 0)]);
        expect(e.activeCategory).toBe(1);
        e.select([r(0, 1)], "range");
        expect(e.selection).toEqual([r(0, 1), r(1, 0)]);
        e.select([r(0, 1)], "toggle");
        expect(e.selection).toEqual([r(1, 0)]);
    });

    it("clears after a structural change and keeps it after an edit in place", () => {
        const e = editor(fakeApi());
        e.select([r(0, 1)], "replace");
        e.apply(updateItem(e.build, r(0, 1), { annotation: "x" }));
        expect(e.selection).toEqual([r(0, 1)]);
        e.apply(removeItems(e.build, [r(0, 0)]));
        expect(e.selection).toEqual([]);
    });

    it("keeps the active category in range", () => {
        const e = editor(fakeApi());
        e.select([r(1, 0)], "replace");
        e.apply({ ...e.build, modCategories: e.build.modCategories.slice(0, 1) });
        expect(e.activeCategory).toBe(0);
    });

    function three() {
        const e = editor(fakeApi(), { build: build([cat([1]), cat([2]), cat([3])]) });
        e.select([r(1, 0)], "replace");
        return e;
    }
    const firstIds = (e: BuildEditor) => e.build.modCategories.map((c) => c.mods[0]?.abilityId);

    it("keeps the same category active when one above it is removed", () => {
        const e = three();
        e.apply(removeCategory(e.build, 0));
        expect(e.activeCategory).toBe(0);
        expect(firstIds(e)[e.activeCategory!]).toBe(2);
    });

    it("keeps the index when a category below the active one is removed", () => {
        const e = three();
        e.apply(removeCategory(e.build, 2));
        expect(e.activeCategory).toBe(1);
    });

    it("clamps when the active last category is removed", () => {
        const e = three();
        e.select([r(2, 0)], "replace");
        e.apply(removeCategory(e.build, 2));
        expect(e.activeCategory).toBe(1);
    });

    it("follows the active category through undo and redo of a removal above it", () => {
        const e = three();
        e.apply(removeCategory(e.build, 0));
        e.undo();
        expect(e.activeCategory).toBe(1);
        e.redo();
        expect(e.activeCategory).toBe(0);
    });

    it("follows the active category when it is moved or another moves past it", () => {
        const e = three();
        e.apply(moveCategory(e.build, 0, 3));
        expect(firstIds(e)).toEqual([2, 3, 1]);
        expect(e.activeCategory).toBe(0);
        e.apply(moveCategory(e.build, 0, 3));
        expect(e.activeCategory).toBe(2);
    });
});

describe("BuildEditor support footer", () => {
    const FOOTER = "Made with Deadlock+ - deadlockplus.app";
    const on = () => Promise.resolve(FOOTER);

    it("starts a new build with the footer when the player has it on, as its clean state", async () => {
        const e = editor(fakeApi(), { supportFooter: on });
        await vi.advanceTimersByTimeAsync(0);
        expect(e.build.description).toBe(FOOTER);
        expect(e.dirty).toBe(false);
        expect(e.canUndo).toBe(false);
    });

    it("leaves a new build alone when the player has it off", async () => {
        const e = editor(fakeApi(), { supportFooter: () => Promise.resolve(null) });
        const start = e.build;
        await vi.advanceTimersByTimeAsync(0);
        expect(e.build).toBe(start);
    });

    it("leaves a build from the game file or a draft as it was saved", async () => {
        const local = editor(fakeApi(), {
            origin: { kind: "local", section: "Unpublished", base: "b", buildId: 3 },
            supportFooter: on,
        });
        const draft = editor(fakeApi(), { draftId: "d0", supportFooter: on });
        await vi.advanceTimersByTimeAsync(0);
        expect(local.build.description).toBe("");
        expect(draft.build.description).toBe("");
    });

    it("does not overwrite an edit made before the preference loaded", async () => {
        let resolve!: (footer: string) => void;
        const e = editor(fakeApi(), { supportFooter: () => new Promise((r) => (resolve = r)) });
        e.apply(addItems(e.build, 0, 0, [8]));
        const edited = e.build;
        resolve(FOOTER);
        await vi.advanceTimersByTimeAsync(0);
        expect(e.build).toBe(edited);
    });
});
