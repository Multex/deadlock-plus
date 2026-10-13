import type { HistoryPoint } from "@deadlock-plus/ipc-types/HistoryPoint";
import type { MatchPingSeries } from "@deadlock-plus/ipc-types/MatchPingSeries";
import type { PingSummary } from "@deadlock-plus/ipc-types/PingSummary";
import type { LinePoint } from "./deep-dive/chart";
import type { MatchDetail } from "./detail";

export const MAX_PING_POINTS = 300;

export interface PingSource {
    summary(startMs: number, endMs: number): Promise<PingSummary | null>;
    points(startMs: number, endMs: number, maxPoints: number): Promise<HistoryPoint[]>;
    series(matchId: number, maxPoints: number): Promise<MatchPingSeries | null>;
}

export interface MatchPing {
    summary: PingSummary;
    /** Runs of consecutive direct pings, in seconds from the match start. A dropped sample ends a run. */
    segments: LinePoint[][];
    durationS: number;
    /** Where a per-match recording was measured; `null` for the time-window fallback. */
    source: MatchPingSeries["source"] | null;
    /** The recording began after the match had started. */
    partial: boolean;
}

export function matchWindowMs(detail: Pick<MatchDetail, "startTime" | "durationS">) {
    return { startMs: detail.startTime * 1000, endMs: (detail.startTime + detail.durationS) * 1000 };
}

export function pingSegments(points: readonly HistoryPoint[], startMs: number): LinePoint[][] {
    const segments: LinePoint[][] = [];
    let run: LinePoint[] | null = null;
    for (const p of points) {
        if (p.raw === null) {
            run = null;
            continue;
        }
        if (!run) {
            run = [];
            segments.push(run);
        }
        run.push({ t: (p.t - startMs) / 1000, v: p.raw });
    }
    return segments;
}

/** `null` when the series holds no direct ping. */
export function matchPingFromSeries(
    series: MatchPingSeries,
    detail: Pick<MatchDetail, "startTime" | "durationS">,
): MatchPing | null {
    const raws = series.points.flatMap((p) => (p.raw === null ? [] : [p.raw]));
    if (raws.length === 0) return null;
    const summary: PingSummary = {
        avg: raws.reduce((a, b) => a + b, 0) / raws.length,
        worst: Math.max(...raws),
        samples: raws.length,
    };
    const { startMs } = matchWindowMs(detail);
    return {
        summary,
        segments: pingSegments(series.points, startMs),
        durationS: detail.durationS,
        source: series.source,
        partial: series.partial,
    };
}

/** Prefers the per-match recording; `null` when neither it nor the log holds a direct ping in the window. */
export async function loadMatchPing(
    detail: Pick<MatchDetail, "matchId" | "startTime" | "durationS">,
    source: PingSource,
): Promise<MatchPing | null> {
    const series = await source.series(detail.matchId, MAX_PING_POINTS);
    const recorded = series ? matchPingFromSeries(series, detail) : null;
    if (recorded) return recorded;

    const { startMs, endMs } = matchWindowMs(detail);
    const [summary, points] = await Promise.all([
        source.summary(startMs, endMs),
        source.points(startMs, endMs, MAX_PING_POINTS),
    ]);
    if (!summary) return null;
    return {
        summary,
        segments: pingSegments(points, startMs),
        durationS: detail.durationS,
        source: null,
        partial: false,
    };
}
