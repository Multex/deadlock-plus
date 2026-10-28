const BINS = 36;
/** Below this chroma (0-1) a pixel is grey and votes for no hue. The art is dark, so a faint tint still counts. */
const MIN_CHROMA = 0.03;
/** The share of opaque pixels the winning hue needs; below it the art has no colour of its own. */
const MIN_SHARE = 0.02;

/**
 * The colour a backdrop reads as: the hue its vivid pixels share most, weighted by chroma squared so a bright
 * burst outvotes a larger muddy area, and returned as those pixels' own mean colour. Transparent pixels (where the
 * hero stands) are skipped. Null when the art is grey or its only colour is a speck.
 */
export function dominantColour(rgba: ArrayLike<number>): string | null {
    const votes = new Float64Array(BINS);
    const counts = new Uint32Array(BINS);
    const sums = new Float64Array(BINS * 3);
    let opaque = 0;
    for (let i = 0; i + 3 < rgba.length; i += 4) {
        if (rgba[i + 3]! < 128) continue;
        opaque++;
        const r = rgba[i]!;
        const g = rgba[i + 1]!;
        const b = rgba[i + 2]!;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const chroma = (max - min) / 255;
        if (chroma < MIN_CHROMA) continue;
        const d = max - min;
        const sector = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        const bin = Math.floor((sector / 6) * BINS) % BINS;
        const w = chroma * chroma;
        votes[bin]! += w;
        counts[bin]!++;
        sums[bin * 3]! += r * w;
        sums[bin * 3 + 1]! += g * w;
        sums[bin * 3 + 2]! += b * w;
    }
    if (opaque === 0) return null;

    const near = (bin: number) => [(bin + BINS - 1) % BINS, bin, (bin + 1) % BINS];
    let best = 0;
    let bestVote = -1;
    for (let bin = 0; bin < BINS; bin++) {
        const vote = near(bin).reduce((sum, k) => sum + votes[k]!, 0);
        if (vote > bestVote) [best, bestVote] = [bin, vote];
    }
    if (near(best).reduce((sum, k) => sum + counts[k]!, 0) / opaque < MIN_SHARE) return null;

    const rgb = [0, 1, 2].map((c) => near(best).reduce((sum, k) => sum + sums[k * 3 + c]!, 0) / bestVote);
    return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}
