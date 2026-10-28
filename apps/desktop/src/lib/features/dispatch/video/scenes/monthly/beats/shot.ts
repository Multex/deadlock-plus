import { flashAt } from "../../../kit/beat";
import { clamp01, easeInOut, easeOutCubic, lerp } from "../../../kit/ease";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Ctx, Rect } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import type { ShotData } from "../data";
import { monthlyPlan } from "../plan";
import { folioOf, pagePhoto } from "./feature";
import {
    credit,
    deckStyle,
    drawSpread,
    headlineBlock,
    headStyle,
    INK,
    kicker,
    MARGIN,
    MUTED,
    PAGE_BODY,
    PAGE_H,
    PAGE_W,
    pagePoint,
    liveRows,
    rule,
    spreadLayout,
    type PageCamera,
    type Spread,
    withPageCamera,
} from "./print";
import {
    drawBlock,
    fitBlock,
    flashOverlay,
    formatNumber,
    grain,
    greasePencil,
    image,
    imageKeys,
    netWorthCopy,
    PENCIL,
    say,
    sheetLayout,
    stage,
    type MonthlyDraw,
    type Stage,
} from "./studio";
import { onScreen, paintTakes, takesGeometry, takesView, type SheetView } from "./takes";

/** The shortest the 9:16 photograph gets above the words, in page units. */
const MIN_PHOTO = 420;

/** When each part of the shot lands, in seconds into the beat; the shutter is on the second bar line. */
export function shotTimes(bar: number, span: number) {
    const shutter = Math.min(bar, span * 0.4);
    const rest = span - shutter;
    return {
        /** The loupe travels from where the takes left it to the best game's frame. */
        travel: [0, shutter * 0.36] as const,
        pencil: [shutter * 0.3, shutter * 0.7] as const,
        shutter,
        /** The photograph fills the frame, then the camera pulls back to the page it is printed on. */
        pull: [shutter + rest * 0.12, shutter + rest * 0.42] as const,
        kda: shutter + rest * 0.3,
        worth: shutter + rest * 0.42,
        caption: shutter + rest * 0.5,
    };
}

const spans = new WeakMap<MonthlyDraw, Map<number, number>>();

/** Seconds the takes beat runs on this export's grid, so the shot can start from its last frame. */
function takesSpan(d: MonthlyDraw, bars: number, bar: number): number | null {
    let byBars = spans.get(d);
    if (!byBars) spans.set(d, (byBars = new Map()));
    if (!byBars.has(bars)) {
        const plan = monthlyPlan(d.video.cast, bars);
        const i = plan.findIndex((b) => b.id === "m_shot");
        byBars.set(bars, plan[i - 1]?.id === "m_takes" ? plan[i - 1]!.bars : -1);
    }
    const n = byBars.get(bars)!;
    return n > 0 ? n * bar : null;
}

/** The circled frame on the sheet, the shutter, then the frame as the month's best game, printed on its page. */
export function draw(
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const data = d.video.beats.m_shot;
    if (!data) return;
    const st = stage(size);
    const times = shotTimes(assets.timing.barSeconds, span);
    if (local < times.shutter) circle(ctx, st, local, times, data, d, assets);
    else page(ctx, st, local, times, data, d, assets);
    grain(ctx, st, local, 0.06);
    flashOverlay(ctx, st, flashAt(local, times.shutter));
}

/**
 * One continuous camera from the takes: the loupe leaves the busiest day for the best game's frame, the pencil
 * rings it while the loupe lifts away, and the camera keeps pushing in until the shutter.
 */
