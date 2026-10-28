import { clamp01, easeInOut, easeOutCubic, lerp } from "../../../kit/ease";
import { sceneFrame } from "../../../kit/frame";
import { seeded } from "../../../kit/rng";
import { setFont, wrap } from "../../../kit/text";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import type { Card, CollectorsVideoData, CopyRef, Rarity, Stat } from "../data";
import { drawArt } from "./faces";

/** A card in its own units: 5:7, and one unit is one pixel when the card fills the 9:16 safe band at 1080 wide. */
export const CARD = { w: 800, h: 1120, r: 40, border: 26 } as const;

/**
 * What every Pack Opening beat draws from: the data and each of its lines already translated on the main thread
 * (the worker has no i18n), keyed by `lineId`. `locale` formats the big numbers the way the lines do.
 */
export interface Deck {
    video: CollectorsVideoData;
    lines: Readonly<Record<string, string>>;
    locale?: string;
}

/** The signature every beat file exports as `draw`. */
export type BeatDraw = (
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    deck: Deck,
    assets: SceneAssets,
) => void;

export function lineId(ref: CopyRef): string {
    return JSON.stringify([ref.key, ref.count ?? null, ref.params]);
}

export function say(deck: Deck, ref: CopyRef | null | undefined): string {
    return ref ? (deck.lines[lineId(ref)] ?? "") : "";
}

/** The `lines` of a `Deck`: every ref the data asks for, through the main thread's translator. */
export function deckLines(refs: readonly CopyRef[], translate: (ref: CopyRef) => string): Record<string, string> {
    return Object.fromEntries(refs.map((ref) => [lineId(ref), translate(ref)]));
}

export interface FlipPose {
    /** 0 face down to PI face up. */
    angle: number;
    faceUp: boolean;
    /** The card's width as seen edge on: `|cos angle|`, never quite 0. */
    scaleX: number;
    /** How much the turning card darkens, 0 to 0.6. */
    shade: number;
    /** The card rises toward the camera mid flip. */
    lift: number;
    /** A vertical shear that fakes the near edge growing as it turns toward the camera. */
    skew: number;
}

const MIN_SCALE_X = 0.015;

/** A card turning over between `start` and `start + dur`, face down before and face up after. */
export function flipPose(t: number, start: number, dur: number): FlipPose {
    const angle = easeInOut((t - start) / dur) * Math.PI;
    const s = Math.sin(angle);
    return {
        angle,
        faceUp: angle > Math.PI / 2,
        scaleX: Math.max(MIN_SCALE_X, Math.abs(Math.cos(angle))),
        shade: 0.6 * s,
        lift: 1 + 0.08 * s,
        skew: 0.18 * Math.sin(2 * angle),
    };
}

/** A damped spring from 0 to 1, `dt` seconds after release: one overshoot, settled within about half a second. */
export function settle(dt: number): number {
    if (dt <= 0) return 0;
    return 1 - Math.exp(-7 * dt) * Math.cos(14 * dt);
}

export interface CardPose {
    x: number;
    y: number;
    rot: number;
    scale: number;
    alpha: number;
}

/** A card dealt from `from` to `to`: it races there, and its turn and size spring into place. */
export function dealPose(t: number, start: number, dur: number, from: CardPose, to: CardPose): CardPose {
    if (t <= start) return { ...from };
    const p = (t - start) / dur;
    const go = easeOutCubic(p);
    const spring = settle(t - start);
    return {
        x: lerp(from.x, to.x, go),
        y: lerp(from.y, to.y, go),
        rot: lerp(from.rot, to.rot, spring),
        scale: lerp(from.scale, to.scale, spring),
        alpha: clamp01(p * 3) * (to.alpha - from.alpha) + from.alpha,
    };
}

export type Aspect = "tall" | "square" | "wide";

export interface CardStage {
    aspect: Aspect;
    w: number;
    h: number;
    /** Pixels per unit of the 1080 short side. */
    u: number;
    /** Pixels per card unit for the card in play. */
    scale: number;
    /** Where the card in play and the face-down stack under it sit, in pixels. */
    card: { x: number; y: number };
    /** Where the dealt cards pile up, in pixels. */
    pile: { x: number; y: number };
    safe: { top: number; bottom: number };
}

