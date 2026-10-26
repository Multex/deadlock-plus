import { flashAt } from "../../../kit/beat";
import { feathered } from "../../../kit/bitmap";
import { clamp01, easeInOut, easeOutBack, easeOutCubic } from "../../../kit/ease";
import { shake } from "../../../kit/motion";
import { seeded } from "../../../kit/rng";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Ctx, Rect } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import {
    BODY_PX,
    drawBlock,
    fitBlock,
    flashOverlay,
    formatNumber,
    grain,
    HEADLINE_PX,
    image,
    imageKeys,
    mix,
    say,
    stage,
    studioSet,
    withCamera,
    type Block,
    type MonthlyDraw,
    type Stage,
} from "./studio";

const INK = "#16130f";
/** The whip out to the next beat, in seconds before the end. */
const EXIT = 0.2;

export interface FlashLayout {
    board: Rect;
    hook: Rect;
    /** Where the ghost of the match count stands. */
    ghost: { x: number; y: number; px: number };
    /** The talent: the month's top hero, standing on the set. */
    talent: Rect;
}

/** The slate on top and the hook under it, centred in the safe band; on 16:9 both hold the left half. */
export function flashLayout(st: Stage, hookH: number): FlashLayout {
    const { u, m, w, h, safe } = st;
    if (st.aspect === "wide") {
        const colW = w * 0.5 - m;
        const boardH = 250 * u;
        const total = boardH + 50 * u + hookH;
        const top = (h - total) / 2;
        return {
            board: { x: m, y: top, w: colW, h: boardH },
            hook: { x: m, y: top + boardH + 50 * u, w: colW, h: hookH },
            ghost: { x: w * 0.8, y: h * 0.42, px: 640 * u },
            talent: { x: w * 0.5, y: h * 0.06, w: (h * 1.0 * 280) / 380, h: h * 1.0 },
        };
    }
    const boardH = 280 * u;
    const total = boardH + 60 * u + hookH;
    const top = safe.top + Math.max(20 * u, (safe.bottom - safe.top - total) * 0.42);
    return {
        board: { x: m, y: top, w: w - 2 * m, h: boardH },
        hook: { x: m, y: top + boardH + 60 * u, w: w - 2 * m, h: hookH },
        ghost: { x: w * 0.3, y: Math.min(h * 0.86, top + total + 300 * u), px: (st.aspect === "tall" ? 760 : 620) * u },
        talent: talentRect(st, top + total),
    };
}

function talentRect(st: Stage, textBottom: number): Rect {
    const { w, h, u } = st;
    const tall = st.aspect === "tall";
    const tw = (tall ? 820 : 640) * u;
    const th = (tw * 380) / 280;
    const y = Math.max(textBottom + (tall ? 10 * u : -th * 0.25), h - th + (tall ? 40 : 30) * u);
    return { x: w - tw + (tall ? 120 : 90) * u, y, w: tw, h: th };
}

/** A clapperboard: striped clap sticks over a black slate, chalk text on it. */
function clapper(ctx: Ctx, st: Stage, r: Rect, text: Block, style: Omit<TextStyle, "px">, open: number): void {
    const u = st.u;
    const stick = 64 * u;
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.5)";
    ctx.shadowBlur = 30 * u;
    ctx.shadowOffsetY = 14 * u;
    ctx.fillStyle = "#121212";
    ctx.beginPath();
    ctx.roundRect(r.x, r.y + stick, r.w, r.h - stick, 10 * u);
    ctx.fill();
    ctx.restore();

    const stripes = (y: number) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, y, r.w, stick * 0.92);
        ctx.clip();
        ctx.fillStyle = "#f1eee6";
        ctx.fillRect(r.x, y, r.w, stick);
        ctx.fillStyle = "#121212";
        const sw = stick * 1.1;
        for (let x = r.x - stick; x < r.x + r.w + stick; x += sw * 2) {
            ctx.beginPath();
            ctx.moveTo(x, y + stick);
            ctx.lineTo(x + sw, y + stick);
            ctx.lineTo(x + sw + stick * 0.8, y);
            ctx.lineTo(x + stick * 0.8, y);
            ctx.fill();
        }
        ctx.restore();
    };
    ctx.save();
    ctx.translate(r.x, r.y + stick);
    ctx.rotate(-open * 0.32);
    ctx.translate(-r.x, -(r.y + stick));
    stripes(r.y + stick * 0.06);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgb(241 238 230 / 0.55)";
    ctx.lineWidth = 3 * u;
    const inner = r.y + stick + 22 * u;
    ctx.beginPath();
    ctx.moveTo(r.x + 24 * u, inner + text.height + 18 * u);
    ctx.lineTo(r.x + r.w - 24 * u, inner + text.height + 18 * u);
    ctx.stroke();
    ctx.restore();
    drawBlock(ctx, text, r.x + 28 * u, inner, style);
}

