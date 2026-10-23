import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import { describe, expect, it, vi } from "vitest";
import { CodePaste, GameCode, detailExportRequest, pasteSteps, type CodeDeps } from "./build-code.svelte";

const build = (over: Partial<BuildView> = {}): BuildView => ({
    heroBuildId: 446250,
    heroId: 2,
    authorAccountId: 387246372,
    lastUpdatedTimestamp: null,
    name: "Seven",
    description: "",
    language: 0,
    version: 3,
    originBuildId: null,
    modCategories: [],
    abilityOrder: [],
    tags: [],
    developmentBuild: false,
    publishTimestamp: null,
    favorited: false,
    ...over,
});

function deps(over: Partial<CodeDeps> = {}): CodeDeps {
    return {
        exportCode: vi.fn(async () => "KLUv/QBY"),
        writeText: vi.fn(async () => {}),
        heroName: vi.fn(async () => "Seven"),
        importCode: vi.fn(async () => build({ name: "Copy of Seven" })),
        saveDraft: vi.fn(async (draft: DraftView) => ({ ...draft, id: "d-1" })),
        now: () => 1_760_000_000_000,
        ...over,
    };
}

const appError = (code: string) => ({ code });

describe("pasteSteps", () => {
    it("names the hero in the first of the five in-game steps", () => {
        const steps = pasteSteps("Seven");
        expect(steps.map((s) => s.key)).toEqual([
            "builds.code.step_hero",
            "builds.code.step_menu",
            "builds.code.step_browser",
            "builds.code.step_create",
            "builds.code.step_paste",
        ]);
        expect(steps[0]!.params).toEqual({ hero: "Seven" });
    });

    it("asks for the build's hero without a name when the hero is unknown", () => {
        expect(pasteSteps(null)[0]).toEqual({ key: "builds.code.step_hero_unknown" });
    });
});

describe("detailExportRequest", () => {
    it("exports a build in the file from its stored blob", () => {
        const view = build();
        expect(detailExportRequest(view, { base: "0a01" }, null)).toEqual({
            kind: "copy",
            source: "0a01",
            build: view,
        });
    });

    it("exports a draft of a local build from that build's blob", () => {
        const view = build();
        const source = { kind: "local", section: "Unpublished", buildId: 60, base: "0b02" } as const;
        expect(detailExportRequest(view, null, { source })).toEqual({ kind: "copy", source: "0b02", build: view });
    });

    it("exports a published build from its view, unrenamed", () => {
        const view = build();
        expect(detailExportRequest(view, null, { source: { kind: "public", buildId: 446250 } })).toEqual({
            kind: "copyView",
            build: view,
        });
    });
});

describe("GameCode", () => {
    it("copies the exported code and opens the steps for the build's hero", async () => {
        const d = deps();
        const code = new GameCode(d);
        const request = { kind: "copyView", build: build() } as const;

        await code.copy(request, 2);

        expect(d.exportCode).toHaveBeenCalledWith(request);
        expect(d.writeText).toHaveBeenCalledWith("KLUv/QBY");
        expect(d.heroName).toHaveBeenCalledWith(2);
        expect(code.status).toEqual({ kind: "copied" });
        expect(code.open).toBe(true);
        expect(code.copied).toBe(true);
        expect(code.heroName).toBe("Seven");
    });

    it("reopens the steps without copying again", async () => {
        const d = deps();
        const code = new GameCode(d);

        await code.showSteps(2);

        expect(d.exportCode).not.toHaveBeenCalled();
        expect(d.writeText).not.toHaveBeenCalled();
        expect(code.open).toBe(true);
        expect(code.copied).toBe(false);
        expect(code.heroName).toBe("Seven");
    });

    it("still shows the steps when the hero name cannot be loaded", async () => {
        const code = new GameCode(deps({ heroName: vi.fn(async () => Promise.reject(new Error("offline"))) }));

        await code.copy({ kind: "copyView", build: build() }, 2);

        expect(code.status).toEqual({ kind: "copied" });
        expect(code.heroName).toBeNull();
    });

    it("reports a failed export and opens nothing", async () => {
        const d = deps({ exportCode: vi.fn(async () => Promise.reject(appError("common.internal"))) });
        const code = new GameCode(d);

        await code.copy({ kind: "copyView", build: build() }, 2);

        expect(d.writeText).not.toHaveBeenCalled();
        expect(code.status.kind).toBe("failed");
        expect(code.open).toBe(false);
    });

    it("reports a clipboard that refused the write", async () => {
        const code = new GameCode(deps({ writeText: vi.fn(async () => Promise.reject(new Error("denied"))) }));

        await code.copy({ kind: "copyView", build: build() }, 2);

        expect(code.status).toEqual({ kind: "failed", message: "Couldn't copy the build code" });
        expect(code.open).toBe(false);
    });
});

describe("CodePaste", () => {
    it("stores the imported build as a draft of a new copy and answers its editor link", async () => {
        const d = deps();
        const paste = new CodePaste(d);
        paste.code = "  KLUv/QBY\n";

        const href = await paste.submit();

        expect(d.importCode).toHaveBeenCalledWith("KLUv/QBY");
        expect(d.saveDraft).toHaveBeenCalledWith({
            id: "",
            updatedAt: 1_760_000_000,
            heroId: 2,
            source: { kind: "public", buildId: 446250 },
            build: build({ name: "Copy of Seven" }),
        });
        expect(href).toBe("/builds/edit?source=draft&id=d-1");
        expect(paste.status).toEqual({ kind: "idle" });
    });

    it("shows the code error's own sentence", async () => {
        const paste = new CodePaste(
            deps({ importCode: vi.fn(async () => Promise.reject(appError("builds.code_damaged"))) }),
        );
        paste.code = "abc";

        expect(await paste.submit()).toBeNull();
        expect(paste.status).toEqual({
            kind: "failed",
            message: "This build code is damaged. Copy it again from Deadlock.",
        });
    });

    it("falls back to its own sentence when the draft cannot be stored", async () => {
        const paste = new CodePaste(deps({ saveDraft: vi.fn(async () => Promise.reject(new Error("disk"))) }));
        paste.code = "abc";

        expect(await paste.submit()).toBeNull();
        expect(paste.status).toEqual({ kind: "failed", message: "Couldn't open this build code" });
    });

    it("clears an old error once the code changes", async () => {
        const paste = new CodePaste(
            deps({ importCode: vi.fn(async () => Promise.reject(appError("builds.code_invalid"))) }),
        );
        paste.code = "abc";
        await paste.submit();

        paste.edit("abcd");

        expect(paste.code).toBe("abcd");
        expect(paste.status).toEqual({ kind: "idle" });
    });

    it("has nothing to submit while the field is blank", () => {
        const paste = new CodePaste(deps());
        paste.code = "   ";
        expect(paste.canSubmit).toBe(false);
        paste.code = "a";
        expect(paste.canSubmit).toBe(true);
    });
});
