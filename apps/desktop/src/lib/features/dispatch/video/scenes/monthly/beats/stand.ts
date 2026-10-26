import { flashAt } from "../../../kit/beat";
import { clamp01, easeOutBack, easeOutCubic, lerp } from "../../../kit/ease";
import { shake } from "../../../kit/motion";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Ctx, Rect } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import { monthPalette } from "../../../../kinds/monthly/palette";
import { LANDED, paintCover } from "./cover";
import {
    BODY_PX,
    drawBlock,
    fitBlock,
    flashOverlay,
    grain,
    mix,
    say,
    stage,
    vignette,
    withCamera,
    type MonthlyDraw,
    type Stage,
} from "./studio";

export interface StandLayout {
    /** The issue's slot, front and centre. */
    slot: Rect;
    /** Every other slot on the rack: last month's issues, other colours. */
    others: Rect[];
    /** The shelf-edge strip the tag line is printed on. */
    shelf: Rect;
    burst: { x: number; y: number; r: number };
}

export function standLayout(st: Stage): StandLayout {
    const { u, w, h, safe } = st;
    const tall = st.aspect === "tall";
    const ch = tall ? 760 * u : st.aspect === "square" ? 640 * u : 620 * u;
    const cw = ch * 0.75;
    const gap = 70 * u;
    const cy = tall ? safe.top + 90 * u : h * 0.07;
    const slot = { x: (w - cw) / 2, y: cy, w: cw, h: ch };
    const others: Rect[] = [];
    for (let row = -1; row <= 1; row++)
        for (let col = -3; col <= 3; col++) {
            if (row === 0 && col === 0) continue;
            others.push({ x: slot.x + col * (cw + gap), y: slot.y + row * (ch + 150 * u), w: cw, h: ch });
        }
    return {
        slot,
        others,
        shelf: { x: 0, y: slot.y + ch + 20 * u, w, h: 120 * u },
        burst: { x: slot.x + cw - 10 * u, y: slot.y + ch * 0.78, r: (tall ? 170 : 150) * u },
    };
}

function starburst(ctx: Ctx, x: number, y: number, r: number, points: number, fill: string): void {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const a = (i / (points * 2)) * Math.PI * 2;
        const rr = i % 2 ? r * 0.82 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
}

/** A rack of other months' issues, plain: a coloured cover, a masthead, a few coverline bars. */
function otherIssue(ctx: Ctx, r: Rect, i: number, family: string, word: string): void {
    const p = monthPalette((i * 5) % 12);
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.5)";
    ctx.shadowBlur = r.w * 0.06;
    ctx.shadowOffsetY = r.w * 0.03;
    ctx.fillStyle = p.bg;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.shadowColor = "transparent";
    const g = ctx.createRadialGradient(
        r.x + r.w * 0.6,
        r.y + r.h * 0.5,
        0,
        r.x + r.w * 0.6,
        r.y + r.h * 0.5,
        r.w * 0.7,
    );
    g.addColorStop(0, p.glow);
    g.addColorStop(1, mix(p.glow, p.glow, 0, 0));
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const px = r.h * 0.17;
    setFont(ctx, { family, weight: 600, px, track: -0.035 } as TextStyle, px);
    const size = Math.min(px, (px * r.w * 0.92) / ctx.measureText(word).width);
    setFont(ctx, { family, weight: 600, px: size, track: -0.035 } as TextStyle, size);
    ctx.fillStyle = p.fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(word, r.x + r.w / 2, r.y + r.h * 0.04);
    ctx.fillStyle = p.accent;
    for (let k = 0; k < 4; k++)
        ctx.fillRect(r.x + r.w * 0.06, r.y + r.h * (0.3 + k * 0.1), r.w * (0.3 - (k % 2) * 0.08), r.h * 0.03);
    ctx.fillRect(r.x + r.w * 0.06, r.y + r.h * 0.84, r.w * 0.6, r.h * 0.07);
    ctx.restore();
}

