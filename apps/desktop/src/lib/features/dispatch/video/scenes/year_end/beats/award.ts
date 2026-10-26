import type { SceneAssets, SceneSize } from "../../../scene";
import { clamp01, easeInOut, easeOutBack, easeOutCubic, lerp } from "../../../kit/ease";
import { sceneFrame } from "../../../kit/frame";
import { shake } from "../../../kit/motion";
import type { Ctx, Rect } from "../../../kit/types";
import type { AwardId } from "../plan";
import type { Nominee, YearEndAwards } from "../data";
import { INK, dust, room } from "../draw";
import {
    CAMERA_PUSH,
    GUTTER,
    awardTimes,
    fitLines,
    nomineeSlots,
    revealRow,
    seatOrder,
    winnerStand,
} from "./award-kit";
import { apron, crowd, envelope, flashbulbs, glow, rgba, since, streamers, type F, type Look } from "./award-paint";
import { breakthrough } from "./award-breakthrough";
import { endurance } from "./award-endurance";
import { hero } from "./award-hero";
import { longestRun } from "./award-longest-run";
import { month } from "./award-month";
import { performance } from "./award-performance";
import { supporting } from "./award-supporting";
import { villain } from "./award-villain";
import { grain, say, seedOf, vignette, type Stage } from "./stage";

export type AwardDraw = (
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    data: Stage,
    assets: SceneAssets,
) => void;

const LOOKS: Record<AwardId, Look> = {
    y_hero: hero,
    y_month: month,
    y_performance: performance,
    y_supporting: supporting,
    y_breakthrough: breakthrough,
    y_longest_run: longestRun,
    y_endurance: endurance,
    y_villain: villain,
};

const ART_AWARDS: readonly AwardId[] = ["y_hero", "y_performance", "y_breakthrough"];

/**
 * The hero art the night's awards draw, as `ScenePrep.images` keys: each nominee's card, the winner's smug face,
 * the beaten face of the nominees who lose, and the player's own hero, battered by the villain or smug beside a
 * supporting player.
 */
export function awardImages(
    night: YearEndAwards,
): { key: string; heroId: number; mood: "gloat" | "critical" | null }[] {
    const out = new Map<string, { key: string; heroId: number; mood: "gloat" | "critical" | null }>();
    const add = (heroId: number | null | undefined, mood: "gloat" | "critical" | null) => {
        if (heroId === null || heroId === undefined) return;
        const key = mood ? `mood:${heroId}:${mood}` : `hero:${heroId}`;
        out.set(key, { key, heroId, mood });
    };
    const star = starOf(night);
    for (const a of night.awards) {
        if (ART_AWARDS.includes(a.id)) {
            a.nominees.forEach((n, i) => {
                add(n.heroId, null);
                add(n.heroId, i === 0 ? "gloat" : "critical");
            });
        }
        if (a.id === "y_villain") add(star, "critical");
        if (a.id === "y_supporting") add(star, "gloat");
    }
    return [...out.values()];
}

const starOf = (night: YearEndAwards) => night.awards.find((a) => a.id === "y_hero")?.nominees[0]?.heroId ?? null;

export function drawAward(id: AwardId): AwardDraw {
    return (ctx, local, span, size, data, assets) => {
        const award = data.awards.awards.find((a) => a.id === id);
        if (!award || !award.nominees.length) {
            room(ctx, size.w, size.h, 0.4);
            return;
        }
        const { u, box, safe } = sceneFrame(size.w, size.h);
        const B = assets.timing.barSeconds;
        const bars = Math.max(1, Math.round(span / B));
        const f: F = {
            ctx,
            t: local,
            span,
            w: size.w,
            h: size.h,
            u,
            box,
            safe,
            tall: size.h > size.w * 1.2,
            wide: size.w > size.h * 1.2,
            B,
            b: B / 4,
            at: awardTimes(bars, B, award.nominees.length),
            award,
            stage: data,
            images: assets.images,
            fonts: assets.fonts,
            seed: seedOf(`${award.id}:${data.awards.year}:${data.awards.player ?? ""}`),
            star: starOf(data.awards),
        };
        paint(f, LOOKS[id]);
    };
}

