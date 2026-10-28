import type { RankedSeason } from "./types";

/**
 * Pinned season dates, preferred over `/v1/assets/ranked-seasons`: that asset gives Beta Season 1 a second
 * interval running to 2028-01-01, but the season ends at 2026-11-05 22:00Z (2 pm PST), its first interval's end.
 */
export const KNOWN_SEASONS: readonly RankedSeason[] = [
    { id: "season_1", name: "Beta Season 1", startS: 1785430800, endS: 1793916000 },
];

const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Reads `/v1/assets/ranked-seasons`; a season spans its first interval start to its last interval end. */
export function parseRankedSeasons(body: unknown): RankedSeason[] {
    if (!Array.isArray(body)) return [];
    const out: RankedSeason[] = [];
    for (const row of body) {
        if (!row || typeof row !== "object") continue;
        const { class_name: id, name, intervals } = row as Record<string, unknown>;
        if (typeof id !== "string" || !id || !Array.isArray(intervals)) continue;
        let startS = Infinity;
        let endS = -Infinity;
        for (const iv of intervals) {
            if (!iv || typeof iv !== "object") continue;
            const { start_timestamp: s, end_timestamp: e } = iv as Record<string, unknown>;
            if (!isTime(s) || !isTime(e) || e <= s) continue;
            startS = Math.min(startS, s);
            endS = Math.max(endS, e);
        }
        if (!Number.isFinite(startS)) continue;
        out.push({ id, name: typeof name === "string" && name ? name : id, startS, endS });
    }
    return out;
}

/** `known` wins over `fromApi` by id; sorted by start. */
export function mergeSeasons(known: readonly RankedSeason[], fromApi: readonly RankedSeason[]): RankedSeason[] {
    const byId = new Map<string, RankedSeason>();
    for (const s of fromApi) if (!byId.has(s.id)) byId.set(s.id, s);
    for (const s of known) byId.set(s.id, s);
    return [...byId.values()].sort((a, b) => a.startS - b.startS);
}

/** The season running at `atS`: start inclusive, end exclusive. */
export function seasonAt(seasons: readonly RankedSeason[], atS: number): RankedSeason | null {
    return seasons.find((s) => s.startS <= atS && atS < s.endS) ?? null;
}
