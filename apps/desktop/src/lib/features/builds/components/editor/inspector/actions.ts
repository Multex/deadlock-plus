import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import { fitToItems } from "../../../editor/document";
import { TAG_SLOTS } from "../../../editor/details";

/** One build, so the editor records it as a single undo step; unchanged when every category already fits. */
export function compactAll(build: BuildView): BuildView {
    const fitted = build.modCategories.reduce((next, _, i) => fitToItems(next, i), build);
    const same = fitted.modCategories.every(
        (c, i) => c.width === build.modCategories[i]!.width && c.height === build.modCategories[i]!.height,
    );
    return same ? build : fitted;
}

/** `id` 0 clears the slot. A tag sits in one slot only, so placing it again moves it. */
export function setTagSlot(tags: number[], slot: number, id: number): number[] {
    if (!Number.isInteger(slot) || slot < 0 || slot >= TAG_SLOTS) return tags;
    const next = tags.map((tag) => (id !== 0 && tag === id ? 0 : tag));
    while (next.length <= slot) next.push(0);
    next[slot] = id;
    return next;
}

const UINT32_MAX = 4294967295;

/** Blank clears the field; anything but a whole number the file's uint32 holds is invalid. */
export function parseCount(text: string): number | null | undefined {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    if (!/^\d+$/.test(trimmed)) return undefined;
    const value = Number(trimmed);
    return value <= UINT32_MAX ? value : undefined;
}
