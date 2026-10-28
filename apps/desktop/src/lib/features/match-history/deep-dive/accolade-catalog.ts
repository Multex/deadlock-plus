import { command } from "$lib/core/tauri";
import type { AccoladeEntry } from "@deadlock-plus/ipc-types/AccoladeEntry";

export interface AccoladeInfo {
    name: string;
    /** The game's description template, still to be filled with a value. */
    description: string | null;
    trackedStat: string | null;
}

const isAccoladeEntry = (value: unknown): value is AccoladeEntry =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as AccoladeEntry).id === "number" &&
    typeof (value as AccoladeEntry).name === "string";

/** Name, description and tracked stat, from the installed game, of the accolade ids in `ids` it knows. */
export async function resolveAccoladeInfo(ids: readonly number[], locale: string): Promise<Map<number, AccoladeInfo>> {
    const out = new Map<number, AccoladeInfo>();
    if (ids.length === 0) return out;
    let entries: AccoladeEntry[];
    try {
        const value = await command<unknown>("game_accolades", { locale });
        entries = Array.isArray(value) ? value.filter(isAccoladeEntry) : [];
    } catch {
        return out;
    }
    const wanted = new Set(ids);
    for (const e of entries) {
        if (wanted.has(e.id)) out.set(e.id, { name: e.name, description: e.description, trackedStat: e.trackedStat });
    }
    return out;
}
