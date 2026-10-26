import { feathered } from "../../../kit/bitmap";
import { clamp01, easeInOut, easeOutBack, easeOutCubic } from "../../../kit/ease";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Ctx, Rect } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import { interviewMoments } from "../data";
import {
    BODY_PX,
    drawBlock,
    fitBlock,
    grain,
    HEADLINE_PX,
    heroPhoto,
    image,
    imageKeys,
    mix,
    PAPER,
    PENCIL,
    photoPrint,
    say,
    stage,
    vignette,
    withCamera,
    type Block,
    type MonthlyDraw,
    type Stage,
} from "./studio";

/** Characters of `text` a typewriter started at `at` has struck by `local`, at `cps` a second. */
export function typedLength(text: string, local: number, at: number, cps: number): number {
    if (local < at) return 0;
    return Math.min(text.length, Math.floor((local - at) * cps + 1e-9));
}

const CPS = 34;
const INK = "#1a1612";

export interface InterviewLayout {
    head: Rect;
    photo: Rect;
    /** The column the questions and answers run down. */
    column: Rect;
    /** Where the current answer's question sits once the page has scrolled to it. */
    slot: number;
}

export function interviewLayout(st: Stage, headH: number): InterviewLayout {
    const { u, m, w, h, safe } = st;
    if (st.aspect === "wide") {
        const pw = w * 0.34;
        return {
            head: { x: pw + m * 1.6, y: m * 0.9, w: w - pw - m * 2.6, h: headH },
            photo: { x: m, y: m * 0.9, w: pw, h: h - m * 1.8 },
            column: {
                x: pw + m * 1.6,
                y: m * 0.9 + headH + 40 * u,
                w: w - pw - m * 2.6,
                h: h - m * 1.8 - headH - 40 * u,
            },
            slot: m * 0.9 + headH + 60 * u,
        };
    }
    const tall = st.aspect === "tall";
    const top = tall ? safe.top + 10 * u : m * 0.8;
    // The portrait hangs off the foot of the page, under the words.
    // 9:16: the portrait hangs off the foot of the page, under the words. 1:1: it is pinned beside the head.
    const pw = (tall ? 600 : 280) * u;
    const ph = pw * 1.3;
    const colTop = top + Math.max(headH + 60 * u, tall ? 0 : ph * 0.85);
    const bottom = tall ? safe.bottom : h - m * 0.6;
    return {
        head: { x: m, y: top, w: tall ? w - 2 * m : w - 2 * m - pw, h: headH },
        photo: { x: w - pw - m * 0.4, y: tall ? bottom - 60 * u : top - 20 * u, w: pw, h: ph },
        column: { x: m, y: colTop, w: w - 2 * m, h: bottom - colTop },
        slot: colTop + 20 * u,
    };
}

interface Qa {
    q: Block;
    a: Block;
    h: number;
}