/** The issue drops into the rack on the downbeat; the price burst slaps on, the shelf strip says when the next one is out. */
export function draw(
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const data = d.video.beats.m_stand;
    const st = stage(size);
    const u = st.u;
    const bar = assets.timing.barSeconds;
    const fonts = assets.fonts;
    const lay = standLayout(st);
    const fall = 0.32;
    const landK = clamp01(local / fall);
    const dropY = (1 - easeOutCubic(landK) ** 2) * -st.h * 0.9;
    const [sx, sy] = shake(local - fall, 16 * u * clamp01(1 - (local - fall) / 0.3), 3);
    const push = easeOutCubic(local / span);
    const s = lay.slot;
    const cam = { ox: s.x + s.w / 2, oy: s.y + s.h * 0.6, zoom: 0.96 + 0.08 * push, dx: sx, dy: sy };

    ctx.fillStyle = "#17120e";
    ctx.fillRect(0, 0, st.w, st.h);
    withCamera(ctx, cam, () => {
        const wall = ctx.createLinearGradient(0, 0, 0, st.h);
        wall.addColorStop(0, "#2a211a");
        wall.addColorStop(1, "#110d0a");
        ctx.fillStyle = wall;
        ctx.fillRect(-st.w, -st.h, st.w * 3, st.h * 3);
        const word = (d.print?.masthead ?? "Dispatch").toUpperCase();
        lay.others.forEach((r, i) => {
            ctx.save();
            ctx.translate(r.x + r.w / 2, r.y);
            ctx.rotate((((i * 7) % 5) - 2) * 0.006);
            ctx.translate(-(r.x + r.w / 2), -r.y);
            otherIssue(ctx, r, i, fonts.body, word);
            ctx.restore();
        });
        ctx.fillStyle = "rgb(0 0 0 / 0.45)";
        ctx.fillRect(-st.w, -st.h, st.w * 3, st.h * 3);
        for (const y of [s.y - 150 * u + 10 * u, s.y + s.h + 4 * u, s.y + 2 * s.h + 150 * u]) {
            const rail = ctx.createLinearGradient(0, y, 0, y + 16 * u);
            rail.addColorStop(0, "#d9dde2");
            rail.addColorStop(1, "#4b4f55");
            ctx.fillStyle = rail;
            ctx.fillRect(-st.w, y, st.w * 3, 16 * u);
        }
        const spot = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h * 0.4, 0, s.x + s.w / 2, s.y + s.h * 0.4, s.h);
        spot.addColorStop(0, "rgb(255 236 200 / 0.28)");
        spot.addColorStop(1, "rgb(255 236 200 / 0)");
        ctx.fillStyle = spot;
        ctx.fillRect(-st.w, -st.h, st.w * 3, st.h * 3);

        withCamera(ctx, { ox: s.x + s.w / 2, oy: s.y + s.h, zoom: 1, dy: dropY, rot: (1 - landK) * 0.08 }, () => {
            ctx.save();
            ctx.shadowColor = "rgb(0 0 0 / 0.7)";
            ctx.shadowBlur = 40 * u;
            ctx.shadowOffsetY = 18 * u;
            ctx.fillStyle = d.palette.bg;
            ctx.fillRect(s.x, s.y, s.w, s.h);
            ctx.restore();
            paintCover(ctx, s, d, assets, { ...LANDED, glare: (local - fall) / (bar * 0.8) }, 0, local);
        });

        const priceAt = bar / 2;
        const pk = easeOutBack(clamp01((local - priceAt) / 0.22), 2.4);
        if (pk > 0) {
            const b = lay.burst;
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(0.18 + (1 - pk) * 0.5);
            ctx.scale(pk, pk);
            ctx.shadowColor = "rgb(0 0 0 / 0.45)";
            ctx.shadowBlur = 20 * u;
            starburst(ctx, 0, 0, b.r, 18, "#ffd23a");
            ctx.shadowColor = "transparent";
            const priceStyle = { family: fonts.display, weight: 700, fill: "#1b1209" };
            const pb = fitBlock(
                ctx,
                say(d, data.price).toUpperCase(),
                priceStyle,
                { px: 52 * u, floor: BODY_PX * u, maxW: b.r * 1.35, maxLines: 3 },
                0.98,
            );
            drawBlock(ctx, pb, 0, -pb.height / 2, priceStyle, { align: "center" });
            ctx.restore();
        }
    });

    const tagK = clamp01((local - bar * 0.75) / 0.3);
    const tagStyle = { family: fonts.display, weight: 700, fill: "#1a1714" };
    const tb = fitBlock(
        ctx,
        say(d, data.tag),
        tagStyle,
        { px: 64 * u, floor: BODY_PX * u, maxW: st.w - 2 * st.m - 40 * u, maxLines: 2 },
        1.02,
    );
    const shelfY = Math.min(
        st.aspect === "tall" ? st.safe.bottom - tb.height - 50 * u : st.h - tb.height - 70 * u,
        (lay.shelf.y - cam.oy) * cam.zoom + cam.oy + 40 * u,
    );
    if (tagK > 0) {
        ctx.save();
        const sw = lerp(0, st.w, easeOutCubic(tagK));
        ctx.fillStyle = "#f4efe2";
        ctx.shadowColor = "rgb(0 0 0 / 0.5)";
        ctx.shadowBlur = 20 * u;
        ctx.fillRect(0, shelfY, sw, tb.height + 50 * u);
        ctx.shadowColor = "transparent";
        ctx.fillStyle = d.palette.bg;
        ctx.fillRect(0, shelfY, sw, 8 * u);
        ctx.beginPath();
        ctx.rect(0, shelfY, sw, tb.height + 50 * u);
        ctx.clip();
        drawBlock(ctx, tb, st.w / 2, shelfY + 25 * u, tagStyle, { align: "center" });
        const serial = `No. ${data.serial}`;
        ctx.font = `700 ${Math.round(26 * u)}px monospace`;
        ctx.fillStyle = "rgb(26 23 20 / 0.6)";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(serial, st.w - st.m * 0.5, shelfY + tb.height + 46 * u);
        ctx.restore();
    }
    vignette(ctx, st, 0.5);
    grain(ctx, st, local, 0.07);
    flashOverlay(ctx, st, flashAt(local, fall) * 0.25);
}