export const AWARD_BEATS: Readonly<Record<AwardId, AwardDraw>> = Object.fromEntries(
    (Object.keys(LOOKS) as AwardId[]).map((id) => [id, drawAward(id)]),
) as Record<AwardId, AwardDraw>;

interface Placed {
    r: Rect;
    /** The card's seat before it moves or grows: its contents and label are laid out at this size, once. */
    base: Rect;
    n: Nominee;
    index: number;
    landed: number;
    alpha: number;
}

function paint(f: F, look: Look): void {
    const { ctx, at, u, award } = f;
    const lead = award.lead;
    const toSpot = since(f, at.spot);
    const rv = easeInOut(clamp01(toSpot / 0.45));
    const env = clamp01(since(f, at.envelope) / 0.3) * (1 - rv);

    look.room(f);
    dust(ctx, f.w, f.h, f.t + (f.seed % 7), u, 0.45, toSpot > 0 ? 0.6 : 0);

    // The camera drifts in through the nominees, leans into the envelope and kicks on the winner.
    const placed = place(f, look, rv);
    const row = placed[0] ? placed[0].r.y + placed[0].r.h / 2 : f.h / 2;
    const kick = toSpot >= 0 ? (lead ? 0.05 : 0.025) * Math.exp(-toSpot / 0.22) : 0;
    const zoom = 1 + (CAMERA_PUSH - 0.04) * (f.t / f.span) + 0.04 * easeInOut(env) + kick;
    const [sx, sy] = shake(since(f, at.reveal), 7 * u, f.seed % 11);
    ctx.save();
    ctx.translate(f.w / 2 + sx, row + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-f.w / 2, -row);

    lights(f, look, placed, env, rv);

    const winner = placed.find((p) => p.index === 0);
    if (winner && toSpot >= 0) look.flourish(f, winner.r, toSpot);
    for (const p of [...placed].sort((a, b) => Number(a.index === 0) - Number(b.index === 0))) {
        if (p.alpha <= 0) continue;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        // Drawn at its seat's size and scaled, so the card's own text never re-wraps as it lands or grows.
        const k = p.r.w / p.base.w;
        ctx.translate(p.r.x + p.r.w / 2, p.r.y + p.r.h / 2);
        ctx.scale(k, k);
        const r = { x: -p.base.w / 2, y: -p.base.h / 2, w: p.base.w, h: p.base.h };
        look.card(f, r, p.n, { winner: p.index === 0, landed: p.landed, revealed: rv, index: p.index });
        ctx.restore();
    }
    if (winner && toSpot >= 0) look.stamp?.(f, winner.r, toSpot);
    labels(f, look, placed);
    ceremony(f, placed);
    ctx.restore();

    // Outside the camera, so the header never drifts out of the safe band.
    title(f, look);
    caption(
        f,
        say(f.stage, award.ceremony.nominees),
        clamp01(since(f, at.title) / 0.2) * (1 - clamp01(since(f, at.envelope) / 0.2)),
    );
    if (f.tall) apron(f, look.light, toSpot >= 0 ? rv : 0);
    crowd(f, toSpot >= 0 ? easeOutCubic(clamp01(toSpot / 0.4)) * (lead ? 1 : 0.45) : 0, lead);
    flashbulbs(f, at.spot, lead ? 30 : 8);
    if (lead) streamers(f, at.spot);
    winnerText(f, look, winner);

    // The tear's pop and the winner's flash.
    const pop = since(f, at.reveal);
    if (pop >= 0 && pop < 0.2) glow(ctx, f.w / 2, row + 80 * u, 520 * u, look.light, 0.35 * (1 - pop / 0.2));
    if (toSpot >= 0 && toSpot < 0.3) {
        ctx.fillStyle = `rgb(255 250 235 / ${(lead ? 0.75 : 0.3) * (1 - toSpot / 0.3)})`;
        ctx.fillRect(0, 0, f.w, f.h);
    }
    vignette(ctx, f.w, f.h, 0.7);
    grain(ctx, f.w, f.h, f.t, u, 0.05);
}