/** The interview spread: questions typed on the tick, each answer landing as a pull quote, the page scrolling on. */
export function draw(
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const data = d.video.beats.m_interview;
    if (!data) return;
    const st = stage(size);
    const u = st.u;
    const bar = assets.timing.barSeconds;
    const fonts = assets.fonts;
    const n = data.qa.length;
    const beat = { id: "m_interview", kind: "monthly" as const, bar: 0, bars: span / bar, presents: [] };
    const moments = data.qa.map((_, i) => interviewMoments(beat, i, n, bar));

    const headStyle = { family: fonts.display, weight: 700, fill: INK };
    const wide = st.aspect === "wide";
    const head = fitBlock(
        ctx,
        say(d, data.title).toUpperCase(),
        headStyle,
        {
            px: (wide ? 110 : 120) * u,
            floor: HEADLINE_PX * u,
            maxW: wide ? st.w * 0.6 - st.m * 2.6 : st.aspect === "tall" ? st.w - 2 * st.m : st.w - 2 * st.m - 300 * u,
            maxLines: 2,
        },
        0.95,
    );
    const lay = interviewLayout(st, head.height);
    const qStyle = { family: fonts.body, weight: 600, fill: mix(INK, "#ffffff", 0.25) };
    const aStyle = { family: fonts.display, weight: 700, fill: INK };
    const quoteIndent = 70 * u;
    const blocks: Qa[] = data.qa.map((x) => {
        const q = fitBlock(ctx, say(d, x.q), qStyle, {
            px: 54 * u,
            floor: BODY_PX * u,
            maxW: lay.column.w - 80 * u,
            maxLines: 2,
        });
        const a = fitBlock(
            ctx,
            say(d, x.a),
            aStyle,
            {
                px: (wide ? 92 : 100) * u,
                floor: 58 * u,
                maxW: lay.column.w - quoteIndent,
                maxLines: 3,
            },
            1.0,
        );
        return { q, a, h: q.height + 24 * u + a.height + 70 * u };
    });
    const tops: number[] = [];
    blocks.reduce((y, b, i) => ((tops[i] = y), y + b.h), 0);
    // The answers stack down the page; it scrolls only when the next one would run past the column's foot.
    const room = lay.column.h - 20 * u;
    const need = blocks.map((b, i) => Math.max(0, tops[i]! + b.h - 50 * u - room));
    let scroll = 0;
    for (let i = 1; i < n; i++)
        scroll += (need[i]! - need[i - 1]!) * easeInOut((local - moments[i]!.question + 0.3) / 0.38);

    // The page: cream paper with a coloured band under the head, a little off square, drifting.
    const drift = local / span;
    withCamera(ctx, { ox: st.w / 2, oy: st.h / 2, zoom: 1.03 - 0.03 * drift, rot: -0.008 + 0.012 * drift }, () => {
        ctx.fillStyle = PAPER;
        ctx.fillRect(-st.w * 0.1, -st.h * 0.1, st.w * 1.2, st.h * 1.2);
        const fold = ctx.createLinearGradient(0, 0, st.w, 0);
        fold.addColorStop(0, "rgb(0 0 0 / 0.12)");
        fold.addColorStop(0.06, "rgb(0 0 0 / 0)");
        fold.addColorStop(0.94, "rgb(0 0 0 / 0)");
        fold.addColorStop(1, "rgb(0 0 0 / 0.1)");
        ctx.fillStyle = fold;
        ctx.fillRect(0, 0, st.w, st.h);

        const star = d.video.beats.m_flash.heroId;
        const art =
            star === null ? undefined : (image(assets, imageKeys.gloat(star)) ?? image(assets, imageKeys.hero(star)));
        const pk = easeOutBack(clamp01(local / 0.45));
        const pr = lay.photo;
        withCamera(
            ctx,
            { ox: pr.x + pr.w / 2, oy: pr.y + pr.h / 2, zoom: 0.8 + 0.2 * pk, rot: (wide ? -0.02 : 0.05) * pk },
            () => {
                photoPrint(
                    ctx,
                    pr,
                    (r) => {
                        heroPhoto(ctx, r, undefined, d.palette.glow);
                        if (art) {
                            const c = Math.max(r.w / art.width, r.h / art.height) * 1.02;
                            ctx.drawImage(
                                feathered(art),
                                r.x + (r.w - art.width * c) / 2,
                                r.y + r.h * 0.04,
                                art.width * c,
                                art.height * c,
                            );
                        }
                    },
                    { border: 16 * u, shadow: 26 * u, sheen: clamp01(local / span) },
                );
                ctx.save();
                ctx.fillStyle = "rgb(230 225 210 / 0.75)";
                ctx.translate(pr.x + pr.w / 2, pr.y);
                ctx.rotate(-0.05);
                ctx.fillRect(-60 * u, -18 * u, 120 * u, 40 * u);
                ctx.restore();
            },
        );
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, lay.column.y - 4 * u, st.w, st.h);
        ctx.clip();
        blocks.forEach((b, i) => {
            const m = moments[i]!;
            if (local < m.question - 0.05) return;
            const y = lay.slot + tops[i]! - scroll;
            const fade = i < n - 1 ? 1 - 0.45 * clamp01((local - moments[i + 1]!.question) / 0.4) : 1;
            ctx.save();
            ctx.globalAlpha = fade;
            question(
                ctx,
                b.q,
                say(d, data.qa[i]!.q),
                lay.column.x,
                y,
                qStyle,
                local,
                m.question,
                fonts.display,
                d.palette.bg,
                u,
            );
            answer(
                ctx,
                b.a,
                lay.column.x,
                y + b.q.height + 24 * u,
                aStyle,
                local - m.answer,
                quoteIndent,
                u,
                fonts.display,
            );
            ctx.restore();
        });
        // Answers scrolled up fade into the paper under the head instead of being cut mid-letter.
        const fadeTop = lay.column.y - 4 * u;
        const veil = ctx.createLinearGradient(0, fadeTop, 0, fadeTop + 90 * u);
        veil.addColorStop(0, PAPER);
        veil.addColorStop(1, mix(PAPER, PAPER, 0, 0));
        ctx.fillStyle = veil;
        ctx.fillRect(0, fadeTop, st.w, 90 * u);
        ctx.restore();

        const band = lay.head.y + head.height + 20 * u;
        ctx.fillStyle = d.palette.bg;
        ctx.fillRect(lay.head.x, band, lay.head.w, 8 * u);
        drawBlock(ctx, head, lay.head.x, lay.head.y, headStyle, { reveal: 0.3 + 0.7 * clamp01(local / (bar * 0.3)) });
    });
    vignette(ctx, st, 0.25);
    grain(ctx, st, local, 0.06);
}

