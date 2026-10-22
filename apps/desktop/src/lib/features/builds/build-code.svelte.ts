import { failureText } from "$lib/core/errors";
import { t } from "$lib/core/i18n.svelte";
import { loadHeroes } from "$lib/features/heroes/heroes";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { DraftSource } from "@deadlock-plus/ipc-types/DraftSource";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import type { SaveRequest } from "@deadlock-plus/ipc-types/SaveRequest";
import { buildCodeExport, buildCodeImport, buildsDraftSave } from "./api";
import { editHref } from "./editor/load";
import { draftOf } from "./editor/session";

export interface CodeDeps {
    exportCode(request: SaveRequest): Promise<string>;
    writeText(text: string): Promise<void>;
    heroName(heroId: number): Promise<string | null>;
    importCode(code: string): Promise<BuildView>;
    saveDraft(draft: DraftView): Promise<DraftView>;
    /** Milliseconds. */
    now(): number;
}

const appDeps: CodeDeps = {
    exportCode: buildCodeExport,
    writeText: (text) => navigator.clipboard.writeText(text),
    heroName: async (heroId) => (await loadHeroes([heroId]))[heroId]?.name ?? null,
    importCode: buildCodeImport,
    saveDraft: buildsDraftSave,
    now: () => Date.now(),
};

export interface Step {
    key: string;
    params?: Record<string, string>;
}

/** What the player clicks in Deadlock to add a copied build code. */
export function pasteSteps(hero: string | null): Step[] {
    return [
        hero ? { key: "builds.code.step_hero", params: { hero } } : { key: "builds.code.step_hero_unknown" },
        { key: "builds.code.step_menu" },
        { key: "builds.code.step_browser" },
        { key: "builds.code.step_create" },
        { key: "builds.code.step_paste" },
    ];
}

/** A build in the file exports from its stored blob, so fields the app does not model survive. */
export function detailExportRequest(
    build: BuildView,
    local: { base: string } | null,
    draft: { source: DraftSource } | null,
): SaveRequest {
    const source = draft?.source;
    const base = local?.base ?? (source?.kind === "local" ? source.base : null);
    return base !== null ? { kind: "copy", source: base, build } : { kind: "copyView", build };
}

export type CopyStatus =
    { kind: "idle" } | { kind: "copying" } | { kind: "copied" } | { kind: "failed"; message: string };

export class GameCode {
    status = $state.raw<CopyStatus>({ kind: "idle" });
    /** The in-game steps are showing. */
    open = $state(false);
    /** The steps follow a copy just made, not a reopen. */
    copied = $state(false);
    heroName = $state<string | null>(null);

    constructor(private readonly deps: CodeDeps = appDeps) {}

    async copy(request: SaveRequest, heroId: number): Promise<void> {
        if (this.status.kind === "copying") return;
        this.status = { kind: "copying" };
        const name = this.#name(heroId);
        try {
            await this.deps.writeText(await this.deps.exportCode(request));
        } catch (e) {
            this.status = { kind: "failed", message: failureText(e, t("builds.code.copy_failed")) };
            return;
        }
        this.heroName = await name;
        this.status = { kind: "copied" };
        this.copied = true;
        this.open = true;
    }

    async showSteps(heroId: number): Promise<void> {
        this.heroName = await this.#name(heroId);
        this.copied = false;
        this.open = true;
    }

    #name(heroId: number): Promise<string | null> {
        return this.deps.heroName(heroId).catch(() => null);
    }
}

export type PasteStatus = { kind: "idle" } | { kind: "importing" } | { kind: "failed"; message: string };

export class CodePaste {
    code = $state("");
    status = $state.raw<PasteStatus>({ kind: "idle" });

    constructor(private readonly deps: CodeDeps = appDeps) {}

    get canSubmit(): boolean {
        return this.code.trim() !== "" && this.status.kind !== "importing";
    }

    edit(code: string): void {
        this.code = code;
        if (this.status.kind === "failed") this.status = { kind: "idle" };
    }

    /** The editor link of the imported build, stored as a draft of a new copy; null when it failed. */
    async submit(): Promise<string | null> {
        if (this.status.kind === "importing") return null;
        this.status = { kind: "importing" };
        try {
            const build = await this.deps.importCode(this.code.trim());
            const draft = draftOf(undefined, { kind: "copyView" }, build, Math.floor(this.deps.now() / 1000));
            const stored = await this.deps.saveDraft(draft);
            this.status = { kind: "idle" };
            return editHref({ source: "draft", id: stored.id });
        } catch (e) {
            this.status = { kind: "failed", message: failureText(e, t("builds.code.import_failed")) };
            return null;
        }
    }
}