/** In 16:9 the winner stands left of centre and the name and speech take the right. */
const WIDE_WINNER_X = 0.32;

/** Where each card stands: dropped in on its cue, then the winner to the middle and the rest back into the dark. */
function place(f: F, look: Look, rv: number): Placed[] {
    const n = f.award.nominees.length;
    const bleed = look.bleed ?? 0;
    const slots = nomineeSlots(n, f, rowDrop(f), bleed);
    const seats = seatOrder(n, `${f.award.id}:${f.seed}`);
    // On a phone the winner grows to fill the band down to the acceptance line, its words under it.
    const stand = f.tall
        ? winnerStand(
              slots[0]!,
              headerBottom(f) + 34 * f.u,
              f.safe.bottom,
              revealText(f, slots[0]!.w * WINNER_CAP).height,
              WINNER_CAP,
          )
        : null;
    const grow = stand ? stand.scale : f.wide ? 1.3 : 1.14;
    const standX = f.wide ? f.w * WIDE_WINNER_X : f.w / 2;
    const to = revealRow(slots, seats.indexOf(0), standX, grow, LOSER_SCALE, GUTTER(f) * f.u, bleed * f.u);
    return seats.map((index, seat) => {
        const base = slots[seat]!;
        const landed = since(f, f.at.nominees[seat]!);
        const k = clamp01(landed / 0.32);
        const enter = look.rise
            ? { dy: (1 - easeOutCubic(k)) * 260 * f.u, s: 1 }
            : { dy: -(1 - easeOutCubic(k)) * 140 * f.u, s: lerp(1.06, 1, easeOutBack(k)) };
        const win = index === 0;
        const cx = lerp(base.x + base.w / 2, to[seat]!, rv);
        const s = enter.s * (win ? lerp(1, grow, rv) : lerp(1, LOSER_SCALE, rv));
        const w = base.w * s;
        const h = base.h * s;
        const seatCy = base.y + base.h / 2;
        const winCy = stand ? stand.top + (base.h * stand.scale) / 2 : seatCy - 14 * f.u;
        const cy = enter.dy + (win ? lerp(seatCy, winCy, rv) : seatCy + 30 * f.u * rv);
        const alpha = clamp01(landed / 0.12) * (win ? 1 : 1 - (f.wide ? 0.94 : 0.68) * rv);
        return { r: { x: cx - w / 2, y: cy - h / 2, w, h }, base, n: f.award.nominees[index]!, index, landed, alpha };
    });
}

/** How far the losing cards shrink as they step back. */
const LOSER_SCALE = 0.84;

/** Two beams roam the nominees, close in on the envelope, then one finds the winner and stays. */
function lights(f: F, look: Look, placed: Placed[], env: number, rv: number): void {
    const { ctx, u, at } = f;
    const top = look.from === "below" ? f.h + 80 * u : Math.min(f.box.y - 60 * u, 0) - 40 * u;
    const row = placed[0]!.r;
    const floor = row.y + row.h + 10 * u;
    const winner = placed.find((p) => p.index === 0)!.r;
    const center = f.w / 2;
    const spread = Math.min(f.w, f.box.w) * 0.42;
    for (let i = 0; i < 2; i++) {
        const roam = center + Math.sin(f.t * (1.3 + i * 0.4) + i * 2.4) * spread;
        const x = lerp(lerp(roam, center + (i ? 60 : -60) * u, env), winner.x + winner.w / 2, rv);
        const src = i ? f.w * 0.82 : f.w * 0.18;
        const a = (0.55 + 0.45 * env) * (i === 1 ? 1 - rv : 1) * clamp01(f.t / 0.25);
        cone(ctx, lerp(src, center, rv * 0.6), top, x, floor, (130 + 40 * rv) * u, look.light, a * (1 + 0.6 * rv));
    }
    if (since(f, at.spot) >= 0)
        glow(ctx, winner.x + winner.w / 2, winner.y + winner.h * 0.45, winner.w * 1.2, look.light, 0.28 * rv);
}