function circle(
    ctx: Ctx,
    st: Stage,
    local: number,
    times: ReturnType<typeof shotTimes>,
    data: ShotData,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const takes = d.video.beats.m_takes;
    const bar = assets.timing.barSeconds;
    const geo = takes && data.frame !== null ? takesGeometry(ctx, st, d, assets) : null;
    if (!takes || !geo || data.frame === null) {
        loosePrint(ctx, st, local, times, data, d, assets);
        return;
    }
    const prior = takesSpan(d, assets.timing.bars, bar);
    // From the takes' last frame; when the shot opens the video, from the sheet already landed.
    const from = takesView(st, geo, takes.frames.length, takes.loupe, prior ?? 4 * bar, prior ?? 4 * bar, bar);
    const frames = sheetLayout(takes.frames.length, geo.lay.sheet, geo.lay.cols).frames;
    const f = frames[data.frame]!;
    const target = { x: f.x + f.w / 2, y: f.y + f.h / 2 + from.pan };
    const travel = easeInOut((local - times.travel[0]) / (times.travel[1] - times.travel[0]));
    const push = easeInOut((local - times.pencil[0]) / (times.shutter - times.pencil[0]));
    const end = Math.min(3.2, (st.w * (st.aspect === "tall" ? 0.62 : 0.42)) / f.w);
    const focus = { x: lerp(from.focus.x, target.x, travel), y: lerp(from.focus.y, target.y, travel) };
    const centre = { x: st.w / 2, y: st.aspect === "tall" ? st.h * 0.42 : st.h / 2 };
    const at = {
        x: lerp(lerp(from.at.x, target.x, travel), centre.x, push),
        y: lerp(lerp(from.at.y, target.y, travel), centre.y, push),
    };
    const zoom = lerp(from.zoom, end, push ** 1.6);
    // Never pan past the sheet's edge: the light table round it would show.
    const pad = 22 * st.u;
    const sx0 = geo.lay.sheet.x - pad;
    const sx1 = geo.lay.sheet.x + geo.lay.sheet.w + pad;
    const sy0 = geo.lay.sheet.y - pad + from.pan;
    const keep = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    at.x = keep(at.x, st.w - (sx1 - focus.x) * zoom, (focus.x - sx0) * zoom);
    at.y = Math.min(at.y, Math.max(from.at.y, (focus.y - sy0) * zoom));
    const v: SheetView = { ...from, focus, at, zoom, words: 1 - clamp01(local / 0.3) };
    if (from.lens) {
        const s = onScreen(v, target);
        const lift = easeInOut((local - times.pencil[0] - 0.15) / 0.45);
        const lx = lerp(lerp(from.lens.x, s.x, travel), st.w + from.lens.r * 1.6, lift);
        const ly = lerp(lerp(from.lens.y, s.y, travel), s.y + st.h * 0.3, lift);
        v.lens = {
            x: lx,
            y: ly,
            r: from.lens.r,
            look: { x: lerp(from.lens.look.x, s.x, travel), y: lerp(from.lens.look.y, s.y, travel) },
        };
    }
    paintTakes(ctx, st, d, assets, geo, v, 99, () => {
        const pk = (local - times.pencil[0]) / (times.pencil[1] - times.pencil[0]);
        greasePencil(ctx, target.x, target.y, f.w * 0.72, f.h * 0.84, data.heroId + 17, pk, Math.max(4, f.w * 0.06));
        note(
            ctx,
            say(d, data.label),
            target.x - f.w * 0.55,
            target.y + f.h * 1.05,
            f.h * 0.4,
            f.w * 1.3,
            assets.fonts.pulp,
            clamp01((pk - 0.6) / 0.4),
        );
    });
}

/** The editor's note beside the circle, in the same red pencil. */
function note(ctx: Ctx, text: string, x: number, y: number, px: number, maxW: number, family: string, k: number): void {
    if (k <= 0 || !text) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.12);
    setFont(ctx, { family, weight: 700, px } as TextStyle);
    const fit = ctx.measureText(text).width;
    if (fit > maxW) setFont(ctx, { family, weight: 700, px: (px * maxW) / fit } as TextStyle);
    ctx.fillStyle = PENCIL;
    ctx.globalAlpha = 0.92;
    ctx.textBaseline = "middle";
    const w = ctx.measureText(text).width;
    ctx.beginPath();
    ctx.rect(0, -px, w * k, px * 2);
    ctx.clip();
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

