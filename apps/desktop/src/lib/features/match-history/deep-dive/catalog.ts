import { command } from "$lib/core/tauri";
import { loadAbilityArt, loadItemArt } from "$lib/features/gamedata/gamedata";
import type { ItemEntry } from "@deadlock-plus/ipc-types/ItemEntry";
import { visualKind, type IdVisual } from "@deadlock-plus/match/deep-dive/catalog";
import { humaniseClassName } from "@deadlock-plus/match/deep-dive/names";

/**
 * Every id in `ids` that the installed game's catalog knows, with its name; art is filled in when found.
 * Entries without a display name get a worded class name, never the raw class name.
 */
export async function resolveVisuals(
    ids: readonly number[],
    locale: string,
    kind: "item" | "ability",
): Promise<Map<number, IdVisual>> {
    const out = new Map<number, IdVisual>();
    if (ids.length === 0) return out;
    let entries: ItemEntry[];
    try {
        entries = await command<ItemEntry[]>("game_items", { locale });
    } catch {
        return out;
    }
    const wanted = new Set(ids);
    const known = entries.filter((e) => wanted.has(e.id));
    const names = known.map((e) => e.className);
    const art = kind === "item" ? await loadItemArt(names, "shop") : await loadAbilityArt(names);
    for (const e of known) {
        out.set(e.id, {
            name: e.localised ? e.name : humaniseClassName(e.className),
            src: art[e.className],
            kind: visualKind(e.className, e.kind),
        });
    }
    return out;
}

/**
 * Ids from a player's item list, which mixes shop items with hero abilities: items get shop art and
 * the ids that have none are looked up again for ability art.
 */
export async function resolveItemListVisuals(ids: readonly number[], locale: string): Promise<Map<number, IdVisual>> {
    const items = await resolveVisuals(ids, locale, "item");
    const rest = ids.filter((id) => {
        const v = items.get(id);
        return v?.kind === "ability" || (v !== undefined && !v.src);
    });
    if (rest.length === 0) return items;
    const abilities = await resolveVisuals(rest, locale, "ability");
    const out = new Map(items);
    for (const [id, visual] of abilities) {
        if (visual.src || visual.kind === "ability") out.set(id, visual);
    }
    return out;
}
