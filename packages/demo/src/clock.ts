/**
 * Makes "now" start at `target` and run on from there, so relative labels ("2 hours ago", countdowns) match the
 * scenario's data whenever it runs. Time still passes, because pollers and animations measure elapsed time.
 * Returns the function that gives the real clock back.
 */
export function shiftClock(target: number): () => void {
    const Real = Date;
    const offset = target - Real.now();

    class Shifted extends Real {
        constructor(...args: unknown[]) {
            super(...((args.length === 0 ? [Real.now() + offset] : args) as [number]));
        }

        static override now(): number {
            return Real.now() + offset;
        }
    }

    globalThis.Date = Shifted as DateConstructor;
    return () => {
        globalThis.Date = Real;
    };
}
