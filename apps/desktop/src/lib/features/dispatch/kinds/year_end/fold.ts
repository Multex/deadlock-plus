import type { FoldFrame } from "./reveal";

export type Fold = "closed" | "unfolding" | "open" | "folding";
export type FoldAction = "unfold" | "fold";

/** The fold that `action` starts, or `null` when the copy is already headed that way. */
export function foldRequest(fold: Fold, action: FoldAction): Fold | null {
    if (action === "unfold") return fold === "closed" ? "unfolding" : null;
    return fold === "open" || fold === "unfolding" ? "folding" : null;
}

/**
 * `swallow`: Escape while the poster folds shut has nothing left to do, but the room must not take it as "back to
 * the table" either. Only the folded copy hands Escape to the room.
 */
export function foldKey(e: { key: string }, fold: Fold): FoldAction | "swallow" | null {
    switch (e.key) {
        case "Enter":
        case " ":
            return fold === "closed" ? "unfold" : null;
        case "Escape":
            if (fold === "closed") return null;
            return fold === "folding" ? "swallow" : "fold";
        default:
            return null;
    }
}

export const FOLD_MS = 1100;
/** The inside flap folds in first, then the cover swings back over it: the unfold played backwards. */
const LEFT: readonly [number, number] = [0, 0.55];
const RIGHT: readonly [number, number] = [0.4, 1];

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const progress = (k: number, [a, b]: readonly [number, number]) => clamp((k - a) / (b - a));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** `t` ms into folding up from wherever the flaps were (`from`). */
export function foldFrame(t: number, from: FoldFrame): FoldFrame {
    const k = clamp(t / FOLD_MS);
    return {
        right: from.right * (1 - easeInOut(progress(k, RIGHT))),
        left: from.left * (1 - easeInOut(progress(k, LEFT))),
        flash: 0,
        light: 1,
    };
}

/** What the live region says once a fold lands; `folded`: the user has folded it up at least once. */
export function foldAnnouncement(fold: Fold, folded: boolean): string | null {
    if (fold === "open") return "dispatch.year_end.unfolded";
    if (fold === "closed" && folded) return "dispatch.year_end.folded";
    return null;
}
