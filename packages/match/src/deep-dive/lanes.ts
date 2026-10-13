export type LaneColor = "yellow" | "blue" | "green";

export interface Lane {
    /** The id players carry as their assigned lane. */
    id: number;
    color: LaneColor;
    hex: string;
}

/** Ids and colours are the game's lane table (`lane_info`); every other id there is "Unused". */
const LANES: readonly Lane[] = [
    { id: 1, color: "yellow", hex: "#F1CC30" },
    { id: 4, color: "blue", hex: "#29B1CC" },
    { id: 6, color: "green", hex: "#59B247" },
];

/**
 * Objectives number their lanes 1 to 4 and a match uses slots 1, 3 and 4, which are not the ids players
 * carry. Matched by position: slot 1 sits on the yellow lane's side of the map, 3 on the blue lane's
 * middle line and 4 on the green lane's side, the same lanes the players' death positions fall on.
 */
const LANE_ID_BY_SLOT: Readonly<Record<number, number>> = { 1: 1, 3: 4, 4: 6 };

export function laneForPlayerLane(id: number | undefined): Lane | undefined {
    return id === undefined ? undefined : LANES.find((l) => l.id === id);
}

export function laneForObjectiveSlot(slot: number | undefined): Lane | undefined {
    return slot === undefined ? undefined : laneForPlayerLane(LANE_ID_BY_SLOT[slot]);
}

/** `ECitadelTeamObjective`: 1-4 tier 1 guardians, 5-8 walkers, 12-15 base guardians. */
export function objectiveLaneSlot(objectiveId: number): number | undefined {
    if (objectiveId >= 1 && objectiveId <= 4) return objectiveId;
    if (objectiveId >= 5 && objectiveId <= 8) return objectiveId - 4;
    if (objectiveId >= 12 && objectiveId <= 15) return objectiveId - 11;
    return undefined;
}