function cone(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r: number, rgb: string, a: number): void {
    if (a <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba(rgb, 0.05 * a));
    g.addColorStop(1, rgba(rgb, 0.2 * a));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - r * 0.08, y0);
    ctx.lineTo(x1 - r, y1);
    ctx.lineTo(x1 + r, y1);
    ctx.lineTo(x0 + r * 0.08, y0);
    ctx.closePath();
    ctx.fill();
    ctx.translate(x1, y1);
    ctx.scale(1, 0.24);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.2);
    pool.addColorStop(0, rgba(rgb, 0.4 * a));
    pool.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = pool;
    ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
    ctx.restore();
}

function measurer(ctx: Ctx, family: string, weight: number, track = 0) {
    return (s: string, px: number) => {
        ctx.font = `${weight} ${px}px "${family}"`;
        ctx.letterSpacing = `${track * px}px`;
        const w = ctx.measureText(s).width;
        ctx.letterSpacing = "0px";
        return w;
    };
}

type Fill = string | CanvasGradient | ((top: number, bottom: number) => string | CanvasGradient);

/**
 * `str` fitted at `o.px` and drawn centred on (`x`, `y`), grown by `scale` about that point. The breaks come from
 * `o.px` alone, so an animated `scale` never moves a word to another line. Returns the block's height at `o.px`.
 */
function lines(
    f: F,
    str: string,
    x: number,
    y: number,
    o: {
        family: string;
        weight: number;
        px: number;
        floor: number;
        maxW: number;
        maxLines?: number;
        track?: number;
        fill: Fill;
        leading?: number;
        italic?: boolean;
    },
    scale = 1,
): number {
    const { ctx } = f;
    const fit = fitLines(measurer(ctx, o.family, o.weight, o.track), str, o.px, o.floor, o.maxW, o.maxLines ?? 2);
    const lh = fit.px * (o.leading ?? 1.08);
    const top = -((fit.lines.length - 1) * lh) / 2;
    const trail = ((o.track ?? 0) * fit.px) / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.font = `${o.italic ? "italic " : ""}${o.weight} ${fit.px}px "${o.family}"`;
    ctx.letterSpacing = `${(o.track ?? 0) * fit.px}px`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = typeof o.fill === "function" ? o.fill(top - fit.px / 2, -top + fit.px / 2) : o.fill;
    fit.lines.forEach((l, i) => ctx.fillText(l, trail, top + i * lh));
    ctx.letterSpacing = "0px";
    ctx.restore();
    return fit.lines.length * lh;
}

const HEADER_BOTTOM = 172;
const TRACK = 0.02;
const BIG = 148;
const HEAD = 100;

function headerMaxW(f: F): number {
    return f.wide ? f.w - 160 * f.u : Math.min(f.w - 100 * f.u, 1500 * f.u);
}

/** The header set at its resting size: the breaks every frame of the beat keeps. */
function headerFit(f: F) {
    const measure = measurer(f.ctx, f.fonts.display, 700, TRACK);
    const text = say(f.stage, f.award.title).toLocaleUpperCase();
    const fit = fitLines(measure, text, HEAD * f.u, 96 * f.u, headerMaxW(f));
    return { text, fit, widest: Math.max(1, ...fit.lines.map((l) => measure(l, fit.px))) };
}

function headerLines(f: F): number {
    return headerFit(f).fit.lines.length;
}

