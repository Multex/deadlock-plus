/** Below this share on screen a preview is passing by, not being looked at. */
const IN_VIEW = 0.35;

/**
 * Which preview runs its effects: the one most in view, keeping the running one on a tie so two equally visible
 * previews do not trade places. Null while none is far enough in view.
 */
export function pickLive(ratios: ReadonlyMap<string, number>, current: string | null): string | null {
    let best: string | null = null;
    let bestRatio = 0;
    for (const [id, ratio] of ratios) {
        if (ratio < IN_VIEW) continue;
        if (ratio > bestRatio || (ratio === bestRatio && id === current)) {
            best = id;
            bestRatio = ratio;
        }
    }
    return best;
}
