export type VisualKind = "item" | "ability" | "unknown";

export interface IdVisual {
    name: string;
    src?: string;
    /** What the game files this id as; `unknown` when the id is not a shop item or ability (or not listed). */
    kind: VisualKind;
}

/**
 * Shop items are `upgrade_*` and hero abilities are `ability_*` / `citadel_ability_*`; the class
 * name wins because the game files some abilities (a chess piece move, a familiar's gun) as weapons
 * and the snapshot files some shop items as weapons. Everything else follows the catalog kind.
 */
export function visualKind(className: string, kind: string): VisualKind {
    if (className.startsWith("upgrade_")) return "item";
    if (className.startsWith("ability_") || className.startsWith("citadel_ability_")) return "ability";
    if (kind === "ability") return "ability";
    if (kind === "upgrade") return "item";
    return "unknown";
}
