import type { MapItem } from "@deadlock-plus/ipc-types/MapItem";
import { CAMP_FIRST_SPAWN_S } from "./map-spawns";

export type CampKind = keyof typeof CAMP_FIRST_SPAWN_S;

/** From the game's spawn rules. Whether the interval runs from the clear or from the previous spawn is not known; the clear is assumed. */
export const CAMP_RESPAWN_S = {
    camp_weak: 85,
    camp_medium: 290,
    camp_strong: 335,
    camp_vault: 300,
} as const satisfies Record<CampKind, number>;

/**
 * World units, 2D. Players break a vault at melee range, so a wider vault radius only takes fights
 * from the camps next to it.
 */
export const CAMP_RADIUS_CAP = {
    camp_weak: 1000,
    camp_medium: 1000,
    camp_strong: 1000,
    camp_vault: 300,
} as const satisfies Record<CampKind, number>;
export const CAMP_NEIGHBOUR_FRACTION = 0.7;
/**
 * Camps closer than this share a spot, often on two floors. Paths carry no height, so such camps
 * cannot be told apart and do not shrink each other's radius.
 */
export const CAMP_STACK_DISTANCE = 600;
export const CAMP_MIN_FIGHT_S = 3;
export const CAMP_FIGHT_GAP_S = 4;

const NEUTRAL_COMBAT = 3;

export interface CampFightSample {
    /** Seconds from match start. */
    t: number;
    x: number;
    y: number;
    alive: boolean;
    combatType: number;
}

export interface CampFightPaths {
    intervalS: number;
    series: readonly { samples: readonly CampFightSample[] }[];
}

export interface CampDown {
    clearedS: number;
    respawnS: number;
}

interface Camp {
    index: number;
    kind: CampKind;
    x: number;
    y: number;
    radius: number;
    upFromS: number;
    fight: { lastS: number; samples: number } | null;
    downs: CampDown[];
}

const isCampKind = (kind: MapItem["kind"]): kind is CampKind => kind in CAMP_FIRST_SPAWN_S;

function campsOf(rows: readonly Pick<MapItem, "kind" | "x" | "y">[]): Camp[] {
    const camps = rows.flatMap((row, index): Camp[] =>
        isCampKind(row.kind)
            ? [
                  {
                      index,
                      kind: row.kind,
                      x: row.x,
                      y: row.y,
                      radius: 0,
                      upFromS: CAMP_FIRST_SPAWN_S[row.kind],
                      fight: null,
                      downs: [],
                  },
              ]
            : [],
    );
    for (const camp of camps) {
        let neighbour = Infinity;
        for (const other of camps) {
            if (other === camp) continue;
            const d = Math.hypot(camp.x - other.x, camp.y - other.y);
            if (d >= CAMP_STACK_DISTANCE && d < neighbour) neighbour = d;
        }
        camp.radius = Math.min(CAMP_RADIUS_CAP[camp.kind], neighbour * CAMP_NEIGHBOUR_FRACTION);
    }
    return camps;
}

/**
 * Estimates when each camp was cleared from where players fought neutrals; match data has no camp
 * kill event. The result is keyed by row index and holds every camp row, each with its down
 * intervals in time order. Only a camp's last interval can end after the match: a camp cleared late
 * is still down on the final frame.
 *
 * A fighting second goes to the nearest camp in range that is up; between equally near camps the
 * lower row wins. Two stacked camps that are both up are therefore a guess.
 */
export function campClears(
    rows: readonly Pick<MapItem, "kind" | "x" | "y">[],
    paths: CampFightPaths,
    durationS: number,
): Map<number, CampDown[]> {
    const camps = campsOf(rows);
    const fighting = paths.series
        .flatMap((s) => s.samples.filter((p) => p.alive && p.combatType === NEUTRAL_COMBAT && p.t <= durationS))
        .sort((a, b) => a.t - b.t);

    const close = (camp: Camp) => {
        const fight = camp.fight!;
        camp.fight = null;
        if (fight.samples * paths.intervalS < CAMP_MIN_FIGHT_S) return;
        camp.upFromS = fight.lastS + CAMP_RESPAWN_S[camp.kind];
        camp.downs.push({ clearedS: fight.lastS, respawnS: camp.upFromS });
    };

    for (const sample of fighting) {
        let target: Camp | null = null;
        let nearest = Infinity;
        for (const camp of camps) {
            if (camp.fight && sample.t - camp.fight.lastS > CAMP_FIGHT_GAP_S) close(camp);
            if (!camp.fight && sample.t < camp.upFromS) continue;
            const d = Math.hypot(sample.x - camp.x, sample.y - camp.y);
            if (d <= camp.radius && d < nearest) {
                nearest = d;
                target = camp;
            }
        }
        if (!target) continue;
        if (!target.fight) target.fight = { lastS: sample.t, samples: 1 };
        else if (sample.t > target.fight.lastS) {
            target.fight.lastS = sample.t;
            target.fight.samples++;
        }
    }
    for (const camp of camps) if (camp.fight) close(camp);

    return new Map(camps.map((camp) => [camp.index, camp.downs]));
}

export function campDownAt(intervals: readonly CampDown[] | undefined, time: number): boolean {
    return intervals?.some((d) => time >= d.clearedS && time < d.respawnS) ?? false;
}
