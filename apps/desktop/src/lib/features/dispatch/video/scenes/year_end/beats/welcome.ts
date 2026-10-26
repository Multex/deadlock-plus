import { drawScraps, makeScraps, type Scrap } from "../../../../kinds/year_end/scraps";
import { flashAt } from "../../../kit/beat";
import { clamp01, easeOutBack, easeOutCubic, lerp } from "../../../kit/ease";
import { sceneFrame } from "../../../kit/frame";
import { shake } from "../../../kit/motion";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import { INK, dust } from "../draw";
import {
    beam,
    blockHeight,
    curtain,
    drawRich,
    grain,
    layoutRich,
    richMeasure,
    say,
    seedOf,
    spotlight,
    vignette,
    type Look,
    type Run,
    type Stage,
} from "./stage";

const HEAD_MAX = 132;
const HEAD_MIN = 96;
const KICKER = 46;

const scrapCache = new Map<number, Scrap[]>();
function scrapsFor(seed: number): Scrap[] {
    let s = scrapCache.get(seed);
    if (!s) scrapCache.set(seed, (s = makeScraps(150, seed)));
    return s;
}

/** The player's name inside the welcome line, so it can be set in gold; the whole line when it is not there. */
export function nameRuns(line: string, player: string | null, px: number): Run[] {
    const at = player ? line.indexOf(player) : -1;
    if (!player || at < 0) return [{ text: line, px }];
    return [
        { text: line.slice(0, at), px },
        { text: player, px, tag: "name" },
        { text: line.slice(at + player.length), px },
    ];
}

/**
 * The host's welcome on the drop: the curtain flies open, a gold flash and confetti burst from behind the line,
 * searchlights cross the house and the camera punches in on the player's name.
 */
export function draw(ctx: Ctx, local: number, span: number, size: SceneSize, data: Stage, assets: SceneAssets): void {
    const { w, h } = size;
    const { u, safe } = sceneFrame(w, h);
    const tall = h > w * 1.2;
    const wide = w > h * 1.2;
    const fonts = assets.fonts;
    const seed = seedOf(`${data.awards.player ?? ""}|welcome|${data.awards.year}`);

    const open = 0.18 + 0.82 * easeOutCubic(local / 0.55);
    const punch = 1 + 0.12 * (1 - easeOutCubic(local / 0.5));
    const [sx, sy] = shake(local, 16 * u, seed % 97);

    ctx.fillStyle = INK.room;
    ctx.fillRect(0, 0, w, h);

    const floorY = tall ? h * 0.66 : h * 0.74;
    ctx.save();
    ctx.translate(w / 2 + sx, h * 0.45 + sy);
    ctx.scale(punch, punch);
    ctx.translate(-w / 2, -h * 0.45);

    // The house: a back wall in gold-lit haze and a polished stage floor.
    const wall = ctx.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, "#0a0705");
    wall.addColorStop(1, "#22180c");
    ctx.fillStyle = wall;
    ctx.fillRect(-w, -h, w * 3, floorY + h);
    const floor = ctx.createLinearGradient(0, floorY, 0, h);
    floor.addColorStop(0, "#2b1d0c");
    floor.addColorStop(1, "#070504");
    ctx.fillStyle = floor;
    ctx.fillRect(-w, floorY, w * 3, h * 2);
    ctx.fillStyle = INK.goldDeep;
    ctx.fillRect(-w, floorY, w * 3, 4 * u);

    const sweep = Math.sin(local * 1.9);
    beam(ctx, -40 * u, -80 * u, w * (0.55 + 0.18 * sweep), floorY, 190 * u, 0.9);
    beam(ctx, w + 40 * u, -80 * u, w * (0.45 - 0.18 * sweep), floorY, 190 * u, 0.9);
    spotlight(ctx, w / 2, floorY + 30 * u, (wide ? 520 : 420) * u, 90 * u, 1.3);
    spotlight(ctx, w / 2, h * 0.42, w * 0.6, h * 0.32, 0.55);
    microphone(ctx, w / 2, floorY + 24 * u, u * (tall ? 1.15 : 1));

    // The curtain flies open from the middle on the drop.
    const halfOpen = lerp(w / 2, w * (wide ? 0.1 : 0.06), open);
    curtain(ctx, -20 * u, -20 * u, halfOpen + 20 * u, h + 40 * u, u, 30 * u * (1 - open));
    curtain(ctx, w - halfOpen, -20 * u, halfOpen + 20 * u, h + 40 * u, u, -30 * u * (1 - open));
    ctx.fillStyle = "#1d0306";
    ctx.fillRect(-w, -20 * u, w * 3, (tall ? 150 : 90) * u);
    ctx.fillStyle = INK.gold;
    ctx.fillRect(-w, (tall ? 130 : 70) * u, w * 3, 5 * u);
    ctx.restore();

    const scraps = scrapsFor(seed);
    const stage = { width: w, height: h };
    const scale = 1.7 * u;
    const fade = clamp01((span - local) / 0.5);
    drawScraps(ctx as unknown as CanvasRenderingContext2D, scraps, {
        t: local,
        stage,
        scale,
        alpha: fade,
        front: false,
    });
    dust(ctx, w, h, local + 3, u, 0.5, 1);

    // The line: the stage's name small on top, the welcome below with the player's name in gold.
    const kicker = say(data, data.awards.preshow.marquee).toLocaleUpperCase();
    const line = say(data, data.awards.welcome.line);
    const maxW = tall ? w - 120 * u : wide ? Math.min(1400 * u, w - 300 * u) : w - 180 * u;
    const lookOf =
        (top: number, px: number) =>
        (tag?: string): Look =>
            tag === "name"
                ? {
                      family: fonts.display,
                      weight: 700,
                      fill: brightGold(ctx, top, px),
                      glow: 22 * u,
                      glowColor: "rgb(0 0 0 / 0.95)",
                  }
                : { family: fonts.display, weight: 700, fill: INK.cream, glow: 26 * u, glowColor: "rgb(0 0 0 / 0.95)" };
    let px = HEAD_MAX * u;
    const maxLines = tall ? 4 : 3;
    let lines = layoutRich(nameRuns(line, data.awards.player, px), maxW, richMeasure(ctx, lookOf(0, px)));
    while (px > HEAD_MIN * u && lines.length > maxLines) {
        px -= 4 * u;
        lines = layoutRich(nameRuns(line, data.awards.player, px), maxW, richMeasure(ctx, lookOf(0, px)));
    }
    const kickPx = KICKER * u;
    const blockH = blockHeight(lines) + kickPx * 1.9;
    const centre = tall ? (safe.top + safe.bottom) * 0.42 : h * 0.4;
    const top = centre - blockH / 2;

    const pop = easeOutBack(local / 0.42, 2.2);
    const alpha = clamp01(local / 0.12);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(w / 2, centre);
    ctx.scale(lerp(1.3, 1, pop), lerp(1.3, 1, pop));
    ctx.translate(-w / 2, -centre);
    ctx.font = `700 ${kickPx}px "${fonts.display}"`;
    ctx.letterSpacing = `${0.24 * kickPx}px`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = INK.gold;
    ctx.fillText(kicker, w / 2 + 0.12 * kickPx, top + kickPx * 0.5);
    ctx.letterSpacing = "0px";
    const ruleW = Math.min(maxW * 0.5, 420 * u) * easeOutCubic((local - 0.15) / 0.5);
    ctx.fillRect(w / 2 - ruleW / 2, top + kickPx * 1.25, ruleW, 3 * u);
    const headTop = top + kickPx * 1.9;
    drawRich(ctx, lines, w / 2, headTop, lookOf(headTop, px));
    ctx.restore();

    drawScraps(ctx as unknown as CanvasRenderingContext2D, scraps, {
        t: local,
        stage,
        scale,
        alpha: fade,
        front: true,
    });

    const f = flashAt(local, 0);
    if (f > 0) {
        ctx.fillStyle = `rgb(255 236 190 / ${0.45 * f})`;
        ctx.fillRect(0, 0, w, h);
    }
    vignette(ctx, w, h, 0.65);
    grain(ctx, w, h, local, u);
}

