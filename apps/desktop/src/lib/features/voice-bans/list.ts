import type { Profile } from "./profiles";
import { steam64ToSteam32 } from "$lib/core/player-links";
import { parseVoiceBan } from "./voice-ban";

export const PAGE_SIZE = 25;

/** Newest first: the game appends new mutes to the end of the file. */
export function mutedIds(file: { exists: boolean; text: string } | null): string[] {
    if (!file?.exists) return [];
    try {
        return parseVoiceBan(file.text)
            .users.map((u) => u.steamid64)
            .reverse();
    } catch {
        return [];
    }
}

export function filterMuted(muted: string[], filter: string, profiles: Record<string, Profile>): string[] {
    const q = filter.trim().toLowerCase();
    if (!q) return muted;
    return muted.filter(
        (id) => id.includes(q) || steam64ToSteam32(id).includes(q) || profiles[id]?.name.toLowerCase().includes(q),
    );
}

export function pageCount(total: number): number {
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export function pageSlice<T>(items: T[], page: number): T[] {
    return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

export function toggleIds(selected: Set<string>, ids: string[], on: boolean): Set<string> {
    const next = new Set(selected);
    for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
    }
    return next;
}

export function pruneSelection(selected: Set<string>, known: Iterable<string>): Set<string> {
    const keep = new Set(known);
    return new Set([...selected].filter((id) => keep.has(id)));
}