/**
 * Where the card in play goes. 9:16 fills the safe band with it (key text stays clear of the app's buttons) and
 * piles the dealt cards in the band under it; 1:1 and 16:9 set the card right of centre and pile them to its left.
 */
export function cardStage({ w, h }: SceneSize): CardStage {
    const f = sceneFrame(w, h);
    const aspect: Aspect = h / w > 1.3 ? "tall" : w / h > 1.3 ? "wide" : "square";
    if (aspect === "tall") {
        const scale = (f.safe.bottom - f.safe.top) / CARD.h;
        return {
            aspect,
            w,
            h,
            u: f.u,
            scale,
            card: { x: w / 2, y: (f.safe.top + f.safe.bottom) / 2 },
            pile: { x: w / 2, y: f.safe.bottom + (h - f.safe.bottom) * 0.58 },
            safe: f.safe,
        };
    }
    const scale = (0.9 * h) / CARD.h;
    const half = (CARD.w / 2) * scale;
    const x = aspect === "wide" ? w * 0.62 : w - 0.05 * w - half;
    return { aspect, w, h, u: f.u, scale, card: { x, y: h / 2 }, pile: { x: (x - half) / 2, y: h / 2 }, safe: f.safe };
}

/** Size of the face-down stack against the card in play: the flip lifts a card from one to the other. */
export const REST_SCALE = 0.86;

/** Where the face-down stack waits between the tear and each flip; the top card turns over from here. */
export function restPose(st: CardStage): Placement {
    const drop = st.aspect === "tall" ? ((1 - REST_SCALE) * CARD.h * st.scale) / 2 : 0;
    return { x: st.card.x, y: st.card.y + drop, rot: -0.02, scale: st.scale * REST_SCALE };
}

/** Card `i` of `n` bursting out of the pack: a fan above it, in card units from the pack's centre. */
export function burstSlot(i: number, n: number): { x: number; y: number; rot: number } {
    const R = 760;
    if (n <= 1) return { x: 0, y: -R, rot: 0 };
    const rot = (i / (n - 1) - 0.5) * Math.min(1.1, 0.26 * (n - 1));
    return { x: R * Math.sin(rot), y: -R * Math.cos(rot), rot };
}

/** Where dealt card `i` lands on the pile, in units of the short side from `CardStage.pile`. */
export function pileSlot(i: number, aspect: Aspect): { x: number; y: number; rot: number } {
    const r = seeded(7919 * (i + 1) + 13);
    const jx = (r() - 0.5) * 40;
    const jy = (r() - 0.5) * 30;
    const rot = (r() - 0.5) * 0.3;
    if (aspect === "tall") return { x: ((i % 6) - 2.5) * 168 + jx, y: Math.floor(i / 6) * 70 + jy, rot };
    return { x: jx + (i % 2 ? 50 : -50), y: (i - 2) * 150 + jy, rot };
}

/** Cards still face down under card `index` of the deal, the chase included. */
export function stackDepth(index: number, cards: number, chase: boolean): number {
    return Math.max(0, cards - 1 - index + (chase ? 1 : 0));
}

export interface RarityStyle {
    /** Frame foil, light to dark, swept with the card's tilt. */
    frame: readonly string[];
    panel: string;
    panelDeep: string;
    accent: string;
    ink: string;
    muted: string;
    /** Diamonds in the corner. */
    pips: number;
    /** How strongly the foil catches the light, 0 to 1. */
    shine: number;
    /** The art window's backing. */
    pattern: "dots" | "lines" | "rays" | "burst" | "prism";
}

