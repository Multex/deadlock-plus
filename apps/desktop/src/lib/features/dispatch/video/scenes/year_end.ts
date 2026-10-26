import type { Beat } from "../beats";
import { lerp } from "../kit/ease";
import { sceneFrame } from "../kit/frame";
import type { Ctx } from "../kit/types";
import type { Scene, SceneAssets, SceneSize } from "../scene";
import { placeholderScene } from "./placeholder";
import { AWARD_BEATS } from "./year_end/beats/award";
import * as credits from "./year_end/beats/credits";
import * as end from "./year_end/beats/end";
import * as preshow from "./year_end/beats/preshow";
import { curtain, spotlight, type Stage } from "./year_end/beats/stage";
import * as welcome from "./year_end/beats/welcome";
import { beatAt, cutAt, type CutState } from "./year_end/compose";
import { INK } from "./year_end/draw";
import { awardsPlan, type AwardId, type YearEndBeatId } from "./year_end/plan";

type BeatDraw = (ctx: Ctx, local: number, span: number, size: SceneSize, data: Stage, assets: SceneAssets) => void;

const DRAW: Record<YearEndBeatId, BeatDraw> = {
    y_preshow: preshow.draw,
    y_welcome: welcome.draw,
    ...(AWARD_BEATS as Record<AwardId, BeatDraw>),
    y_credits: credits.draw,
    y_end: end.draw,
};

const plans = new WeakMap<Stage, { bars: number; plan: Beat<YearEndBeatId>[] }>();

function planOf(stage: Stage, bars: number): Beat<YearEndBeatId>[] {
    let p = plans.get(stage);
    if (!p || p.bars !== bars) plans.set(stage, (p = { bars, plan: awardsPlan(bars, stage.awards.lineup) }));
    return p.plan;
}

const fallback = placeholderScene({ ground: INK.black, accent: INK.gold });

/** The Awards Night: each beat drawn on its own clock, joined on the bar lines by the house's own cuts. */
export const yearEndScene: Scene = (ctx, t, size, assets) => {
    const stage = assets.data as Stage | undefined;
    if (!stage?.awards) return fallback(ctx, t, size, assets);
    const B = assets.timing.barSeconds;
    const plan = planOf(stage, assets.timing.bars);
    const now = beatAt(plan, t, B);
    ctx.save();
    DRAW[now.id](ctx, now.local, now.span, size, stage, assets);
    ctx.restore();
    resetState(ctx);
    const cut = cutAt(plan, t, B);
    if (cut && cut.p > 0) drawCut(ctx, cut, size);
};

/** A beat may leave a composite mode, shadow or alpha behind; the cut paints over it from a clean slate. */
function resetState(ctx: Ctx): void {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.letterSpacing = "0px";
}

function drawCut(ctx: Ctx, cut: CutState, { w, h }: SceneSize): void {
    const { u, safe } = sceneFrame(w, h);
    if (cut.kind === "flash") {
        ctx.fillStyle = `rgb(255 248 228 / ${cut.p})`;
        ctx.fillRect(0, 0, w, h);
        return;
    }
    if (cut.kind === "curtain") {
        // Two velvet panels sweep in from the wings, swinging as they run, and meet on the bar line.
        const half = (w / 2) * cut.p + 30 * u * cut.p;
        const swing = (cut.closing ? 1 : -1) * 60 * u * Math.sin(cut.p * Math.PI);
        curtain(ctx, 0, 0, half, h, u, swing);
        curtain(ctx, w - half, 0, half, h, u, -swing);
        // A gold seam of light where the panels meet.
        if (cut.p > 0.85) {
            const k = (cut.p - 0.85) / 0.15;
            const g = ctx.createLinearGradient(w / 2 - 24 * u, 0, w / 2 + 24 * u, 0);
            g.addColorStop(0, "rgb(255 210 130 / 0)");
            g.addColorStop(0.5, `rgb(255 220 150 / ${0.45 * k})`);
            g.addColorStop(1, "rgb(255 210 130 / 0)");
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = g;
            ctx.fillRect(w / 2 - 24 * u, 0, 48 * u, h);
            ctx.restore();
        }
        // The pelmet hangs over both panels.
        const pelmet = 70 * u;
        ctx.fillStyle = "#1c0305";
        ctx.fillRect(0, 0, w, pelmet * cut.p);
        ctx.fillStyle = INK.goldDeep;
        ctx.fillRect(0, pelmet * cut.p - 6 * u, w, 6 * u * cut.p);
        return;
    }
    // The follow spot closes on the middle of the frame and opens again on the next beat.
    const cx = w / 2;
    const cy = h > w ? (safe.top + safe.bottom) / 2 : h / 2;
    const far = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.02;
    const r = lerp(far, 0, cut.p);
    ctx.save();
    ctx.fillStyle = "#030202";
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    if (r > 0.5) ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    if (r > 0.5) {
        const rim = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r);
        rim.addColorStop(0, "rgb(255 222 160 / 0)");
        rim.addColorStop(1, `rgb(255 222 160 / ${0.35 * Math.sin(cut.p * Math.PI)})`);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rim;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    if (cut.p > 0.9) spotlight(ctx, cx, cy, 90 * u, 90 * u, (cut.p - 0.9) * 10);
}
