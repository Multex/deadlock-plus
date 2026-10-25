/** The street outside the window follows the viewer's own clock. */

/** Share of office lights on through a day, by hour; read as a loop, interpolated between hours. */
const LIT: [hour: number, share: number][] = [
    [0, 0.42],
    [3, 0.16],
    [4.5, 0.12],
    [6.5, 0.38],
    [9, 0.6],
    [17, 0.7],
    [19, 0.88],
    [21, 0.75],
    [24, 0.42],
];

/**
 * Top of the sky and its horizon, by hour, graded teal like the show's street at every hour: near black in the
 * small hours, lifting a little by day.
 */
const SKY: [hour: number, top: string, horizon: string][] = [
    [0, "#000a0b", "#011d1d"],
    [3, "#00080a", "#011414"],
    [5, "#010c0e", "#021b1c"],
    [7, "#03171b", "#07282a"],
    [9, "#05202a", "#0c3336"],
    [17, "#05202a", "#0c3336"],
    [19, "#031519", "#082a2b"],
    [21.5, "#010e10", "#022121"],
    [24, "#000a0b", "#011d1d"],
];

function hourOf(date: Date): number {
    return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function around<T extends [number, ...unknown[]]>(table: T[], hour: number): [T, T, number] {
    const i = table.findIndex(([h]) => h > hour);
    const next = table[Math.max(1, i)]!;
    const prev = table[Math.max(0, i - 1)]!;
    return [prev, next, (hour - prev[0]) / (next[0] - prev[0] || 1)];
}

export function litShare(date: Date): number {
    const [[, a], [, b], t] = around(LIT, hourOf(date));
    return lerp(a, b, t);
}

function mix(a: string, b: string, t: number): string {
    const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return `#${[0, 1, 2]
        .map((i) =>
            Math.round(lerp(channel(a, i), channel(b, i), t))
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`;
}

export function sky(date: Date): { top: string; horizon: string } {
    const [[, topA, horizonA], [, topB, horizonB], t] = around(SKY, hourOf(date));
    return { top: mix(topA, topB, t), horizon: mix(horizonA, horizonB, t) };
}