const RARITY: Record<Rarity, RarityStyle> = {
    common: {
        frame: ["#5b6068", "#c9ced6", "#7c828b", "#e9edf2", "#5b6068"],
        panel: "#1b1e24",
        panelDeep: "#0d0f13",
        accent: "#c9d1db",
        ink: "#f2f4f7",
        muted: "#9aa3ad",
        pips: 1,
        shine: 0.15,
        pattern: "dots",
    },
    uncommon: {
        frame: ["#2f5a48", "#9fe3c2", "#3f7a61", "#d9fbe9", "#2f5a48"],
        panel: "#10231c",
        panelDeep: "#07130e",
        accent: "#86e2b4",
        ink: "#effbf4",
        muted: "#93c2aa",
        pips: 2,
        shine: 0.35,
        pattern: "lines",
    },
    rare: {
        frame: ["#22386e", "#9cc2ff", "#3557a8", "#e3eeff", "#22386e"],
        panel: "#0f1a36",
        panelDeep: "#070d1f",
        accent: "#9cc2ff",
        ink: "#f1f6ff",
        muted: "#9fb3d9",
        pips: 3,
        shine: 0.6,
        pattern: "rays",
    },
    gold: {
        frame: ["#6e4f14", "#f7e7ae", "#b88a33", "#fff6d0", "#7d5a17"],
        panel: "#22180a",
        panelDeep: "#120c04",
        accent: "#f1d688",
        ink: "#fff6dc",
        muted: "#d2b77a",
        pips: 4,
        shine: 0.85,
        pattern: "burst",
    },
    holo: {
        frame: ["#ff8fd0", "#ffd77a", "#8dffcf", "#7fd0ff", "#c49bff"],
        panel: "#140d22",
        panelDeep: "#090512",
        accent: "#ffffff",
        ink: "#ffffff",
        muted: "#d7c8f0",
        pips: 5,
        shine: 1,
        pattern: "prism",
    },
};

export function rarityOf(r: Rarity): RarityStyle {
    return RARITY[r];
}

export function cardPath(ctx: Ctx, inset = 0): void {
    ctx.beginPath();
    ctx.roundRect(
        -CARD.w / 2 + inset,
        -CARD.h / 2 + inset,
        CARD.w - 2 * inset,
        CARD.h - 2 * inset,
        Math.max(4, CARD.r - inset),
    );
}

/** The frame's foil, its shine sliding with `tilt` (-1 to 1). */
function frameFoil(ctx: Ctx, style: RarityStyle, tilt: number): CanvasGradient {
    const off = tilt * 260;
    const g = ctx.createLinearGradient(-CARD.w / 2 + off, -CARD.h / 2, CARD.w / 2 + off, CARD.h / 2);
    const n = style.frame.length;
    style.frame.forEach((c, i) => g.addColorStop(i / (n - 1), c));
    return g;
}

/** A light streak across the whole card, where `tilt` puts it; brighter on a richer rarity. */
export function drawGlare(ctx: Ctx, tilt: number, strength: number): void {
    if (strength <= 0) return;
    ctx.save();
    cardPath(ctx);
    ctx.clip();
    ctx.globalCompositeOperation = "screen";
    const x = tilt * CARD.w * 0.9;
    const g = ctx.createLinearGradient(x - 260, -CARD.h / 2, x + 260, CARD.h / 2);
    g.addColorStop(0, "rgb(255 255 255 / 0)");
    g.addColorStop(0.47, `rgb(255 255 255 / ${0.05 * strength})`);
    g.addColorStop(0.5, `rgb(255 255 255 / ${0.28 * strength})`);
    g.addColorStop(0.53, `rgb(255 255 255 / ${0.05 * strength})`);
    g.addColorStop(1, "rgb(255 255 255 / 0)");
    ctx.fillStyle = g;
    ctx.fillRect(-CARD.w / 2, -CARD.h / 2, CARD.w, CARD.h);
    ctx.restore();
}

function pip(ctx: Ctx, x: number, y: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.7, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.7, y);
    ctx.closePath();
}

export interface FaceText {
    name: string;
    line: string;
    flavor: string;
    label: string;
}

export function faceText(deck: Deck, card: Card): FaceText {
    return {
        name: say(deck, card.name),
        line: say(deck, card.line),
        flavor: say(deck, card.flavor),
        label: say(deck, card.label),
    };
}

