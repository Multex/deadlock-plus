import type { Beat } from "../beats";
import { easeInOut } from "../kit/ease";
import type { Ctx } from "../kit/types";
import type { Scene, SceneAssets, SceneSize } from "../scene";
import { draw as cover } from "./monthly/beats/cover";
import { draw as end } from "./monthly/beats/end";
import { draw as feature, PAGED } from "./monthly/beats/feature";
import { spreadLayout, turnPage } from "./monthly/beats/print";
import { draw as flash } from "./monthly/beats/flash";
import { draw as interview } from "./monthly/beats/interview";
import { draw as shot } from "./monthly/beats/shot";
import { draw as stand } from "./monthly/beats/stand";
import { stage, type BeatDraw, type MonthlyDraw } from "./monthly/beats/studio";
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

/** Beats the reader turns a page to reach; the rest open on their own move (a flash, a slide, a drop). */
const TURNED: ReadonlySet<string> = new Set(["m_feature", "m_wardrobe", "m_interview"]);
/** Seconds a page takes to turn, from the bar line. */
const TURN = 0.5;

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

let buffers: { w: number; h: number; a: OffscreenCanvas; b: OffscreenCanvas } | null = null;

/** Two frame-sized canvases for a page turn; null where there is no OffscreenCanvas. */
function frameBuffers(size: SceneSize): { a: Ctx; b: Ctx; ca: OffscreenCanvas; cb: OffscreenCanvas } | null {
    if (typeof OffscreenCanvas === "undefined") return null;
    if (!buffers || buffers.w !== size.w || buffers.h !== size.h)
        buffers = {
            w: size.w,
            h: size.h,
            a: new OffscreenCanvas(size.w, size.h),
            b: new OffscreenCanvas(size.w, size.h),
        };
    const a = buffers.a.getContext("2d");
    const b = buffers.b.getContext("2d");
    if (!a || !b) return null;
    for (const c of [a, b]) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, size.w, size.h);
    }
    return { a, b, ca: buffers.a, cb: buffers.b };
}

/** The cover shoot: each beat drawn on its own clock; inside the issue the reader turns the pages between them. */
export const monthlyScene: Scene = (ctx, t, size, assets) => {
    const d = assets.data as MonthlyDraw | undefined;
    if (!d?.video) return fallback(ctx, t, size, assets);
    const bar = assets.timing.barSeconds;
    const plan = planOf(d, assets);
    const at = beatAt(plan, t, bar);
    if (!at) return fallback(ctx, t, size, assets);
    const { beat, index, local, span } = at;
    const prev = plan[index - 1];
    const bufs = prev && TURNED.has(beat.id) && local < TURN ? frameBuffers(size) : null;
    if (!prev || !bufs) {
        paint(ctx, beat, local, span, size, d, assets);
        return;
    }
    // The outgoing page is the sheet that turns; a spread turns its right-hand page, anything else the whole frame.
    paint(bufs.a, prev, prev.bars * bar - 1e-3, prev.bars * bar, size, d, assets);
    paint(bufs.b, beat, local, span, size, d, assets);
    const k = easeInOut(local / TURN);
    ctx.drawImage(bufs.cb, 0, 0);
    if (PAGED.has(prev.id)) {
        const sp = spreadLayout(stage(size));
        const back = Math.max(0, -Math.cos(Math.PI * k)) * sp.left.w;
        const keep = { ...sp.left, w: sp.left.w - back };
        if (keep.w > 0) ctx.drawImage(bufs.ca, keep.x, keep.y, keep.w, keep.h, keep.x, keep.y, keep.w, keep.h);
        turnPage(ctx, k, bufs.ca, sp.right, bufs.cb, sp.left);
    } else turnPage(ctx, k, bufs.ca, { x: 0, y: 0, w: size.w, h: size.h }, null, null);
};
