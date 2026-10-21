import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import { isInShop, type ShopItem } from "../../../catalog";
import { fitToItems, moveItems, updateItem, type ItemRef } from "../../../editor/document";
import { TAG_SLOTS } from "../../../editor/details";

const byPlace = (a: ItemRef, b: ItemRef) => a.category - b.category || a.index - b.index;

/** Copies go after the selection's last item in the earliest category it touches. */
export function duplicateItems(build: BuildView, refs: readonly ItemRef[]): { build: BuildView; copies: ItemRef[] } {
    const first = [...refs].sort(byPlace)[0];
    if (!first) return { build, copies: [] };
    const { category } = first;
    const last = refs.filter((r) => r.category === category).reduce((m, r) => Math.max(m, r.index), first.index);
    const next = moveItems(build, refs, { category, index: last + 1 }, true);
    const added = (next.modCategories[category]?.mods.length ?? 0) - (build.modCategories[category]?.mods.length ?? 0);
    return { build: next, copies: Array.from({ length: added }, (_, k) => ({ category, index: last + 1 + k })) };
}

export function swapChoices(
    item: ShopItem | undefined,
    byId: ReadonlyMap<number, ShopItem>,
): { upgrades: ShopItem[]; components: ShopItem[] } {
    if (!item) return { upgrades: [], components: [] };
    const live = (i: ShopItem | undefined): i is ShopItem => !!i && isInShop(i);
    return {
        upgrades: [...byId.values()].filter((i) => live(i) && i.componentIds.includes(item.id)),
        components: item.componentIds.map((id) => byId.get(id)).filter(live),
    };
}

/** The note and sell priority stay; an imbue target only survives on an item that takes one. */
export function swapItem(build: BuildView, ref: ItemRef, next: ShopItem): BuildView {
    return updateItem(build, ref, { abilityId: next.id, ...(next.imbue ? {} : { imbueTargetAbilityId: null }) });
}

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