function question(
    ctx: Ctx,
    b: Block,
    text: string,
    x: number,
    y: number,
    style: Omit<TextStyle, "px">,
    local: number,
    at: number,
    family: string,
    mark: string,
    u: number,
): void {
    let left = typedLength(text, local, at, CPS);
    const lines = b.lines.map((line) => {
        const shown = line.slice(0, Math.max(0, left));
        left -= line.length + 1;
        return shown;
    });
    ctx.save();
    setFont(ctx, { family, weight: 700, px: b.px } as TextStyle, b.px);
    ctx.fillStyle = mark;
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Q", x, y + b.lineH * 0.8);
    ctx.restore();
    drawBlock(ctx, { ...b, lines }, x + 64 * u, y, style);
    const typing = local >= at && typedLength(text, local, at, CPS) < text.length;
    const blink = typing || Math.floor((local - at) * 3) % 2 === 0;
    if (local >= at && blink) {
        let i = 0;
        lines.forEach((l, j) => l.length > 0 && (i = j));
        setFont(ctx, { ...style, px: b.px } as TextStyle, b.px);
        const w = ctx.measureText(lines[i] ?? "").width;
        ctx.fillStyle = mark;
        ctx.fillRect(x + 64 * u + w + 6 * u, y + b.lineH * i + b.lineH * 0.15, b.px * 0.08, b.lineH * 0.75);
    }
}

function answer(
    ctx: Ctx,
    b: Block,
    x: number,
    y: number,
    style: Omit<TextStyle, "px">,
    since: number,
    indent: number,
    u: number,
    family: string,
): void {
    if (since < 0) return;
    const k = easeOutCubic(since / 0.22);
    const pop = 1.12 - 0.12 * easeOutBack(clamp01(since / 0.3));
    ctx.save();
    ctx.globalAlpha *= k;
    const qpx = b.px * 2.2;
    setFont(ctx, { family, weight: 700, px: qpx } as TextStyle, qpx);
    ctx.fillStyle = PENCIL;
    ctx.textBaseline = "top";
    ctx.fillText("“", x - 6 * u, y - qpx * 0.12);
    withCamera(ctx, { ox: x + indent, oy: y, zoom: pop }, () => drawBlock(ctx, b, x + indent, y, style));
    ctx.fillStyle = PENCIL;
    ctx.fillRect(x + indent, y + b.height + 14 * u, Math.min(240 * u, b.px * 3) * k, 6 * u);
    ctx.restore();
}
