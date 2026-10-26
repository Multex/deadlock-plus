import { SLEEVE, SLOT } from "../../../kinds/collectors/layout";
import type { TearFrame } from "../../../kinds/collectors/tear";
import { COVER_H, COVER_W } from "./cover";
import type { CollectorsSceneData } from "./legacy-data";
import { INK, fit, font, roundRect, type Fonts } from "./paint";
import type { Ctx } from "../../kit/types";
import { burstAt } from "./legacy-plan";

const W = SLEEVE.width;
const H = SLEEVE.height;
const TEAR_Y = 72;

const JAG: [number, number][] = (() => {
    const pts: [number, number][] = [];
    for (let x = 0, i = 0; x <= W; x += 13, i++) pts.push([x, TEAR_Y + (i % 2 ? 3.5 : -3.5)]);
    pts.push([W, TEAR_Y]);
    return pts;
})();

function bodyPath(ctx: Ctx) {
    ctx.beginPath();
    JAG.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.lineTo(W, H - 6);
    ctx.quadraticCurveTo(W, H, W - 6, H);
    ctx.lineTo(6, H);
    ctx.quadraticCurveTo(0, H, 0, H - 6);
    ctx.closePath();
}

function stripPath(ctx: Ctx) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, TEAR_Y);
    for (let i = JAG.length - 1; i >= 0; i--) ctx.lineTo(JAG[i][0], JAG[i][1]);
    ctx.closePath();
    ctx.roundRect(349, 20, 82, 16, 8);
    ctx.moveTo(401, 28);
    ctx.arc(390, 28, 11, 0, Math.PI * 2);
}

function film(ctx: Ctx, alphas: [number, number][], x1: number, y1: number) {
    const g = ctx.createLinearGradient(0, 0, x1, y1);
    for (const [o, a] of alphas) g.addColorStop(o, `rgba(255, 255, 255, ${a})`);
    return g;
}

const FILM: [number, number][] = [
    [0, 0.16],
    [0.22, 0.03],
    [0.36, 0.22],
    [0.42, 0.04],
    [0.7, 0.02],
    [0.8, 0.14],
    [1, 0.05],
];

function seal(ctx: Ctx, text: string, fonts: Fonts, half: "high" | "low") {
    ctx.save();
    ctx.beginPath();
    ctx.rect(520, half === "high" ? 0 : TEAR_Y, 190, half === "high" ? TEAR_Y : 60);
    ctx.clip();
    ctx.shadowColor = "#00000059";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    const g = ctx.createLinearGradient(520, 50, 710, 94);
    for (const [o, c] of [
        [0, "#c6c9d6"],
        [0.2, "#ffd6f3"],
        [0.4, "#c9fff0"],
        [0.6, "#d5e2ff"],
        [0.8, "#fff1c7"],
        [1, "#c6c9d6"],
    ] as const)
        g.addColorStop(o, c);
    ctx.fillStyle = g;
    roundRect(ctx, 520, 50, 190, 44, 22);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#2c2f3b";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "2px";
    fit(ctx, text.toUpperCase(), 700, 12, fonts.display, 160, 7);
    ctx.fillText(text.toUpperCase(), 615, 73);
    ctx.letterSpacing = "0px";
    ctx.restore();
}

function sticker(ctx: Ctx, data: CollectorsSceneData, fonts: Fonts) {
    const t = data.text;
    ctx.save();
    ctx.translate(566 + 88, 486 + 88);
    ctx.rotate((14 * Math.PI) / 180);
    ctx.shadowColor = "#00000080";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "#b3261e";
    ctx.beginPath();
    for (let i = 0; i < 48; i++) {
        const r = (i % 2 ? 44 : 50) * 1.76;
        const a = (i / 48) * Math.PI * 2;
        if (i === 0) ctx.moveTo(r * Math.sin(a), -r * Math.cos(a));
        else ctx.lineTo(r * Math.sin(a), -r * Math.cos(a));
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = INK.gold;
    ctx.lineWidth = 1.6 * 1.76;
    ctx.beginPath();
    ctx.arc(0, 0, 38 * 1.76, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.6 * 1.76;
    ctx.beginPath();
    ctx.arc(0, 0, 35 * 1.76, 0, Math.PI * 2);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fbefc2";
    ctx.letterSpacing = "2px";
    fit(ctx, t.stickerTop.toUpperCase(), 700, 15, fonts.display, 120, 8);
    ctx.fillText(t.stickerTop.toUpperCase(), 0, -30);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = "#ffe7a3";
    fit(ctx, t.stickerMain.toUpperCase(), 700, 40, fonts.pulp, 128, 18);
    ctx.fillText(t.stickerMain.toUpperCase(), 0, 2);
    ctx.letterSpacing = "1.5px";
    const note = t.stickerNote.toUpperCase();
    const size = fit(ctx, note, 700, 13, fonts.display, 116, 7);
    const nw = ctx.measureText(note).width;
    ctx.fillStyle = "#fbefc2";
    ctx.fillRect(-nw / 2 - 8, 34 - size * 0.75, nw + 16, size * 1.5);
    ctx.fillStyle = "#8e1c15";
    ctx.fillText(note, 0, 34);
    ctx.letterSpacing = "0px";
    ctx.restore();
}

function tab(ctx: Ctx, text: string, fonts: Fonts, nudge: number) {
    ctx.save();
    ctx.translate(-14 + nudge, 56);
    ctx.letterSpacing = "3px";
    ctx.font = font(700, 14, fonts.display);
    const label = text.toUpperCase();
    const w = 10 + 8 + 6 + ctx.measureText(label).width + 6 + 12 + 12;
    ctx.shadowColor = "#00000080";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, "#f1d688");
    g.addColorStop(1, "#c99a3e");
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, w, 32, 4);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#2b1f07";
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(18, 16);
    ctx.lineTo(10, 22);
    ctx.fill();
    ctx.textBaseline = "middle";
    ctx.fillText(label, 24, 17);
    ctx.fillText("▸", w - 22, 17);
    ctx.restore();
}

