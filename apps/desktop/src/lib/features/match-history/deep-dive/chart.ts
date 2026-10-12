import { allPlayers, type MatchDetail, type MatchPlayer } from "../detail";

export type Metric = "souls" | "playerDamage";

export interface LinePoint {
    t: number;
    v: number;
}

export interface ChartBox {
    width: number;
    height: number;
    padLeft: number;
    padRight: number;
    padTop: number;
    padBottom: number;
}

export interface ChartDomain {
    tMax: number;
    vMin: number;
    vMax: number;
}

/** Series values are cumulative, so the line starts from zero at the first sample's left. */
export function playerLine(player: MatchPlayer, metric: Metric): LinePoint[] {
    if (player.series.length === 0) return [];
    return [{ t: 0, v: 0 }, ...player.series.map((s) => ({ t: s.timeS, v: s[metric] }))];
}

/** Linear between samples, held at the last value after the final sample. */
export function valueAt(line: readonly LinePoint[], t: number): number {
    if (line.length === 0) return 0;
    if (t <= line[0].t) return line[0].v;
    for (let i = 1; i < line.length; i++) {
        const b = line[i];
        if (t <= b.t) {
            const a = line[i - 1];
            const span = b.t - a.t;
            return span <= 0 ? b.v : a.v + ((b.v - a.v) * (t - a.t)) / span;
        }
    }
    return line[line.length - 1].v;
}

/** Team 0 minus team 1 at every sample time any player has. */
export function teamLeadLine(detail: MatchDetail, metric: Metric): LinePoint[] {
    const lines = detail.teams.map((team) => team.players.map((p) => playerLine(p, metric)));
    const times = new Set<number>();
    for (const team of lines) for (const line of team) for (const p of line) times.add(p.t);
    if (times.size === 0) return [];
    const total = (team: LinePoint[][], t: number) => team.reduce((sum, line) => sum + valueAt(line, t), 0);
    return [...times].sort((a, b) => a - b).map((t) => ({ t, v: total(lines[0], t) - total(lines[1], t) }));
}

export function chartDomain(lines: ReadonlyArray<readonly LinePoint[]>): ChartDomain {
    let tMax = 0;
    let vMin = 0;
    let vMax = 0;
    for (const line of lines) {
        for (const p of line) {
            if (p.t > tMax) tMax = p.t;
            if (p.v < vMin) vMin = p.v;
            if (p.v > vMax) vMax = p.v;
        }
    }
    return { tMax: tMax > 0 ? tMax : 1, vMin, vMax: vMax > vMin ? vMax : vMin + 1 };
}

export function xOf(t: number, dom: ChartDomain, box: ChartBox): number {
    return box.padLeft + (t / dom.tMax) * (box.width - box.padLeft - box.padRight);
}

export function tOf(x: number, dom: ChartDomain, box: ChartBox): number {
    const span = box.width - box.padLeft - box.padRight;
    if (span <= 0) return 0;
    return Math.min(Math.max((x - box.padLeft) / span, 0), 1) * dom.tMax;
}

/** Index of the sample closest in time, so a readout never shows a value between two samples. */
export function nearestSample(line: readonly LinePoint[], t: number): number | null {
    if (line.length === 0) return null;
    let best = 0;
    for (let i = 1; i < line.length; i++) {
        if (Math.abs(line[i].t - t) < Math.abs(line[best].t - t)) best = i;
    }
    return best;
}

/** With no current sample, stepping forward enters at the first one and stepping back at the last. */
export function stepSample(index: number | null, delta: 1 | -1, length: number): number | null {
    if (length <= 0) return null;
    if (index === null) return delta > 0 ? 0 : length - 1;
    return Math.min(Math.max(index + delta, 0), length - 1);
}

export function rangeAt(lines: ReadonlyArray<readonly LinePoint[]>, t: number): { min: number; max: number } | null {
    const values = lines.filter((line) => line.length > 0).map((line) => valueAt(line, t));
    if (values.length === 0) return null;
    return { min: Math.min(...values), max: Math.max(...values) };
}

export interface Size {
    width: number;
    height: number;
}

