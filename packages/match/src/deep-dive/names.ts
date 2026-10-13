export type ObjectiveKind = "core" | "guardian" | "walker" | "patron" | "shrine" | "base_guardian" | "unknown";

export interface ObjectiveName {
    kind: ObjectiveKind;
    /** 1-based position among the lanes this match has. */
    lane?: number;
    /** Which of several of the same kind, for shrines. */
    index?: number;
}

interface Slot {
    kind: ObjectiveKind;
    /** Lane or generator number from the enum, 1-based. */
    n?: number;
}

/** `ECitadelTeamObjective`: 0 core, 1-4 tier 1, 5-8 tier 2, 9 titan, 10-11 shield generators, 12-15 barrack bosses. */
function slotOf(id: number): Slot {
    if (id === 0) return { kind: "core" };
    if (id >= 1 && id <= 4) return { kind: "guardian", n: id };
    if (id >= 5 && id <= 8) return { kind: "walker", n: id - 4 };
    if (id === 9) return { kind: "patron" };
    if (id === 10 || id === 11) return { kind: "shrine", n: id - 9 };
    if (id >= 12 && id <= 15) return { kind: "base_guardian", n: id - 11 };
    return { kind: "unknown" };
}

const LANE_KINDS: ReadonlySet<ObjectiveKind> = new Set(["guardian", "walker", "base_guardian"]);

/**
 * One name per objective, in order. The enum has four lane slots but a match uses three of them
 * (a real match reports 1, 3 and 4), so lanes are numbered by the slots present across the match.
 */
export function objectiveNames(objectives: readonly { objectiveId: number }[]): ObjectiveName[] {
    const slots = objectives.map((o) => slotOf(o.objectiveId));
    const lanes = [...new Set(slots.filter((s) => LANE_KINDS.has(s.kind)).map((s) => s.n as number))].sort(
        (a, b) => a - b,
    );
    return slots.map((s) => {
        if (LANE_KINDS.has(s.kind)) return { kind: s.kind, lane: lanes.indexOf(s.n as number) + 1 };
        if (s.kind === "shrine") return { kind: s.kind, index: s.n };
        return { kind: s.kind };
    });
}

const CLASS_PREFIXES = ["citadel_ability_", "citadel_weapon_", "ability_", "upgrade_", "citadel_"];

/** Readable stand-in for an entry the game lists but has no display name for. */
export function humaniseClassName(className: string): string {
    const prefix = CLASS_PREFIXES.find((p) => className.startsWith(p));
    const rest = prefix ? className.slice(prefix.length) : className;
    return rest
        .split("_")
        .filter((w) => w.length > 0)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ");
}
