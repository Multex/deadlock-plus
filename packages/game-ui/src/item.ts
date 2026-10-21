export type ItemSlot = "weapon" | "vitality" | "spirit";

/** What every game-ui item view needs; the host maps its own catalog onto it. */
export type GameItem = {
    id: number;
    name: string;
    slot: ItemSlot;
    tier: 1 | 2 | 3 | 4 | 5;
    /** Souls. */
    cost: number;
    /** Item art url; undefined draws the name-only fallback. */
    art?: string;
    active: boolean;
    imbue: boolean;
};