/** Type sizes on the face, in card units: at 9:16 they are pixels at 1080 wide (headline 96, body 44 and up). */
export const FACE_PX = { name: 96, nameLead: 90, line: 52, lineLead: 60, flavor: 44, flavorLead: 52 } as const;

export interface FaceLayout {
    name: string[];
    line: string[];
    flavor: string[];
    nameTop: number;
    art: { x: number; y: number; w: number; h: number };
    lineTop: number;
    flavorTop: number;
}

const INNER = CARD.w / 2 - CARD.border;
const TEXT_W = CARD.w - 2 * (CARD.border + 34);
const FOOT = 44;

/** Lines and boxes of a face: the name on top, the art taking what the text leaves, the line and flavor below. */
export function faceLayout(ctx: Ctx, text: FaceText, fonts: SceneAssets["fonts"]): FaceLayout {
    setFont(ctx, { family: fonts.display, weight: 700, px: FACE_PX.name, track: 0.02 });
    const name = wrap(ctx, text.name.toUpperCase(), TEXT_W).slice(0, 3);
    setFont(ctx, { family: fonts.body, weight: 600, px: FACE_PX.line });
    const line = wrap(ctx, text.line, TEXT_W).slice(0, 4);
    setFont(ctx, { family: fonts.body, weight: 500, px: FACE_PX.flavor });
    const flavor = text.flavor ? wrap(ctx, text.flavor, TEXT_W).slice(0, 2) : [];
    const top = -CARD.h / 2 + CARD.border;
    const nameTop = top + 26;
    const artY = nameTop + name.length * FACE_PX.nameLead + 22;
    const bottom = CARD.h / 2 - CARD.border - FOOT;
    const textH = line.length * FACE_PX.lineLead + (flavor.length ? 16 + flavor.length * FACE_PX.flavorLead : 0);
    const lineTop = bottom - textH - 18;
    const artH = Math.max(260, lineTop - 24 - artY);
    return {
        name,
        line,
        flavor,
        nameTop,
        art: { x: -INNER + 14, y: artY, w: 2 * (INNER - 14), h: artH },
        lineTop: artY + artH + 24,
        flavorTop: artY + artH + 24 + line.length * FACE_PX.lineLead + 16,
    };
}

export interface FaceState {
    /** Seconds since the face turned up; drives the art's own reveal and the count-up. */
    since: number;
    /** -1 to 1: where the light sits on the foil. */
    tilt: number;
    /** 1 of N, for the set number in the corner. */
    index: number;
    of: number;
}

/** Formats a stat as the card prints it big: a share as a percent, a count as a whole number. */
export function statText(stat: Stat, value: number, locale?: string): string {
    const share = /share|winrate/i.test(stat.source);
    return new Intl.NumberFormat(locale, share ? { style: "percent", maximumFractionDigits: 0 } : {}).format(value);
}

/** The big number in the art window's corner, counting up just after the flip. */
function medallion(
    ctx: Ctx,
    card: Card,
    deck: Deck,
    art: FaceLayout["art"],
    style: RarityStyle,
    state: FaceState,
    fonts: SceneAssets["fonts"],
) {
    const stat = card.stats[0];
    if (!stat) return;
    const k = easeOutCubic((state.since - 0.25) / 0.9);
    const share = /share|winrate/i.test(stat.source);
    const raw = share ? Math.round(stat.value * 100 * k) / 100 : Math.round(stat.value * k);
    const label = statText(stat, raw, deck.locale);
    const full = statText(stat, stat.value, deck.locale);
    setFont(ctx, { family: fonts.pulp, weight: 700, px: 128 });
    const tw = ctx.measureText(full).width;
    const h = 176;
    const w = Math.max(h, tw + 64);
    const pop =
        state.since < 0.25 ? 0 : 1 + 0.18 * Math.exp(-(state.since - 0.25) * 6) * Math.sin((state.since - 0.25) * 20);
    if (pop <= 0) return;
    const cx = art.x + art.w - w / 2 - 18;
    const cy = art.y + art.h - h / 2 - 18;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    ctx.shadowColor = "rgb(0 0 0 / 0.55)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fillStyle = style.panelDeep;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 8;
    ctx.strokeStyle = frameFoil(ctx, style, state.tilt);
    ctx.stroke();
    ctx.fillStyle = style.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "0px";
    ctx.fillText(label, 0, 8);
    ctx.restore();
}

