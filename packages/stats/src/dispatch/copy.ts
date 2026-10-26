/** One edition's seed: the same edition id reads differently for each account. */
export function copySeed(accountId: number, editionId: string): string {
    return `${accountId}:${editionId}`;
}

/** FNV-1a with a murmur-style finaliser: plain FNV leaves the low bits too even for `mod n` on short ids. */
export function variantHash(seed: string, slot: string): number {
    let h = 0x811c9dc5;
    const text = `${seed}|${slot}`;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
}

/**
 * A variant from 1 to `n`, never `avoid` when `n` > 1. The pick depends only on the seed and the slot name, so a
 * frozen keepsake reads the same every time it opens and two players rarely share a line.
 *
 * Locale keys are `<namespace>.<slot>_<n>` with `n` from 1; a counted slot adds `_one`/`_other` after `n`. Every
 * slot of one type holds the same number of variants, so callers pass a constant `n` instead of a table that could
 * drift from the catalog. Print copy lives under `dispatch.story.<story>.<kind>.*` and `dispatch.story.voice.<kind>.*`;
 * video copy keeps its own keys under `dispatch.video.<kind>.*` and shares only this picker.
 */
export function pickVariant(seed: string, slot: string, n: number, avoid?: number): number {
    const pick = (variantHash(seed, slot) % n) + 1;
    if (avoid === undefined || pick !== avoid || n < 2) return pick;
    const step = 1 + (variantHash(seed, `${slot}#avoid`) % (n - 1));
    return ((pick - 1 + step) % n) + 1;
}

/**
 * The pick for the last seed of a same-kind chain (oldest first), where each edition avoids the pick its
 * predecessor actually printed. Walking the whole chain is what makes "never the previous edition's line" exact.
 */
export function pickAlong(seeds: readonly string[], slot: string, n: number): number {
    let prev: number | undefined;
    for (const seed of seeds) prev = pickVariant(seed, slot, n, prev);
    return prev ?? 1;
}
