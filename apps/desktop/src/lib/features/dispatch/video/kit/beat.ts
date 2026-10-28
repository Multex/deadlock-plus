const FLASH_RAMP = 0.06;
const FLASH_DECAY = 0.17;

/** A flashbulb: a short ramp up to white on the hit, then an exponential fade. */
export function flashAt(t: number, at: number): number {
    const since = t - at;
    if (since < -FLASH_RAMP) return 0;
    if (since < 0) return (since + FLASH_RAMP) / FLASH_RAMP;
    const v = Math.exp(-since / FLASH_DECAY);
    return v < 0.04 ? 0 : v;
}

/** Seconds since the last of `every`-second ticks from `from`; Infinity before the first. */
export function sinceTick(t: number, from: number, every: number): number {
    if (t < from) return Infinity;
    return (t - from) % every;
}

export interface EntrancePace {
    /** Entrances and their count-ups finish within this share of the span; the rest holds the page to read. */
    share: number;
    /** Beats each entrance's count-up runs. */
    countBeats: number;
    /** The most beats two entrances land apart. */
    apartBeats: number;
}

/**
 * When each of `n` entrances lands, in seconds: the first on the downbeat at `start`, the rest evenly apart, at
 * most `apartBeats`, with the last one's count-up done by `share` of `span`.
 */
export function entranceCues(n: number, start: number, span: number, beat: number, pace: EntrancePace): number[] {
    const room = span * pace.share - pace.countBeats * beat;
    const step = n > 1 ? Math.min(pace.apartBeats * beat, room / (n - 1)) : 0;
    return Array.from({ length: n }, (_, i) => start + i * step);
}