/** The face of `card`, centred on the origin in card units. */
export function drawCardFace(ctx: Ctx, card: Card, deck: Deck, assets: SceneAssets, state: FaceState): void {
    const style = rarityOf(card.rarity);
    const fonts = assets.fonts;
    const text = faceText(deck, card);
    const lay = faceLayout(ctx, text, fonts);

    ctx.save();
    cardPath(ctx);
    ctx.fillStyle = frameFoil(ctx, style, state.tilt);
    ctx.fill();
    cardPath(ctx, CARD.border);
    const body = ctx.createLinearGradient(0, -CARD.h / 2, 0, CARD.h / 2);
    body.addColorStop(0, style.panel);
    body.addColorStop(1, style.panelDeep);
    ctx.fillStyle = body;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(lay.art.x, lay.art.y, lay.art.w, lay.art.h, 18);
    ctx.clip();
    drawArt(ctx, { card, deck, assets, rect: lay.art, style, since: state.since, tilt: state.tilt });
    ctx.restore();
    ctx.beginPath();
    ctx.roundRect(lay.art.x, lay.art.y, lay.art.w, lay.art.h, 18);
    ctx.lineWidth = 6;
    ctx.strokeStyle = frameFoil(ctx, style, -state.tilt);
    ctx.stroke();

    const stamp = clamp01((state.since - 0.1) / 0.25);
    ctx.save();
    ctx.globalAlpha = stamp;
    setFont(ctx, { family: fonts.display, weight: 700, px: FACE_PX.name, track: 0.02 });
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    lay.name.forEach((l, i) => {
        const y = lay.nameTop + i * FACE_PX.nameLead + (1 - stamp) * 24;
        ctx.fillStyle = "rgb(0 0 0 / 0.5)";
        ctx.fillText(l, -INNER + 34, y + 4);
        ctx.fillStyle =
            card.rarity === "gold" || card.rarity === "holo" ? frameFoil(ctx, style, state.tilt) : style.ink;
        ctx.fillText(l, -INNER + 34, y);
    });
    ctx.restore();

    for (let i = 0; i < style.pips; i++) {
        pip(ctx, (i - (style.pips - 1) / 2) * 34, CARD.h / 2 - CARD.border - FOOT / 2, 15);
        ctx.fillStyle = frameFoil(ctx, style, state.tilt);
        ctx.fill();
    }

    medallion(ctx, card, deck, lay.art, style, state, fonts);

    const reveal = clamp01((state.since - 0.35) / 0.35);
    ctx.save();
    ctx.globalAlpha = reveal;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    setFont(ctx, { family: fonts.body, weight: 600, px: FACE_PX.line });
    ctx.fillStyle = style.ink;
    lay.line.forEach((l, i) => ctx.fillText(l, -INNER + 34, lay.lineTop + i * FACE_PX.lineLead + (1 - reveal) * 16));
    if (lay.flavor.length) {
        ctx.globalAlpha = clamp01((state.since - 0.6) / 0.35);
        ctx.fillStyle = style.accent;
        ctx.fillRect(-INNER + 34, lay.flavorTop - 10, 80, 3);
        setFont(ctx, { family: fonts.body, weight: 500, px: FACE_PX.flavor });
        ctx.fillStyle = style.muted;
        lay.flavor.forEach((l, i) => ctx.fillText(l, -INNER + 34, lay.flavorTop + i * FACE_PX.flavorLead));
    }
    ctx.restore();

    setFont(ctx, { family: fonts.display, weight: 700, px: 26, track: 0.18 });
    ctx.fillStyle = style.muted;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const foot = CARD.h / 2 - CARD.border - FOOT / 2;
    ctx.fillText(`${state.index} / ${state.of}`, -INNER + 34, foot);
    ctx.textAlign = "right";
    ctx.fillText(`#${deck.video.serial}`, INNER - 34, foot);
    ctx.letterSpacing = "0px";

    if (text.label) insertSash(ctx, text.label, state, fonts);
    ctx.restore();
    drawGlare(ctx, state.tilt, style.shine);
}

