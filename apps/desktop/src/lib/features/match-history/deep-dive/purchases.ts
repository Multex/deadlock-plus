import type { MatchItem } from "../detail";
import type { VisualKind } from "./catalog";

export type PurchaseKind = "item-buy" | "item-sell" | "ability-unlock" | "ability-upgrade";

export interface PurchaseAction {
    kind: PurchaseKind;
    timeS: number;
    /** Item id for item actions, ability id for ability actions. */
    id: number;
    /** Ability actions only: 1 when unlocked, one more for each upgrade. */
    level?: number;
    imbuedAbilityId?: number;
}

export interface HeldItem {
    itemId: number;
    imbuedAbilityId?: number;
}

export interface AbilityLevel {
    abilityId: number;
    level: number;
}

export interface PurchaseState {
    /** In purchase order. */
    items: HeldItem[];
    /** In unlock order. */
    abilities: AbilityLevel[];
}

/** Upgrades an ability can take after it is unlocked. */
export const ABILITY_UPGRADES = 3;

function bitCount(bits: number): number {
    let count = 0;
    for (let rest = bits >>> 0; rest !== 0; rest >>>= 1) count += rest & 1;
    return count;
}

/**
 * A player's item rows mix shop items with ability points spent: an ability row repeats its id,
 * once per point spent. A row's upgrade bits give the level it reached, and the first row of an
 * ability can already hold an upgrade, so it yields the unlock and the upgrade as two actions.
 * Rows without the bits are counted instead: first the unlock, then one upgrade each.
 * `kindOf` is the game catalog's answer; rows it cannot place fall back to the upgrade id, which
 * is 0 on ability rows.
 */
export function purchaseActions(
    items: readonly MatchItem[],
    kindOf: (id: number) => VisualKind | undefined,
): PurchaseAction[] {
    const levels = new Map<number, number>();
    const keyed: { action: PurchaseAction; order: number }[] = [];
    const rows = items.map((item, index) => ({ item, index })).sort((a, b) => a.item.boughtS - b.item.boughtS);

    for (const { item, index } of rows) {
        const known = kindOf(item.itemId);
        const isAbility = known === "ability" || (known !== "item" && item.upgradeId === 0);
        if (isAbility) {
            const before = levels.get(item.itemId) ?? 0;
            const level = item.upgradeBits !== undefined ? bitCount(item.upgradeBits) : before + 1;
            levels.set(item.itemId, Math.max(level, before));
            const at = { timeS: item.boughtS, id: item.itemId };
            if (before === 0) keyed.push({ action: { kind: "ability-unlock", ...at, level: 1 }, order: index * 2 });
            if (level > 1) keyed.push({ action: { kind: "ability-upgrade", ...at, level }, order: index * 2 + 1 });
            continue;
        }
        const buy: PurchaseAction = { kind: "item-buy", timeS: item.boughtS, id: item.itemId };
        if (item.imbuedAbilityId !== undefined) buy.imbuedAbilityId = item.imbuedAbilityId;
        keyed.push({ action: buy, order: index * 2 });
        if (item.soldS !== undefined) {
            keyed.push({
                action: { kind: "item-sell", timeS: Math.max(item.soldS, item.boughtS), id: item.itemId },
                order: index * 2 + 1,
            });
        }
    }

    return keyed.sort((a, b) => a.action.timeS - b.action.timeS || a.order - b.order).map((k) => k.action);
}

/** What the player holds once the action at `step` has happened. */
export function purchaseStateAt(actions: readonly PurchaseAction[], step: number): PurchaseState {
    const items: HeldItem[] = [];
    const abilities: AbilityLevel[] = [];
    for (const action of actions.slice(0, step + 1)) {
        if (action.kind === "item-buy") {
            const held: HeldItem = { itemId: action.id };
            if (action.imbuedAbilityId !== undefined) held.imbuedAbilityId = action.imbuedAbilityId;
            items.push(held);
        } else if (action.kind === "item-sell") {
            const at = items.findIndex((i) => i.itemId === action.id);
            if (at !== -1) items.splice(at, 1);
        } else {
            const known = abilities.find((a) => a.abilityId === action.id);
            if (known) known.level = action.level ?? known.level + 1;
            else abilities.push({ abilityId: action.id, level: action.level ?? 1 });
        }
    }
    return { items, abilities };
}

export function clampStep(step: number, count: number): number {
    if (!Number.isFinite(step) || count <= 0) return 0;
    return Math.min(Math.max(Math.round(step), 0), count - 1);
}