/** A ribbon microphone on its stand, the host's place, standing in the floor's pool of light. */
function microphone(ctx: Ctx, x: number, base: number, u: number): void {
    ctx.fillStyle = "#0d0a06";
    ctx.beginPath();
    ctx.ellipse(x, base, 60 * u, 12 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    const steel = ctx.createLinearGradient(x - 6 * u, 0, x + 6 * u, 0);
    steel.addColorStop(0, "#3a2e1a");
    steel.addColorStop(0.5, "#e8d2a0");
    steel.addColorStop(1, "#3a2e1a");
    ctx.fillStyle = steel;
    ctx.fillRect(x - 5 * u, base - 330 * u, 10 * u, 330 * u);
    const head = ctx.createLinearGradient(x - 34 * u, 0, x + 34 * u, 0);
    head.addColorStop(0, "#5a4320");
    head.addColorStop(0.45, "#f6e3b0");
    head.addColorStop(1, "#4a3818");
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.roundRect(x - 32 * u, base - 420 * u, 64 * u, 96 * u, 30 * u);
    ctx.fill();
    ctx.strokeStyle = "rgb(30 20 8 / 0.6)";
    ctx.lineWidth = 2 * u;
    for (let i = 1; i < 6; i++) {
        const y = base - 420 * u + i * 16 * u;
        ctx.beginPath();
        ctx.moveTo(x - 30 * u, y);
        ctx.lineTo(x + 30 * u, y);
        ctx.stroke();
    }
}

/** A light gold that stays bright across the whole letter, for a name on a dark stage. */
function brightGold(ctx: Ctx, top: number, px: number): CanvasGradient {
    const g = ctx.createLinearGradient(0, top, 0, top + px);
    g.addColorStop(0, "#fff4cf");
    g.addColorStop(0.55, "#f2cf78");
    g.addColorStop(1, INK.gold);
    return g;
}
