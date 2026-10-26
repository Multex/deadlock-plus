import type { Beat } from "../beats";
import { easeInOut } from "../kit/ease";
import type { Ctx } from "../kit/types";
import type { Scene, SceneAssets, SceneSize } from "../scene";
import { draw as cover } from "./monthly/beats/cover";
import { draw as end } from "./monthly/beats/end";
import { draw as feature } from "./monthly/beats/feature";
import { draw as flash } from "./monthly/beats/flash";
import { draw as interview } from "./monthly/beats/interview";
import { draw as shot } from "./monthly/beats/shot";
import { draw as stand } from "./monthly/beats/stand";
import type { BeatDraw, MonthlyDraw } from "./monthly/beats/studio";
import { draw as takes } from "./monthly/beats/takes";
import { draw as wardrobe } from "./monthly/beats/wardrobe";
import { monthlyPlan, type MonthlyBeatId } from "./monthly/plan";
import { placeholderScene } from "./placeholder";

const BEATS: Record<MonthlyBeatId, BeatDraw> = {
    m_flash: flash,
    m_takes: takes,
    m_shot: shot,
    m_wardrobe: wardrobe,
    m_interview: interview,
    m_feature: feature,
    m_cover: cover,
    m_stand: stand,
    m_end: end,
};

/** Beats that open on their own move (a flash, a slide, a drop); the rest are whipped in from the right. */
const OWN_ENTRANCE: ReadonlySet<string> = new Set(["m_flash", "m_takes", "m_shot", "m_cover", "m_stand", "m_end"]);
/** Seconds the whip pan between two beats takes, starting on the bar line. */
const WHIP = 0.24;

/** The beat playing at `t`: the first before the start, the last after the end. */
export function beatAt(
    plan: readonly Beat[],
    t: number,
    barSeconds: number,
): { beat: Beat; index: number; local: number; span: number } | null {
    if (plan.length === 0) return null;
    let index = 0;
    for (let i = 0; i < plan.length; i++) if (t >= plan[i]!.bar * barSeconds - 1e-9) index = i;
    const beat = plan[index]!;
    return { beat, index, local: t - beat.bar * barSeconds, span: beat.bars * barSeconds };
}

const plans = new WeakMap<SceneAssets, Beat<MonthlyBeatId>[]>();

function planOf(d: MonthlyDraw, assets: SceneAssets): Beat<MonthlyBeatId>[] {
    let p = plans.get(assets);
    if (!p) {
        p = monthlyPlan(d.video.cast, assets.timing.bars);
        plans.set(assets, p);
    }
    return p;
}

function paint(
    ctx: Ctx,
    beat: Beat,
    local: number,
    span: number,
    size: SceneSize,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    ctx.save();
    BEATS[beat.id as MonthlyBeatId](ctx, local, span, size, d, assets);
    ctx.restore();
}

const fallback = placeholderScene({ ground: "#1b3768", accent: "#ffd23f" });

/** The cover shoot: each beat drawn on its own clock, cut or whipped on the bar lines. */
export const monthlyScene: Scene = (ctx, t, size, assets) => {
    const d = assets.data as MonthlyDraw | undefined;
    if (!d?.video) return fallback(ctx, t, size, assets);
    const bar = assets.timing.barSeconds;
    const plan = planOf(d, assets);
    const at = beatAt(plan, t, bar);
    if (!at) return fallback(ctx, t, size, assets);
    const { beat, index, local, span } = at;
    const prev = plan[index - 1];
    if (!prev || OWN_ENTRANCE.has(beat.id) || local >= WHIP) {
        paint(ctx, beat, local, span, size, d, assets);
        return;
    }
    // A whip pan: the outgoing beat slides off left as the next one comes in from the right, with a streak at the seam.
    const p = easeInOut(local / WHIP);
    const seam = size.w * (1 - p);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, seam, size.h);
    ctx.clip();
    ctx.translate(-p * size.w, 0);
    paint(ctx, prev, prev.bars * bar + local, prev.bars * bar, size, d, assets);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(seam, 0, size.w - seam, size.h);
    ctx.clip();
    ctx.translate(seam, 0);
    paint(ctx, beat, local, span, size, d, assets);
    ctx.restore();
    const streak = ctx.createLinearGradient(seam - size.w * 0.12, 0, seam + size.w * 0.12, 0);
    streak.addColorStop(0, "rgb(255 255 255 / 0)");
    streak.addColorStop(0.5, `rgb(255 255 255 / ${0.35 * Math.sin(p * Math.PI)})`);
    streak.addColorStop(1, "rgb(255 255 255 / 0)");
    ctx.fillStyle = streak;
    ctx.fillRect(seam - size.w * 0.12, 0, size.w * 0.24, size.h);
};
