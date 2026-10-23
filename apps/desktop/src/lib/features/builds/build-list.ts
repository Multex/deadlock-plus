import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";

export const CORE_ITEMS = 6;

/**
 * The build's priciest items, listed in build order so the strip reads like the build's progression.
 * Optional categories only count when nothing else holds an item; `costOf` answers undefined for an item
 * the shop no longer sells.
 */
export function coreItems(
    build: BuildView,
    costOf: (abilityId: number) => number | undefined,
    max = CORE_ITEMS,
): number[] {
    const required = build.modCategories.filter((c) => !c.optional);
    const source = required.some((c) => c.mods.length > 0) ? required : build.modCategories;
    const order: { id: number; cost: number; at: number }[] = [];
    const seen = new Set<number>();
    for (const category of source) {
        for (const { abilityId } of category.mods) {
            const cost = costOf(abilityId);
            if (cost === undefined || seen.has(abilityId)) continue;
            seen.add(abilityId);
            order.push({ id: abilityId, cost, at: order.length });
        }
    }
    return [...order]
        .sort((a, b) => b.cost - a.cost || a.at - b.at)
        .slice(0, max)
        .sort((a, b) => a.at - b.at)
        .map((item) => item.id);
}

/** `step` of ±Infinity jumps to either end; the selection stops at the ends rather than wrapping. */
export function moveSelection(keys: readonly string[], current: string | null, step: number): string | null {
    if (keys.length === 0) return null;
    const at = current === null ? -1 : keys.indexOf(current);
    if (at < 0) return keys[0]!;
    return keys[Math.min(keys.length - 1, Math.max(0, at + step))]!;
}

/** The first row stands in for a wanted row the list no longer holds. */
export function pickSelection(keys: readonly string[], wanted: string | null): string | null {
    if (wanted !== null && keys.includes(wanted)) return wanted;
    return keys[0] ?? null;
}

export function withParam(params: URLSearchParams, key: string, value: string | null): URLSearchParams {
    const out = new URLSearchParams(params);
    if (value === null) out.delete(key);
    else out.set(key, value);
    return out;
}
