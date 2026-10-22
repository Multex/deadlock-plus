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

/** A group of rows under one icon (a stat icon, or an ability's icon for ability values). */
export type StatGroup = { icon: string | null; changes: readonly StatChange[] };

export type PhaseStat = { phase: PopularityPhase; pickPercent: number; winPercent: number };

export type ItemDetails = {
    groups: readonly StatGroup[];
    /** The item's own condition text ("within Range"); the game repeats it under every row. */
    condition: string | null;
    phases: readonly PhaseStat[];
};
