import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import type { ModEntryView } from "@deadlock-plus/ipc-types/ModEntryView";
import type { ShopItem } from "../catalog";
import { fitSize } from "../shop-view";

export interface ItemRef {
    category: number;
    index: number;
}

const clamp = (value: number, max: number) => Math.min(Math.max(0, value), max);

function withCategories(build: BuildView, modCategories: ModCategoryView[]): BuildView {
    return { ...build, modCategories };
}

function mapCategory(build: BuildView, index: number, fn: (category: ModCategoryView) => ModCategoryView): BuildView {
    if (!build.modCategories[index]) return build;
    return withCategories(
        build,
        build.modCategories.map((c, i) => (i === index ? fn(c) : c)),
    );
}

function entry(abilityId: number): ModEntryView {
    return { abilityId, annotation: null, requiredFlexSlots: null, sellPriority: null, imbueTargetAbilityId: null };
}

/** Valid refs once each, in document order. */
function normalized(build: BuildView, refs: readonly ItemRef[]): ItemRef[] {
    const seen = new Set<string>();
    return refs
        .filter((r) => {
            const key = `${r.category}:${r.index}`;
            if (seen.has(key) || !build.modCategories[r.category]?.mods[r.index]) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => a.category - b.category || a.index - b.index);
}

export function addItems(build: BuildView, category: number, index: number, abilityIds: readonly number[]): BuildView {
    return mapCategory(build, category, (c) => {
        const at = clamp(index, c.mods.length);
        return { ...c, mods: [...c.mods.slice(0, at), ...abilityIds.map(entry), ...c.mods.slice(at)] };
    });
}

/** `to.index` is an insertion index in `to.category` counted BEFORE the moved items are removed. */
export function moveItems(build: BuildView, from: readonly ItemRef[], to: ItemRef, copy: boolean): BuildView {
    const target = build.modCategories[to.category];
    const refs = normalized(build, from);
    if (!target || refs.length === 0) return build;
    const moved = refs.map((r) => ({ ...build.modCategories[r.category]!.mods[r.index]! }));
    let index = clamp(to.index, target.mods.length);
    let next = build;
    if (!copy) {
        index -= refs.filter((r) => r.category === to.category && r.index < index).length;
        next = removeItems(build, refs);
    }
    return mapCategory(next, to.category, (c) => ({
        ...c,
        mods: [...c.mods.slice(0, index), ...moved, ...c.mods.slice(index)],
    }));
}

export function removeItems(build: BuildView, refs: readonly ItemRef[]): BuildView {
    const gone = new Set(normalized(build, refs).map((r) => `${r.category}:${r.index}`));
    if (gone.size === 0) return build;
    return withCategories(
        build,
        build.modCategories.map((c, ci) =>
            c.mods.some((_, mi) => gone.has(`${ci}:${mi}`))
                ? { ...c, mods: c.mods.filter((_, mi) => !gone.has(`${ci}:${mi}`)) }
                : c,
        ),
    );
}

export function updateItem(build: BuildView, ref: ItemRef, patch: Partial<ModEntryView>): BuildView {
    if (!build.modCategories[ref.category]?.mods[ref.index]) return build;
    return mapCategory(build, ref.category, (c) => ({
        ...c,
        mods: c.mods.map((m, i) => (i === ref.index ? { ...m, ...patch } : m)),
    }));
}

function insertCategory(build: BuildView, index: number, category: ModCategoryView): BuildView {
    const at = clamp(index, build.modCategories.length);
    return withCategories(build, [...build.modCategories.slice(0, at), category, ...build.modCategories.slice(at)]);
}

export function addCategory(build: BuildView, index: number, name: string): BuildView {
    const fit = fitSize(0);
    return insertCategory(build, index, {
        mods: [],
        name,
        description: "",
        width: fit.width,
        height: fit.height,
        optional: false,
    });
}

export function removeCategory(build: BuildView, index: number): BuildView {
    if (!build.modCategories[index]) return build;
    return withCategories(
        build,
        build.modCategories.filter((_, i) => i !== index),
    );
}

/** `to` is an insertion index counted before the category is removed. */
export function moveCategory(build: BuildView, from: number, to: number): BuildView {
    const moved = build.modCategories[from];
    if (!moved) return build;
    const at = clamp(to, build.modCategories.length);
    return insertCategory(removeCategory(build, from), at > from ? at - 1 : at, moved);
}

export function updateCategory(
    build: BuildView,
    index: number,
    patch: Partial<Omit<ModCategoryView, "mods">>,
): BuildView {
    return mapCategory(build, index, (c) => ({ ...c, ...patch }));
}

export function duplicateCategory(build: BuildView, index: number): BuildView {
    const source = build.modCategories[index];
    if (!source) return build;
    return insertCategory(build, index + 1, { ...source, mods: source.mods.map((m) => ({ ...m })) });
}

/** Items from `at` on go to a new unnamed category right after, at the same size; the UI starts its rename. */
export function splitCategory(build: BuildView, index: number, at: number): BuildView {
    const source = build.modCategories[index];
    if (!source) return build;
    const cut = clamp(at, source.mods.length);
    const split = mapCategory(build, index, (c) => ({ ...c, mods: c.mods.slice(0, cut) }));
    return insertCategory(split, index + 1, { ...source, name: "", description: "", mods: source.mods.slice(cut) });
}

/** The last category has no next one and comes back unchanged. */
export function mergeWithNext(build: BuildView, index: number): BuildView {
    const next = build.modCategories[index + 1];
    if (!build.modCategories[index] || !next) return build;
    const merged = mapCategory(build, index, (c) => ({ ...c, mods: [...c.mods, ...next.mods] }));
    return removeCategory(merged, index + 1);
}

/** Tier, then cost, then name; ids the catalog does not know go last in their order. */
export function sortItems(build: BuildView, index: number, byId: ReadonlyMap<number, ShopItem>): BuildView {
    return mapCategory(build, index, (c) => {
        const known = c.mods.filter((m) => byId.has(m.abilityId));
        const unknown = c.mods.filter((m) => !byId.has(m.abilityId));
        const sorted = [...known].sort((a, b) => {
            const x = byId.get(a.abilityId)!;
            const y = byId.get(b.abilityId)!;
            return x.tier - y.tier || x.cost - y.cost || x.name.localeCompare(y.name);
        });
        return { ...c, mods: [...sorted, ...unknown] };
    });
}

export function fitToItems(build: BuildView, index: number): BuildView {
    return mapCategory(build, index, (c) => {
        const fit = fitSize(c.mods.length);
        return { ...c, width: fit.width, height: fit.height };
    });
}

export function updateBuild(
    build: BuildView,
    patch: Partial<Pick<BuildView, "name" | "description" | "language" | "tags" | "abilityOrder">>,
): BuildView {
    return { ...build, ...patch };
}

export function occurrences(build: BuildView): Map<number, number> {
    const counts = new Map<number, number>();
    for (const category of build.modCategories) {
        for (const mod of category.mods) counts.set(mod.abilityId, (counts.get(mod.abilityId) ?? 0) + 1);
    }
    return counts;
}