/**
 * Top-left corner of a tooltip beside an anchor point, in the same px space as the chart area. It sits
 * `offset` to the right, flips to the left when the right side has no room, and stays inside the area.
 */
export function tipPlacement(
    anchor: { x: number; y: number },
    tip: Size,
    area: Size,
    offset: number,
): { left: number; top: number } {
    const right = anchor.x + offset;
    const side = right + tip.width <= area.width ? right : anchor.x - offset - tip.width;
    const clamp = (v: number, max: number) => Math.max(Math.min(v, max), 0);
    return {
        left: clamp(side, area.width - tip.width),
        top: clamp(anchor.y - tip.height / 2, area.height - tip.height),
    };
}

export interface TimeTick {
    t: number;
    x: number;
    align: "start" | "center" | "end";
}

const TICK_STEPS_S = [60, 120, 300, 600, 900, 1800, 3600];

function tickStep(minStepS: number): number {
    const listed = TICK_STEPS_S.find((s) => s >= minStepS);
    if (listed !== undefined) return listed;
    let step = TICK_STEPS_S[TICK_STEPS_S.length - 1] * 2;
    while (step < minStepS) step *= 2;
    return step;
}

/**
 * Time axis ticks in px for a plot `plot.width` wide. The 0:00 label is left-aligned at the plot's left edge
 * and the rest are centred on their tick, so the step leaves `gap` between any two labels. A tick whose
 * label the right edge would cut is dropped. The match end gets a right-aligned label only when it clears
 * the last tick's label.
 */
export function timeTicks(
    durationS: number,
    plot: { width: number; padLeft: number; padRight: number },
    labelWidth: number,
    gap: number,
): TimeTick[] {
    if (!(plot.width > 0)) return [];
    const ticks: TimeTick[] = [{ t: 0, x: plot.padLeft, align: "start" }];
    const span = plot.width - plot.padLeft - plot.padRight;
    if (!(durationS > 0) || span <= 0) return ticks;

    const pxPerS = span / durationS;
    const step = tickStep((labelWidth * 1.5 + gap) / pxPerS);
    let right = labelWidth;
    let last = 0;
    for (let t = step; t <= durationS; t += step) {
        const x = plot.padLeft + t * pxPerS;
        if (x + labelWidth / 2 > plot.width) break;
        ticks.push({ t, x, align: "center" });
        right = x + labelWidth / 2;
        last = t;
    }
    if (last < durationS && right + gap <= plot.width - labelWidth) {
        ticks.push({ t: durationS, x: plot.padLeft + span, align: "end" });
    }
    return ticks;
}

export function yOf(v: number, dom: ChartDomain, box: ChartBox): number {
    const h = box.height - box.padTop - box.padBottom;
    return box.padTop + ((dom.vMax - v) / (dom.vMax - dom.vMin)) * h;
}

/**
 * Top offset in px of the label for the domain's highest ("max") or lowest ("min") value, which sits at
 * the matching chart edge. When the zero line runs through that spot the label moves to the inner side
 * of the line if it names zero itself, and is dropped (null) otherwise, as there is no room beyond the line.
 */
export function edgeLabelTop(
    edge: "max" | "min",
    dom: ChartDomain,
    box: ChartBox,
    labelHeight: number,
    gap = 2,
): number | null {
    const zeroY = yOf(0, dom, box);
    const top = edge === "max" ? 0 : box.height - labelHeight;
    if (zeroY < top - gap || zeroY > top + labelHeight + gap) return top;
    const value = edge === "max" ? dom.vMax : dom.vMin;
    if (value !== 0) return null;
    return edge === "max" ? zeroY + gap : zeroY - gap - labelHeight;
}

export function linePath(line: readonly LinePoint[], dom: ChartDomain, box: ChartBox): string {
    return line
        .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t, dom, box).toFixed(1)} ${yOf(p.v, dom, box).toFixed(1)}`)
        .join(" ");
}

export function everyPlayerLine(detail: MatchDetail, metric: Metric): Map<number, LinePoint[]> {
    return new Map(allPlayers(detail).map((p) => [p.slot, playerLine(p, metric)]));
}