/** The header's centre once it has risen: its last line sits on the same baseline however many lines it takes. */
function headerCentre(f: F): number {
    const n = headerLines(f);
    return Math.max(f.safe.top + (n * HEAD * f.u) / 2 + 8 * f.u, f.box.y + (HEADER_BOTTOM - (n * HEAD) / 2) * f.u);
}

function headerBottom(f: F): number {
    return headerCentre(f) + (headerLines(f) * HEAD * f.u) / 2;
}

/** Content units the nominee row moves down so a header of three lines or more still clears the caption. */
function rowDrop(f: F): number {
    return Math.max(0, headerLines(f) - 2) * HEAD;
}

/**
 * The category title: it holds the frame over its set piece, then rises to head the nominees. Its breaks are the
 * resting header's; the title card is that same block, scaled up as far as the frame's width allows.
 */
function title(f: F, look: Look): void {
    const { ctx, u, box, at } = f;
    const { text, fit, widest } = headerFit(f);
    const k = at.title > 0 ? f.t / at.title : 1;
    const cy0 = box.y + box.h * 0.44;
    const cy1 = headerCentre(f);
    const move = easeInOut(clamp01((f.t - at.title * 0.75) / Math.max(0.2, at.title * 0.5)));
    const cy = lerp(cy0, cy1, move);
    f.headBottom = headerBottom(f);
    look.title(f, k, f.w / 2, cy0);
    const land = easeOutBack(clamp01(f.t / 0.22), 2.2);
    const big = Math.max(1, Math.min(BIG / HEAD, (f.w - 80 * u) / widest));
    const scale = Math.min(lerp(big, 1, move) * lerp(1.3, 1, land), Math.max(1, (f.w - 24 * u) / widest));
    ctx.save();
    ctx.globalAlpha = clamp01(f.t / 0.1) * (look.flicker ? look.flicker(f) : 1);
    ctx.shadowColor = rgba(look.light, 0.55);
    ctx.shadowBlur = 30 * u * (1 - move * 0.6);
    lines(
        f,
        text,
        f.w / 2,
        cy,
        {
            family: f.fonts.display,
            weight: 700,
            px: fit.px,
            floor: fit.px,
            maxW: headerMaxW(f),
            maxLines: fit.lines.length,
            track: TRACK,
            leading: 1,
            fill: (y0, y1) => look.titleFill(f, y0, y1),
        },
        scale,
    );
    ctx.restore();
}

function caption(f: F, text: string, a: number): void {
    if (a <= 0 || !text) return;
    f.ctx.save();
    f.ctx.globalAlpha = a;
    lines(f, text, f.w / 2, Math.max(f.box.y + 212 * f.u, (f.headBottom ?? 0) + 36 * f.u), {
        family: f.fonts.body,
        weight: 600,
        px: 48 * f.u,
        floor: 44 * f.u,
        maxW: Math.min(f.w - 120 * f.u, 1200 * f.u),
        maxLines: 1,
        fill: INK.cream,
        italic: true,
    });
    f.ctx.restore();
}

/** Each nominee's name and line under its card, until the envelope comes out. */
function labels(f: F, look: Look, placed: Placed[]): void {
    const { u } = f;
    const out = clamp01(since(f, f.at.envelope) / 0.2);
    const seats = [...placed].sort((a, b) => a.base.x - b.base.x);
    const gap = seats.length > 1 ? seats[1]!.base.x - (seats[0]!.base.x + seats[0]!.base.w) : 0;
    for (const p of placed) {
        const a = clamp01((p.landed - 0.08) / 0.2) * (1 - out);
        if (a <= 0) continue;
        const maxW = p.base.w + gap * 0.8;
        const cx = p.r.x + p.r.w / 2;
        let y = p.r.y + p.r.h + 22 * u;
        f.ctx.save();
        f.ctx.globalAlpha = a;
        if (!look.labelled && p.n.label) {
            const h = lines(f, p.n.label, cx, y + 30 * u, {
                family: f.fonts.display,
                weight: 700,
                px: 56 * u,
                floor: 44 * u,
                maxW,
                fill: INK.gold,
            });
            y += h + 6 * u;
        }
        lines(f, say(f.stage, p.n.line), cx, y + 26 * u, {
            family: f.fonts.body,
            weight: 600,
            px: 44 * u,
            floor: 44 * u,
            maxW,
            fill: INK.cream,
        });
        f.ctx.restore();
    }
}