/** The insert card's ribbon across its top-right corner. */
function insertSash(ctx: Ctx, label: string, state: FaceState, fonts: SceneAssets["fonts"]) {
    ctx.save();
    cardPath(ctx);
    ctx.clip();
    ctx.translate(CARD.w / 2 - 150, -CARD.h / 2 + 150);
    ctx.rotate(Math.PI / 4);
    const k = clamp01((state.since - 0.5) / 0.3);
    ctx.translate((1 - k) * 400, 0);
    ctx.fillStyle = "#b3261e";
    ctx.shadowColor = "rgb(0 0 0 / 0.5)";
    ctx.shadowBlur = 12;
    ctx.fillRect(-340, -38, 680, 76);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = frameFoil(ctx, rarityOf("gold"), state.tilt);
    ctx.fillRect(-340, -38, 680, 5);
    ctx.fillRect(-340, 33, 680, 5);
    setFont(ctx, { family: fonts.display, weight: 700, px: 44, track: 0.12 });
    const t = label.toUpperCase();
    const w = ctx.measureText(t).width;
    if (w > 300) setFont(ctx, { family: fonts.display, weight: 700, px: (44 * 300) / w, track: 0.12 });
    ctx.fillStyle = "#fff4d6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t, 0, 2);
    ctx.letterSpacing = "0px";
    ctx.restore();
}

/** A guilloche rosette: the engraved pattern of a banknote, for the card back. */
function rosette(ctx: Ctx, r: number, petals: number, turns: number, phase: number): void {
    ctx.beginPath();
    const steps = 360;
    for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const rr = r * (0.72 + 0.28 * Math.cos(petals * a + phase)) * (0.92 + 0.08 * Math.sin(turns * a));
        const x = rr * Math.cos(a);
        const y = rr * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

/** The back every card shares: oxblood and gold, an engraved rosette, the brand seal and the copy number. */
export function drawCardBack(ctx: Ctx, deck: Deck, assets: SceneAssets, tilt: number): void {
    const gold = rarityOf("gold");
    ctx.save();
    cardPath(ctx);
    ctx.fillStyle = frameFoil(ctx, gold, tilt);
    ctx.fill();
    cardPath(ctx, 18);
    const g = ctx.createRadialGradient(0, -80, 40, 0, 0, CARD.h * 0.7);
    g.addColorStop(0, "#5a1720");
    g.addColorStop(0.6, "#2a0a10");
    g.addColorStop(1, "#140407");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    cardPath(ctx, 18);
    ctx.clip();
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 14; i++) {
        rosette(ctx, 330 - i * 18, 12, 36, i * 0.35);
        ctx.strokeStyle = i % 2 ? "#c9a24a" : "#7a5716";
        ctx.stroke();
    }
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#f1d688";
    ctx.lineWidth = 1;
    for (let y = -CARD.h / 2; y < CARD.h / 2; y += 14) {
        ctx.beginPath();
        for (let x = -CARD.w / 2; x <= CARD.w / 2; x += 20) {
            const yy = y + 5 * Math.sin(x / 40 + y / 90);
            if (x === -CARD.w / 2) ctx.moveTo(x, yy);
            else ctx.lineTo(x, yy);
        }
        ctx.stroke();
    }
    ctx.restore();

    ctx.lineWidth = 4;
    ctx.strokeStyle = frameFoil(ctx, gold, -tilt);
    cardPath(ctx, 44);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    cardPath(ctx, 58);
    ctx.stroke();

    ctx.save();
    ctx.translate(0, -70);
    ctx.beginPath();
    ctx.arc(0, 0, 150, 0, Math.PI * 2);
    ctx.fillStyle = "#1a0509";
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = frameFoil(ctx, gold, tilt);
    ctx.stroke();
    const brand = assets.images.brand;
    if (brand) {
        const s = 200 / Math.max(brand.width, brand.height);
        ctx.drawImage(brand, (-brand.width * s) / 2, (-brand.height * s) / 2, brand.width * s, brand.height * s);
    } else {
        setFont(ctx, { family: assets.fonts.display, weight: 700, px: 150 });
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = frameFoil(ctx, gold, tilt);
        ctx.fillText("D+", 0, 8);
    }
    ctx.restore();

    const back = say(deck, deck.video.tear.back);
    if (back) {
        setFont(ctx, { family: assets.fonts.display, weight: 700, px: 48, track: 0.08 });
        const w = ctx.measureText(back).width;
        if (w > 620) setFont(ctx, { family: assets.fonts.display, weight: 700, px: (48 * 620) / w, track: 0.08 });
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = frameFoil(ctx, gold, tilt);
        ctx.fillText(back, 0, 250);
        ctx.letterSpacing = "0px";
    }
    ctx.restore();
    drawGlare(ctx, tilt, 0.7);
}