/** No sheet to circle on: one loose print on the desk, ringed, then pushed in on. */
function loosePrint(
    ctx: Ctx,
    st: Stage,
    local: number,
    times: ReturnType<typeof shotTimes>,
    data: ShotData,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    ctx.fillStyle = "#14110e";
    ctx.fillRect(0, 0, st.w, st.h);
    const pw = Math.min(st.w, st.h) * 0.55;
    const r = { x: (st.w - pw) / 2, y: (st.h - pw / 1.5) / 2, w: pw, h: pw / 1.5 };
    const push = easeInOut(local / times.shutter);
    const zoom = lerp(1, 1.8, push);
    ctx.save();
    ctx.translate(st.w / 2, st.h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-st.w / 2, -st.h / 2);
    ctx.fillStyle = "#fbf8f1";
    ctx.fillRect(r.x - 14, r.y - 14, r.w + 28, r.h + 28);
    pagePhoto(ctx, r, d, assets, data.heroId, { zoom: 1.1 });
    const pk = (local - times.pencil[0]) / (times.pencil[1] - times.pencil[0]);
    greasePencil(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.62, r.h * 0.7, data.heroId + 17, pk, 8 * st.u);
    ctx.restore();
}

/** The photograph on the page: on 9:16 across the top of the right page down to `bottom`, elsewhere the whole left page. */
function photoRect(st: Stage, bottom: number): Rect {
    return st.aspect === "tall" ? { x: 0, y: 0, w: PAGE_W, h: bottom } : { x: 0, y: 0, w: PAGE_W, h: PAGE_H };
}

/** The camera that shows the photograph filling the frame at `k` = 0 and the page at rest, as laid, at 1. */
function pullCamera(st: Stage, sp: Spread, k: number, ph: Rect): PageCamera {
    const page = st.aspect === "tall" ? sp.right : sp.left;
    const a = pagePoint(page, ph.x, ph.y);
    const b = pagePoint(page, ph.x + ph.w, ph.y + ph.h);
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const fill = Math.max(st.w / (b.x - a.x), st.h / (b.y - a.y)) * 1.02;
    const zoom = Math.exp(lerp(Math.log(fill), 0, k));
    const sx = st.w / 2;
    const sy = st.h / 2;
    return { ox: cx, oy: cy, zoom, dx: lerp(sx - cx, 0, k), dy: lerp(sy - cy, 0, k), rot: 0 };
}