/** "The envelope, please", the envelope itself and "And the award goes to...". */
function ceremony(f: F, placed: Placed[]): void {
    const { ctx, u, at } = f;
    const out = since(f, at.envelope);
    if (out < 0) return;
    const r = placed[0]!.r;
    const cyRow = r.y + r.h / 2;
    const toSpot = since(f, at.spot);
    const up = easeOutBack(clamp01(out / 0.3), 1.4);
    const fall = toSpot >= 0 ? easeInOut(clamp01(toSpot / 0.25)) : 0;
    const cy = lerp(f.h + 300 * u, cyRow + 40 * u, up) + fall * 900 * u;
    if (fall < 1) {
        ctx.save();
        ctx.translate(f.w / 2, cy);
        ctx.rotate(fall * 0.5);
        ctx.globalAlpha = 1 - clamp01(fall * 1.6);
        envelope(f, 0, 0, f.tall ? 1.3 : 1, since(f, at.reveal), f.award.lead ? "150 24 30" : "120 30 30");
        ctx.restore();
    }
    const capY = r.y + r.h + 110 * u;
    const tear = since(f, at.reveal);
    const a1 = clamp01(out / 0.15) * (1 - clamp01(tear / 0.08));
    const a2 = tear >= 0 ? clamp01(tear / 0.08) * (1 - clamp01(toSpot / 0.1)) : 0;
    const style = {
        family: f.fonts.body,
        weight: 600,
        px: 54 * u,
        floor: 44 * u,
        maxW: Math.min(f.w - 120 * u, 1200 * u),
        maxLines: 1,
        fill: INK.cream,
        italic: true,
    };
    if (a1 > 0) {
        ctx.save();
        ctx.globalAlpha = a1;
        lines(f, say(f.stage, f.award.ceremony.envelope), f.w / 2, capY, style);
        ctx.restore();
    }
    if (a2 > 0) {
        ctx.save();
        ctx.globalAlpha = a2;
        const punch = 1 + 0.12 * Math.exp(-Math.max(0, tear) / 0.12);
        lines(f, say(f.stage, f.award.ceremony.goesTo), f.w / 2, capY, { ...style, px: 60 * u, fill: INK.gold }, punch);
        ctx.restore();
    }
}

/** The most a phone's winner card grows over its seat. */
const WINNER_CAP = 1.45;
const NAME_PX = 112;
/** Under the card on a phone: the gap to the name, and from the name to the acceptance line. */
const NAME_GAP = 34;
const ACCEPT_GAP = 26;

function winnerName(f: F, n: Nominee): string {
    return LOOKS[f.award.id].headline === "line" || !n.label ? say(f.stage, n.line) : n.label;
}

function acceptStyle(f: F, side: boolean) {
    return {
        family: f.fonts.body,
        weight: 600,
        px: (f.tall ? 54 : f.wide ? 66 : 58) * f.u,
        floor: 44 * f.u,
        maxW: side ? f.w * 0.4 : Math.min(f.w - 140 * f.u, 980 * f.u),
        maxLines: 3,
        fill: INK.cream,
    };
}