/** The photographer firing on every other beat after the clap, until the whip out. */
export function flashPops(beat: number, until: number): number[] {
    const out: number[] = [];
    for (let t = beat * 3; t < until - 0.05; t += beat * 2) out.push(t);
    return out;
}

/** The talent's pose after `n` pops: a new stance on each flash, settling as it holds. */
function posed(n: number, since: number): { dx: number; rot: number; zoom: number } {
    if (n === 0) return { dx: 0, rot: 0, zoom: 1 };
    const rng = seeded(4409 + n * 7919);
    const settle = 1 - 0.25 * Math.exp(-since * 6);
    return { dx: (rng() - 0.5) * 90 * settle, rot: (rng() - 0.5) * 0.09, zoom: 1 + rng() * 0.07 };
}

/** A soft beam of key light raking across the set. */
function lightSweep(ctx: Ctx, st: Stage, local: number, glow: string): void {
    const x = (((local * 0.32) % 1.5) - 0.25) * st.w;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const g = ctx.createLinearGradient(x - st.w * 0.3, 0, x + st.w * 0.3, st.h * 0.4);
    g.addColorStop(0, mix(glow, glow, 0, 0));
    g.addColorStop(0.5, mix(glow, "#ffffff", 0.5, 0.22));
    g.addColorStop(1, mix(glow, glow, 0, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, st.w, st.h);
    ctx.restore();
}

export function draw(
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const data = d.video.beats.m_flash;
    const st = stage(size);
    const u = st.u;
    const fonts = assets.fonts;
    const f = flashAt(local, 0);
    const exit = easeInOut((local - (span - EXIT)) / EXIT);

    const hookStyle = { family: fonts.display, weight: 700, fill: d.palette.fg };
    const hookText = say(d, data.hook);
    const colW = st.aspect === "wide" ? st.w * 0.5 - st.m : st.w - 2 * st.m;
    const hook = fitBlock(
        ctx,
        hookText,
        hookStyle,
        {
            px: (st.aspect === "tall" ? 140 : 128) * u,
            floor: HEADLINE_PX * u,
            maxW: colW,
            maxLines: 3,
        },
        1.02,
    );
    const lay = flashLayout(st, hook.height);
    const slateStyle = { family: fonts.pulp, weight: 700, fill: "#f1eee6" };
    const slate = fitBlock(ctx, say(d, data.slate), slateStyle, {
        px: 60 * u,
        floor: BODY_PX * u,
        maxW: lay.board.w - 56 * u,
        maxLines: 2,
    });
    const boardH = Math.max(lay.board.h, 64 * u + 22 * u + slate.height + 40 * u);
    const board = { ...lay.board, h: boardH };

    const beat = assets.timing.barSeconds / 4;
    const pops = flashPops(beat, span - EXIT);
    const popped = pops.filter((p) => p <= local);
    const pop = Math.max(0, ...pops.map((p) => flashAt(local, p)));
    const pose = posed(popped.length, local - (popped[popped.length - 1] ?? 0));

    const cam = {
        ox: st.w / 2,
        oy: st.h * 0.45,
        zoom: 1 + 0.08 * easeInOut(local / span),
        dx: Math.sin(local * 0.9) * 14 * u,
        dy: -exit * st.h * 1.1,
    };
    withCamera(ctx, { ...cam, zoom: 1 + 0.035 * (local / span), dx: cam.dx * 0.4 }, () =>
        studioSet(ctx, st, d.palette, {
            backdrop: image(assets, imageKeys.backdrop),
            light: 0.6 + 0.4 * Math.max(f, pop, 1 - clamp01(local / 0.8)) + 0.05 * Math.sin(local * 23) * (1 - pop),
            drift: local / span,
        }),
    );
    lightSweep(ctx, st, local, d.palette.glow);

    const count = formatNumber(d, data.matches.value);
    withCamera(ctx, { ...cam, dx: cam.dx * 0.6, dy: cam.dy * 0.7 - (local / span) * 90 * u }, () => {
        ctx.save();
        setFont(ctx, { family: fonts.display, weight: 700, px: lay.ghost.px } as TextStyle, lay.ghost.px);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.strokeStyle = mix(d.palette.accent, d.palette.accent, 0, 0.32 + 0.3 * pop);
        ctx.lineWidth = 5 * u;
        ctx.strokeText(count, lay.ghost.x, lay.ghost.y);
        ctx.fillStyle = mix(d.palette.glow, d.palette.glow, 0, 0.12);
        ctx.fillText(count, lay.ghost.x, lay.ghost.y);
        ctx.restore();
    });

    const star =
        data.heroId === null
            ? undefined
            : (image(assets, imageKeys.gloat(data.heroId)) ?? image(assets, imageKeys.hero(data.heroId)));
    if (star) {
        const r = lay.talent;
        const rise = easeOutCubic(clamp01(local / 0.9));
        const breathe = 1 + 0.015 * Math.sin(local * 3.1);
        withCamera(
            ctx,
            {
                ox: r.x + r.w / 2,
                oy: r.y + r.h,
                zoom: (1 + 0.06 * (local / span)) * pose.zoom * breathe,
                dx: cam.dx * 1.4 + pose.dx * u,
                dy: cam.dy * 0.85 + (1 - rise) * 60 * u,
                rot: pose.rot,
            },
            () => {
                ctx.save();
                ctx.shadowColor = "rgb(0 0 0 / 0.6)";
                ctx.shadowBlur = 70 * u;
                ctx.shadowOffsetX = -30 * u;
                ctx.drawImage(feathered(star), r.x, r.y, r.w, r.h);
                // The flash catches the talent: a rim of light on every pop.
                if (pop > 0) {
                    ctx.globalCompositeOperation = "lighter";
                    ctx.globalAlpha = pop * 0.35;
                    ctx.shadowColor = "transparent";
                    ctx.drawImage(feathered(star), r.x, r.y, r.w, r.h);
                }
                ctx.restore();
            },
        );
    }

    // The clapper comes down open and claps shut on the second beat.
    const clapAt = beat;
    const open = local < clapAt ? 1 - easeOutCubic(local / clapAt) ** 6 : 0;
    const [sx, sy] = shake(local - clapAt, 12 * u * clamp01(1 - (local - clapAt) / 0.3), 3);
    const drop = easeOutBack(clamp01(local / 0.35));
    withCamera(
        ctx,
        { ...cam, dx: cam.dx * 0.5 + sx, dy: cam.dy + sy - (1 - drop) * 40 * u, rot: Math.sin(local * 1.3) * 0.006 },
        () => clapper(ctx, st, board, slate, slateStyle, open),
    );

    const hookTop = board.y + board.h + 50 * u;
    const settle = easeOutCubic(clamp01(local / 0.6));
    const paintHook = (fill: string, mark: string) =>
        withCamera(ctx, { ...cam, zoom: cam.zoom * (1.04 - 0.04 * settle), ox: lay.hook.x, oy: hookTop }, () =>
            drawBlock(
                ctx,
                hook,
                lay.hook.x,
                hookTop,
                { ...hookStyle, fill },
                {
                    mark: count,
                    markFill: mark,
                    shadow: fill === INK ? undefined : "rgb(0 0 0 / 0.6)",
                },
            ),
        );
    paintHook(d.palette.fg, d.palette.accent);
    grain(ctx, st, local, 0.08);
    flashOverlay(ctx, st, pop * 0.32);

    // On the hit the frame is burnt white; the hook prints through it in ink so it reads from frame 0.
    flashOverlay(ctx, st, f);
    if (f > 0) {
        ctx.save();
        ctx.globalAlpha = f;
        paintHook(INK, "#c0281e");
        ctx.restore();
    }
}
