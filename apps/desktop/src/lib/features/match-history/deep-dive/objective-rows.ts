import type { ObjectiveKind } from "@deadlock-plus/match/deep-dive/names";

const NAME_KEYS: Record<ObjectiveKind, string> = {
    core: "match_history.deep_dive.objectives.kind_core",
    guardian: "match_history.deep_dive.objectives.kind_guardian",
    walker: "match_history.deep_dive.objectives.kind_walker",
    patron: "match_history.deep_dive.objectives.kind_patron",
    shrine: "match_history.deep_dive.objectives.kind_shrine",
    base_guardian: "match_history.deep_dive.objectives.kind_base_guardian",
    unknown: "match_history.deep_dive.objectives.kind_unknown",
};

export function objectiveNameKey(kind: ObjectiveKind): string {
    return NAME_KEYS[kind];
}