function page(
    ctx: Ctx,
    st: Stage,
    local: number,
    times: ReturnType<typeof shotTimes>,
    data: ShotData,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const sp = spreadLayout(st);
    const fonts = assets.fonts;
    const labels = d.print?.labels;
    const since = local - times.shutter;
    const pull = easeInOut((local - times.pull[0]) / (times.pull[1] - times.pull[0]));
    const tall = st.aspect === "tall";
    const w = PAGE_W - 2 * MARGIN;
    const backdrop = image(assets, imageKeys.heroBackdrop(data.heroId)) ?? image(assets, imageKeys.backdrop);
    const name = (d.heroes?.[data.heroId]?.name ?? "").toUpperCase();
    const photo = (c: Ctx) => {
        const r = photoRect(st, photoBottom);
        pagePhoto(c, r, d, assets, data.heroId, { zoom: 1.12 - 0.08 * easeOutCubic(since / 3), fy: 0.06, backdrop });
        credit(
            c,
            d.print?.brand ? `${d.print.brand} Studio` : "",
            r.x + r.w - 40,
            r.y + r.h - 40,
            fonts.display,
            "rgb(255 255 255 / 0.75)",
        );
    };

    // The words: kicker, the hero, the stat strip, the caption and the net worth, set inside the page's live rows.
    // On 9:16 they stack up from the foot of the live rows and the photograph takes what is left above them.
    const live = liveRows(st, sp);
    const head = headlineBlock(ctx, name, fonts.body, w, 1, tall ? 170 : 200);
    const kda = [data.kda.kills, data.kda.deaths, data.kda.assists].map((v) => formatNumber(d, v));
    const cap = fitBlock(
        ctx,
        say(d, data.caption),
        deckStyle(fonts.body),
        { px: 64, floor: PAGE_BODY, maxW: w, maxLines: tall ? 2 : 3 },
        1.12,
    );
    const kdaH = tall ? 140 : 210;
    const capGap = tall ? 30 : 100;
    const worthH = data.netWorth ? 30 + PAGE_BODY * 0.8 : 0;
    const body = PAGE_BODY + head.height + 20 + kdaH + capGap + cap.height;
    const room = live.bottom - (tall ? 0 : live.top + 20);
    const showWorth = worthH > 0 && (tall ? live.bottom - body - worthH - 50 >= MIN_PHOTO : body + worthH <= room);
    const top = tall ? live.bottom - body - (showWorth ? worthH : 0) : live.top + 20;
    const photoBottom = top - 50;
    const headTop = top + PAGE_BODY;
    const kdaTop = headTop + head.height + 20;
    const capTop = kdaTop + kdaH + capGap;
    const words = (c: Ctx) => {
        const show = (at: number) => clamp01((local - at) / 0.35);
        kicker(c, labels?.bestGame ?? "", MARGIN, top, w, fonts.display, d.palette.ink, show(times.pull[0]));
        drawBlock(c, head, MARGIN, headTop, headStyle(fonts.body, INK), { reveal: show(times.pull[0] + 0.1) });
        statStrip(c, kda, labels, data, d, fonts.display, fonts.body, kdaTop, kdaH, show(times.kda));
        rule(c, MARGIN, capTop - 24, w * show(times.caption), INK, 3);
        drawBlock(c, cap, MARGIN, capTop, deckStyle(fonts.body), { reveal: show(times.caption) });
        if (data.netWorth) {
            const worth = say(d, netWorthCopy(formatNumber(d, data.netWorth.value)));
            const k = show(times.worth);
            if (k > 0 && showWorth) {
                c.save();
                c.globalAlpha = k;
                setFont(c, { family: fonts.display, weight: 700, px: PAGE_BODY * 0.8, track: 0.12 } as TextStyle);
                c.fillStyle = MUTED;
                c.textBaseline = "top";
                c.fillText(worth.toUpperCase(), MARGIN, capTop + cap.height + 30, w);
                c.restore();
            }
        }
    };
    withPageCamera(ctx, pullCamera(st, sp, pull, photoRect(st, photoBottom)), () =>
        drawSpread(ctx, st, sp, d, assets, {
            left: (c) => {
                if (!tall) photo(c);
            },
            right: (c) => {
                if (tall) photo(c);
                words(c);
            },
            folio: folioOf(d, "m_shot"),
            section: labels?.bestGame ?? "",
        }),
    );
}

/** K, D and A as the print sets them: three numbers with their labels under, and the grade when there is one. */
function statStrip(
    c: Ctx,
    kda: string[],
    labels: NonNullable<MonthlyDraw["print"]>["labels"],
    data: ShotData,
    d: MonthlyDraw,
    display: string,
    serif: string,
    top: number,
    h: number,
    k: number,
): void {
    if (k <= 0) return;
    const names = [labels?.kills ?? "", labels?.deaths ?? "", labels?.assists ?? ""];
    const cols = data.grade ? 4 : 3;
    const cw = (PAGE_W - 2 * MARGIN) / cols;
    const px = Math.min(h * 0.72, 130);
    c.save();
    c.globalAlpha = k;
    kda.forEach((v, i) => {
        const x = MARGIN + i * cw;
        setFont(c, { family: serif, weight: 600, px } as TextStyle);
        c.fillStyle = INK;
        c.textBaseline = "alphabetic";
        c.fillText(v, x, top + px * 0.9, cw - 20);
        setFont(c, { family: display, weight: 700, px: 34, track: 0.14 } as TextStyle);
        c.fillStyle = MUTED;
        c.fillText(names[i]!.toUpperCase(), x, top + px * 0.9 + 46, cw - 20);
    });
    if (data.grade) {
        const x = MARGIN + 3 * cw;
        setFont(c, { family: serif, weight: 600, px } as TextStyle);
        c.fillStyle = d.palette.ink;
        c.fillText(data.grade, x, top + px * 0.9, cw - 20);
        setFont(c, { family: display, weight: 700, px: 34, track: 0.14 } as TextStyle);
        c.fillStyle = MUTED;
        c.fillText((labels?.grade ?? "").toUpperCase(), x, top + px * 0.9 + 46, cw - 20);
    }
    c.restore();
}
