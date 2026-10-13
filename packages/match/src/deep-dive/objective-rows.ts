import type { MatchObjective, MatchTeam } from "../detail";
import { laneForObjectiveSlot, objectiveLaneSlot, type Lane } from "./lanes";
import { objectiveNames, type ObjectiveKind } from "./names";

export interface ObjectiveRow {
    objectiveId: number;
    kind: ObjectiveKind;
    team: MatchTeam;
    lane?: Lane;
    /** Position among the lanes of this match, only when the lane's colour is unknown. */
    ordinal?: number;
    /** Which of several of the same kind, for shrines. */
    index?: number;
    destroyedS?: number;
    playerDamage: number;
    creepDamage: number;
    spiritDamage: number;
}

export function objectiveRows(objectives: readonly MatchObjective[]): ObjectiveRow[] {
    const names = objectiveNames(objectives);
    return objectives
        .map((o, i): ObjectiveRow => {
            const name = names[i];
            const lane = laneForObjectiveSlot(objectiveLaneSlot(o.objectiveId));
            return {
                objectiveId: o.objectiveId,
                kind: name.kind,
                team: o.team,
                lane,
                ordinal: lane ? undefined : name.lane,
                index: name.index,
                destroyedS: o.destroyedS,
                playerDamage: o.playerDamage,
                creepDamage: o.creepDamage,
                spiritDamage: o.spiritDamage,
            };
        })
        .sort((a, b) => (a.destroyedS ?? Infinity) - (b.destroyedS ?? Infinity));
}
