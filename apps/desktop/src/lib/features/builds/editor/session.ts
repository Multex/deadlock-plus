import type { BuildSection } from "@deadlock-plus/ipc-types/BuildSection";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { DraftSource } from "@deadlock-plus/ipc-types/DraftSource";
import type { DraftView } from "@deadlock-plus/ipc-types/DraftView";
import type { FlushView } from "@deadlock-plus/ipc-types/FlushView";
import type { LocalBuild } from "@deadlock-plus/ipc-types/LocalBuild";
import type { SaveRequest } from "@deadlock-plus/ipc-types/SaveRequest";
import { pickLocal } from "../build-detail.svelte";
import type { ItemRef } from "./document";

export type EditOrigin =
    { kind: "new" } | { kind: "local"; section: BuildSection; base: string; buildId: number } | { kind: "copyView" };

export type SelectMode = "replace" | "toggle" | "range";

export function saveRequest(origin: EditOrigin, build: BuildView): SaveRequest {
    if (origin.kind === "local") return { kind: "edit", section: origin.section, base: origin.base, build };
    return { kind: origin.kind, build };
}

function draftSource(origin: EditOrigin, build: BuildView): DraftSource {
    if (origin.kind === "local") {
        return { kind: "local", section: origin.section, buildId: origin.buildId, base: origin.base };
    }
    return origin.kind === "copyView" ? { kind: "public", buildId: build.heroBuildId } : { kind: "new" };
}

/** `updatedAt` is Unix seconds. */
export function draftOf(id: string | undefined, origin: EditOrigin, build: BuildView, updatedAt: number): DraftView {
    return { id: id ?? "", updatedAt, heroId: build.heroId, source: draftSource(origin, build), build };
}

/** After a written save: an edit of the build as the file now holds it, or the same origin when the file does not list it. */
export function savedOrigin(origin: EditOrigin, buildId: number, local: readonly LocalBuild[]): EditOrigin {
    const sameSection =
        origin.kind === "local"
            ? local.find((b) => b.section === origin.section && b.build.heroBuildId === buildId)
            : undefined;
    const found = sameSection ?? pickLocal(local, buildId);
    return found ? { kind: "local", section: found.section, base: found.base, buildId } : origin;
}

export interface QueuedSave {
    id: string;
    buildId: number;
}

/** What a queue flush did with `queued`; `null` while it stays queued. */
export function flushOutcome(view: FlushView, queued: QueuedSave): "saved" | "conflict" | null {
    if (view.kind === "saved") return view.buildIds.includes(queued.buildId) ? "saved" : null;
    if (view.kind === "conflict") return view.conflicts.some((c) => c.saveId === queued.id) ? "conflict" : null;
    return null;
}

const same = (a: ItemRef, b: ItemRef) => a.category === b.category && a.index === b.index;

export function nextSelection(
    build: BuildView,
    selection: readonly ItemRef[],
    anchor: ItemRef | null,
    refs: readonly ItemRef[],
    mode: SelectMode,
): ItemRef[] {
    if (mode === "toggle") {
        const kept = selection.filter((s) => !refs.some((r) => same(r, s)));
        return [...kept, ...refs.filter((r) => !selection.some((s) => same(r, s)))];
    }
    const target = refs.at(-1);
    if (mode === "replace" || !anchor || !target) return [...refs];
    const all = build.modCategories.flatMap((c, category) => c.mods.map((_, index) => ({ category, index })));
    const from = all.findIndex((r) => same(r, anchor));
    const to = all.findIndex((r) => same(r, target));
    if (from < 0 || to < 0) return [...refs];
    return all.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/** Whether `selection` still names the same items after `prev` became `next`. */
export function selectionSurvives(prev: BuildView, next: BuildView, selection: readonly ItemRef[]): boolean {
    if (prev.modCategories.length !== next.modCategories.length) return false;
    if (prev.modCategories.some((c, i) => c.mods.length !== next.modCategories[i]!.mods.length)) return false;
    return selection.every(
        (r) =>
            prev.modCategories[r.category]?.mods[r.index]?.abilityId ===
            next.modCategories[r.category]?.mods[r.index]?.abilityId,
    );
}
