import type { Beat } from "../../beats";
import { easeInOut } from "../../kit/ease";
import { lineId, type Stage } from "./beats/stage";
import type { CopyRef, YearEndAwards } from "./data";
import type { YearEndBeatId } from "./plan";

export interface BeatClock {
    id: YearEndBeatId;
    index: number;
    /** Seconds into the beat. */
    local: number;
    /** The beat's length in seconds. */
    span: number;
}

/** The beat playing at `t`; past the plan the end card holds on its last frame. */
export function beatAt(plan: readonly Beat<YearEndBeatId>[], t: number, barSeconds: number): BeatClock {
    let index = 0;
    for (let i = 0; i < plan.length; i++) if (t >= plan[i]!.bar * barSeconds - 1e-9) index = i;
    const b = plan[index]!;
    const span = b.bars * barSeconds;
    const local = Math.min(Math.max(0, t - b.bar * barSeconds), span - 1 / 60);
    return { id: b.id, index, local, span };
}

/**
 * How the show moves between beats: a flashbulb white-out on the drop into the welcome, then the house curtain and
 * a closing spotlight iris by turns, counted back from the end card so the night's last award always opens on the
 * curtain.
 */
export type Cut = "flash" | "curtain" | "iris";

export function cutInto(plan: readonly Beat<YearEndBeatId>[], index: number): Cut {
    if (plan[index]?.id === "y_welcome") return "flash";
    return (plan.length - 1 - index) % 2 === 0 ? "curtain" : "iris";
}

export interface CutState {
    kind: Cut;
    /** 0 is open (the beat in full view), 1 is closed on the bar line. */
    p: number;
    /** Still closing over the outgoing beat. */
    closing: boolean;
}

/** Seconds a cut takes to close before its bar line and to open after it, in beats (a quarter bar). */
const CLOSE: Record<Cut, number> = { flash: 0.5, curtain: 1, iris: 1 };
const OPEN: Record<Cut, number> = { flash: 1.5, curtain: 0.75, iris: 0.75 };

export function cutAt(plan: readonly Beat<YearEndBeatId>[], t: number, barSeconds: number): CutState | null {
    const beat = barSeconds / 4;
    for (let i = 1; i < plan.length; i++) {
        const kind = cutInto(plan, i);
        const at = plan[i]!.bar * barSeconds;
        const close = CLOSE[kind] * beat;
        const open = OPEN[kind] * beat;
        if (t >= at - close && t < at) return { kind, p: easeInOut((t - (at - close)) / close), closing: true };
        if (t >= at && t <= at + open) return { kind, p: 1 - easeInOut((t - at) / open), closing: false };
    }
    return null;
}

export interface Translate {
    t: (key: string, params?: Record<string, string>) => string;
    tn: (key: string, count: number, params?: Record<string, string>) => string;
}

/** Every line the night says, translated on the main thread for the worker, which has no i18n. */
export function stageOf(awards: YearEndAwards, { t, tn }: Translate): Stage {
    const refs: (CopyRef | null)[] = [
        awards.preshow.marquee,
        awards.preshow.hook,
        awards.welcome.line,
        ...awards.awards.flatMap((a) => [
            a.title,
            ...a.nominees.map((n) => n.line),
            a.ceremony.nominees,
            a.ceremony.envelope,
            a.ceremony.goesTo,
            a.accept,
        ]),
        awards.credits.title,
        ...awards.credits.rows.map((r) => r.text),
        awards.end.cta,
    ];
    const lines: Record<string, string> = {};
    for (const r of refs) {
        if (!r) continue;
        lines[lineId(r)] = r.count === undefined ? t(r.key, r.params) : tn(r.key, r.count, r.params);
    }
    return { awards, lines };
}