export interface Placement {
    x: number;
    y: number;
    rot: number;
    /** Pixels per card unit. */
    scale: number;
    alpha?: number;
}

/**
 * One card at `at`, mid flip or flat: the face or the back, squeezed and sheared by the turn, its edge showing
 * when it is near edge on, darkened as it turns away from the light, and a soft shadow under it.
 */
export function drawCard(
    ctx: Ctx,
    at: Placement,
    flip: FlipPose,
    face: () => void,
    back: () => void,
    shadow = 1,
): void {
    if ((at.alpha ?? 1) <= 0) return;
    ctx.save();
    ctx.globalAlpha *= at.alpha ?? 1;
    ctx.translate(at.x, at.y);
    ctx.rotate(at.rot);
    ctx.scale(at.scale * flip.lift, at.scale * flip.lift);
    if (shadow > 0) {
        ctx.save();
        ctx.transform(flip.scaleX, 0, 0, 1, 0, 0);
        ctx.shadowColor = `rgb(0 0 0 / ${0.6 * shadow})`;
        ctx.shadowBlur = 60 * at.scale * flip.lift;
        ctx.shadowOffsetY = (24 + 60 * (flip.lift - 1) * 10) * at.scale;
        cardPath(ctx, 6);
        ctx.fillStyle = "#000";
        ctx.fill();
        ctx.restore();
    }
    ctx.transform(flip.scaleX, flip.skew * flip.scaleX, 0, 1, 0, 0);
    if (flip.scaleX < 0.2) {
        const edge = ((1 - flip.scaleX / 0.2) * 14) / flip.scaleX;
        ctx.fillStyle = "#e9d9a8";
        ctx.fillRect(-edge / 2, -CARD.h / 2 + CARD.r, edge, CARD.h - 2 * CARD.r);
    }
    if (flip.faceUp) face();
    else back();
    if (flip.shade > 0.01) {
        cardPath(ctx);
        ctx.fillStyle = `rgb(0 0 0 / ${flip.shade})`;
        ctx.fill();
    }
    ctx.restore();
}

/** A stack of `depth` face-down cards, their edges stepping down and right under the top one. */
export function drawStack(ctx: Ctx, at: Placement, depth: number, deck: Deck, assets: SceneAssets, tilt: number): void {
    for (let i = Math.min(depth, 6); i >= 1; i--) {
        drawCard(
            ctx,
            { ...at, x: at.x + i * 7 * at.scale, y: at.y + i * 9 * at.scale, rot: at.rot + i * 0.006 },
            flipPose(0, 1, 1),
            () => undefined,
            () => drawCardBack(ctx, deck, assets, tilt),
            i === Math.min(depth, 6) ? 1 : 0,
        );
    }
}

/** The slow sway of a held card: where the light sits on its foil and how far it leans. */
export function holdSway(t: number, seed: number): { tilt: number; rot: number; bob: number } {
    return {
        tilt: Math.sin(t * 0.9 + seed) * 0.8,
        rot: Math.sin(t * 0.7 + seed * 2) * 0.018,
        bob: Math.sin(t * 1.3 + seed) * 6,
    };
}
