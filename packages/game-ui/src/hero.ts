import type { PopularityPhase } from "./item-tooltip/model";

/** Keyed by the game's stat enum (`ETechPower`, `ELevelUpBoons`). */
export type HeroStats = Partial<Record<string, number>>;

/** One ALT "See Details" row: a hero value before and after buying the item. */
export type StatChange = {
    /** The game's stat enum, or `ability:<id>:<property>` for an ability value. */
    key: string;
    label: string;
    before: number;
    after: number;
    /** Decimals the game shows for this value (bullet damage 1, melee 0). */
    decimals: number;
    postfix: string | null;
};

/**
 * What a group's icon stands for. The game draws an ability's icon in a light disc, an owned item's art faded with
 * no disc, and a stat icon bare.
 */
export type StatGroupKind = "ability" | "item" | "stat";

/** A group of rows under one icon. */
export type StatGroup = {
    kind: StatGroupKind;
    icon: string | null;
    /** An imbued ability, which the game backs in the spirit colour. */
    imbued?: boolean;
    changes: readonly StatChange[];
};

export type PhaseStat = { phase: PopularityPhase; pickPercent: number; winPercent: number };

export type ItemDetails = {
    groups: readonly StatGroup[];
    /** The item's own condition text ("within Range"); the game repeats it under every row. */
    condition: string | null;
    phases: readonly PhaseStat[];
};