export interface BagPose {
    /** `null` while sealed. */
    tear: TearFrame | null;
    /** Milliseconds since the rip started, for the flecks. */
    ripMs: number;
    /** A light band crossing the film, 0 to 1; outside that, none. */
    sheen: number;
    /** How far the tear tab is pulled out, in sleeve units. */
    nudge: number;
}

/** The sealed bag and its tear, in sleeve units (780×1180), the cover inside it at its slot. */
export function drawBag(ctx: Ctx, cover: OffscreenCanvas, data: CollectorsSceneData, fonts: Fonts, pose: BagPose) {
    const { tear } = pose;
    ctx.save();
    ctx.translate(SLOT.x + COVER_W / 2, SLOT.y + COVER_H / 2 + (tear?.slot.y ?? 0));
    ctx.scale(tear?.slot.scale ?? 1, tear?.slot.scale ?? 1);
    ctx.shadowColor = "#000000bf";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 20;
    ctx.drawImage(cover, -COVER_W / 2, -COVER_H / 2, COVER_W, COVER_H);
    ctx.restore();

    const body = tear?.body;
    if (!body || body.opacity > 0) {
        ctx.save();
        if (body) {
            ctx.globalAlpha = body.opacity;
            ctx.translate(W / 2 + body.x, H / 2 + body.y);
            ctx.rotate((body.rotate * Math.PI) / 180);
            ctx.translate(-W / 2, -H / 2);
        }
        ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
        ctx.fillRect(SLOT.x, SLOT.y, COVER_W, COVER_H);
        bodyPath(ctx);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = film(ctx, FILM, W, H * 0.35);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.save();
        bodyPath(ctx);
        ctx.clip();
        ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
        ctx.fillRect(0, 0, 12, H);
        ctx.fillRect(W - 12, 0, 12, H);
        ctx.fillRect(0, H - 14, W, 14);
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.moveTo(150, 120);
        ctx.lineTo(40, 520);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 30;
        ctx.beginPath();
        ctx.moveTo(720, 600);
        ctx.lineTo(640, 1100);
        ctx.stroke();
        if (pose.sheen > 0 && pose.sheen < 1) {
            const x = -300 + pose.sheen * (W + 600);
            const g = ctx.createLinearGradient(x - 160, 0, x + 160, 120);
            g.addColorStop(0, "rgba(255, 255, 255, 0)");
            g.addColorStop(0.5, "rgba(255, 255, 255, 0.32)");
            g.addColorStop(1, "rgba(255, 255, 255, 0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
        seal(ctx, data.text.sealed, fonts, "low");
        sticker(ctx, data, fonts);
        ctx.restore();
    }

    const strip = tear?.strip;
    if (!strip || strip.opacity > 0) {
        ctx.save();
        if (strip) {
            ctx.globalAlpha = strip.opacity;
            ctx.translate(W + strip.x, 40 + strip.y);
            ctx.rotate((strip.rotate * Math.PI) / 180);
            ctx.translate(-W, -40);
        }
        stripPath(ctx);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
        ctx.lineWidth = 3;
        ctx.stroke();
        const lip = ctx.createLinearGradient(0, 0, W, 0);
        lip.addColorStop(0, "rgba(255, 255, 255, 0.2)");
        lip.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
        lip.addColorStop(1, "rgba(255, 255, 255, 0.18)");
        ctx.fillStyle = lip;
        ctx.fill("evenodd");
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
        ctx.fillRect(0, 40, W, 7);
        ctx.fillStyle = "rgba(232, 184, 90, 0.32)";
        ctx.fillRect(250, 34, 280, 18);
        seal(ctx, data.text.sealed, fonts, "high");
        ctx.restore();
    }

    if (!tear) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        for (let x = 40; x < W - 12; x += 13) ctx.fillRect(x, 71, 7, 2);
        tab(ctx, data.text.tear, fonts, pose.nudge);
    } else {
        if (tear.rip.opacity > 0 && tear.rip.scaleX > 0) {
            ctx.save();
            ctx.globalAlpha = tear.rip.opacity;
            ctx.shadowColor = "#ffe296";
            ctx.shadowBlur = 30;
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 70, W * tear.rip.scaleX, 4);
            ctx.shadowColor = "#ffffff";
            ctx.shadowBlur = 10;
            ctx.fillRect(0, 70, W * tear.rip.scaleX, 4);
            ctx.restore();
        }
        for (const f of burstAt(pose.ripMs)) {
            if (f.alpha <= 0) continue;
            ctx.save();
            ctx.globalAlpha = f.alpha;
            ctx.translate(f.x, f.y);
            ctx.rotate((f.rotate * Math.PI) / 180);
            ctx.fillStyle = f.tint > 0.6 ? `hsl(${Math.round(((f.tint - 0.6) / 0.4) * 360)} 90% 82%)` : "#ffffffe6";
            ctx.fillRect(-f.w, -f.h, f.w * 2, f.h * 2);
            ctx.restore();
        }
    }
}