/** The winner's name and acceptance line as a phone sets them under the card, and the block's height. */
function revealText(f: F, cardW: number) {
    const nameMaxW = Math.min(f.w - 100 * f.u, 1400 * f.u, Math.max(cardW * 1.6, 600 * f.u));
    const name = fitLines(
        measurer(f.ctx, f.fonts.display, 700, 0.02),
        winnerName(f, f.award.nominees[0]!),
        NAME_PX * f.u,
        96 * f.u,
        nameMaxW,
    );
    const style = acceptStyle(f, false);
    const accept = fitLines(
        measurer(f.ctx, style.family, style.weight),
        say(f.stage, f.award.accept),
        style.px,
        style.floor,
        style.maxW,
        3,
    );
    const nameH = name.lines.length * name.px * 1.08;
    const acceptH = accept.lines.length * accept.px * 1.12;
    return { nameMaxW, nameH, height: (NAME_GAP + ACCEPT_GAP) * f.u + nameH + acceptH };
}

/** The winner's name, slammed in under the spotlight, and the acceptance line word by word. */
function winnerText(f: F, look: Look, winner: Placed | undefined): void {
    const { ctx, u, box, at } = f;
    const toSpot = since(f, at.spot);
    if (!winner || toSpot < 0) return;
    const name = winnerName(f, winner.n);
    const side = f.wide;
    const layout = f.tall ? revealText(f, winner.r.w) : null;
    const x = side ? f.w * 0.68 : f.w / 2;
    const y = layout
        ? winner.r.y + winner.r.h + NAME_GAP * u + layout.nameH / 2
        : side
          ? winner.r.y + winner.r.h * 0.32
          : winner.r.y + winner.r.h + 90 * u;
    // In 16:9 the name waits for the winner's card to clear the right half.
    const dt = side ? toSpot - 0.25 : toSpot;
    if (dt < 0) return;
    const land = easeOutBack(clamp01(dt / 0.25), 2);
    const px = NAME_PX * u;
    const maxW = side ? f.w * 0.42 : layout ? layout.nameMaxW : Math.min(f.w - 100 * u, 1400 * u);
    ctx.save();
    ctx.globalAlpha = clamp01(dt / 0.08);
    ctx.shadowColor = rgba(look.light, 0.7);
    ctx.shadowBlur = 36 * u;
    const h = lines(
        f,
        name,
        x,
        y,
        {
            family: f.fonts.display,
            weight: 700,
            px,
            floor: 96 * u,
            maxW,
            track: 0.02,
            fill: (y0, y1) => look.titleFill(f, y0, y1),
        },
        lerp(1.35, 1, land),
    );
    ctx.restore();

    const toAccept = since(f, at.accept);
    if (toAccept < 0) return;
    const accept = say(f.stage, f.award.accept);
    const words = accept.split(/\s+/);
    const shown = Math.max(1, Math.ceil(words.length * clamp01(toAccept / 0.6)));
    const ay = layout ? y + layout.nameH / 2 + ACCEPT_GAP * u : y + h / 2 + 70 * u;
    const bottom = f.tall ? f.safe.bottom : box.y + box.h;
    ctx.save();
    ctx.globalAlpha = clamp01(toAccept / 0.1);
    // Laid out on the whole line so words do not jump as they appear; the hidden ones are drawn clear.
    const style = acceptStyle(f, side);
    const fit = fitLines(measurer(ctx, style.family, style.weight), accept, style.px, style.floor, style.maxW, 3);
    const lh = fit.px * 1.12;
    const top = Math.min(ay, bottom - fit.lines.length * lh);
    let seen = 0;
    ctx.font = `${style.weight} ${fit.px}px "${style.family}"`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.shadowColor = "rgb(0 0 0 / 0.9)";
    ctx.shadowBlur = 18 * u;
    fit.lines.forEach((l, i) => {
        const lw = ctx.measureText(l).width;
        let wx = x - lw / 2;
        for (const word of l.split(" ")) {
            ctx.fillStyle = seen < shown ? INK.cream : "rgb(0 0 0 / 0)";
            ctx.fillText(word, wx, top + i * lh);
            wx += ctx.measureText(`${word} `).width;
            seen++;
        }
    });
    ctx.restore();
}
