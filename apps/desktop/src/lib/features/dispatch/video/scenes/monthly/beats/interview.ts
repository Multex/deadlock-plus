import { clamp01, easeInOut, easeOutCubic } from "../../../kit/ease";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import { interviewMoments } from "../data";
import { folioOf, pagePhoto } from "./feature";
import {
    credit,
    deckStyle,
    drawSpread,
    dropCap,
    headlineBlock,
    headStyle,
    INK,
    kicker,
    MARGIN,
    PAGE_BODY,
    PAGE_H,
    PAGE_W,
    readShift,
    rule,
    spreadLayout,
} from "./print";
import { drawBlock, fitBlock, grain, image, imageKeys, say, stage, type Block, type MonthlyDraw } from "./studio";

/** Characters of `text` a typewriter started at `at` has struck by `local`, at `cps` a second. */
export function typedLength(text: string, local: number, at: number, cps: number): number {
    if (local < at) return 0;
    return Math.min(text.length, Math.floor((local - at) * cps + 1e-9));
}

/** Fast enough that any question is typed before its answer lands half a bar later. */
const CPS = 48;
const Q_PX = 66;
const A_PX = 88;
const PAGE_FOOT = PAGE_H - 110;

interface Qa {
    q: Block;
    a: Block;
    /** Width the drop cap takes from the answer's first two lines; 0 without one. */
    cap: number;
    top: number;
    /** Where the answer starts, under its question. */
    aTop: number;
    bottom: number;
}

/** Words onto lines `w` wide, the first `short` lines `cut` narrower to make room for a drop cap. */
export function wrapAround(
    measure: (s: string) => number,
    text: string,
    w: number,
    cut: number,
    short: number,
): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const max = lines.length < short ? w - cut : w;
        const next = line ? `${line} ${word}` : word;
        if (line && measure(next) > max) {
            lines.push(line);
            line = word;
        } else line = next;
    }
    if (line) lines.push(line);
    return lines;
}

const CAP_LINES = 2;

/** The questions in bold sans, the answers in the serif, the first answer opening on a drop cap. */
function layoutQa(ctx: Ctx, d: MonthlyDraw, family: { q: string; a: string }, top: number): Qa[] {
    const data = d.video.beats.m_interview!;
    const w = PAGE_W - 2 * MARGIN;
    const fit = (aPx: number) => {
        let y = top;
        return data.qa.map((x, i) => {
            const q = fitBlock(
                ctx,
                say(d, x.q),
                { family: family.q, weight: 700, fill: d.palette.ink },
                { px: Q_PX, floor: PAGE_BODY, maxW: w, maxLines: 2 },
                1.06,
            );
            const text = say(d, x.a);
            let a = fitBlock(ctx, text, deckStyle(family.a), { px: aPx, floor: PAGE_BODY, maxW: w, maxLines: 4 }, 1.1);
            let cap = 0;
            if (i === 0 && /^\p{L}/u.test(text)) {
                setFont(ctx, { family: family.a, weight: 600, px: a.lineH * 2.3 } as TextStyle);
                cap = ctx.measureText(text[0]!).width + a.lineH * 0.25;
                setFont(ctx, { ...deckStyle(family.a), px: a.px } as TextStyle);
                const lines = wrapAround((str) => ctx.measureText(str).width, text.slice(1), w, cap, CAP_LINES);
                if (lines.length >= CAP_LINES) a = { ...a, lines, height: a.lineH * lines.length };
                else cap = 0;
            }
            const qa = { q, a, cap, top: y, aTop: y + q.height + 14, bottom: y + q.height + 14 + a.height };
            y = qa.bottom + 56;
            return qa;
        });
    };
    let blocks = fit(A_PX);
    if (blocks.at(-1)!.bottom > PAGE_FOOT) blocks = fit(PAGE_BODY);
    return blocks;
}

/** The interview spread: the talent's portrait facing a Q and A page, each answer held long enough to read. */
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
    const sp = spreadLayout(st);
    const bar = assets.timing.barSeconds;
    const fonts = assets.fonts;
    const n = data.qa.length;
    const beat = { id: "m_interview", kind: "monthly" as const, bar: 0, bars: span / bar, presents: [] };
    const moments = data.qa.map((_, i) => interviewMoments(beat, i, n, bar));
    const w = PAGE_W - 2 * MARGIN;
    const tall = st.aspect === "tall";
    const star = d.video.beats.m_flash.heroId;
    const player = String(d.video.beats.m_flash.slate.params.player ?? "");

    const inset = tall ? { x: PAGE_W - MARGIN - 300, y: 90, w: 300, h: 360 } : null;
    const nameW = inset ? w - inset.w - 30 : w;
    const name = headlineBlock(ctx, (player || say(d, data.title)).toUpperCase(), fonts.body, nameW, 2, 170);
    const nameTop = 90 + PAGE_BODY;
    const headBottom = Math.max(nameTop + name.height, inset ? inset.y + inset.h : 0) + 34;
    const blocks = layoutQa(ctx, d, { q: fonts.display, a: fonts.body }, headBottom + 40);

    // On 9:16 the page moves up to each answer as it is asked.
    const shifts = blocks.map((b, i) => readShift(st, sp, i === 0 ? 0 : b.top - 30, b.bottom + 30));
    let shift = shifts[0]!;
    for (let i = 1; i < n; i++)
        shift += (shifts[i]! - shifts[i - 1]!) * easeInOut((local - moments[i]!.question + 0.35) / 0.5);

    const caption = d.print?.labels?.coverStar;
    const starName = star === null ? "" : (d.heroes?.[star]?.name ?? "");
    drawSpread(ctx, st, sp, d, assets, {
        left: (c) => {
            pagePhoto(c, { x: 0, y: 0, w: PAGE_W, h: PAGE_H }, d, assets, star, {
                zoom: 1.05 + 0.05 * easeOutCubic(local / span),
                fy: 0.04,
                backdrop: image(assets, imageKeys.backdrop),
            });
            if (caption && starName) {
                const g = c.createLinearGradient(0, PAGE_H * 0.7, 0, PAGE_H);
                g.addColorStop(0, "rgb(0 0 0 / 0)");
                g.addColorStop(1, "rgb(0 0 0 / 0.6)");
                c.fillStyle = g;
                c.fillRect(0, PAGE_H * 0.7, PAGE_W, PAGE_H * 0.3);
                kicker(c, `${caption} · ${starName}`, MARGIN, PAGE_H - 190, w, fonts.display, d.palette.accent);
            }
            credit(
                c,
                d.print?.brand ? `${d.print.brand} Studio` : "",
                PAGE_W - 44,
                PAGE_H - 120,
                fonts.display,
                "rgb(255 255 255 / 0.7)",
            );
        },
        right: (c) => {
            kicker(c, say(d, data.title), MARGIN, 90, nameW, fonts.display, d.palette.ink, clamp01(local / 0.3));
            drawBlock(c, name, MARGIN, nameTop, headStyle(fonts.body, INK), { reveal: clamp01(local / 0.35) });
            if (inset) {
                pagePhoto(c, inset, d, assets, star, { zoom: 1.2 });
                if (caption) {
                    setFont(c, { family: fonts.display, weight: 700, px: 26, track: 0.14 } as TextStyle);
                    c.fillStyle = "#ffffff";
                    c.textBaseline = "bottom";
                    c.fillText(caption.toUpperCase(), inset.x + 14, inset.y + inset.h - 12, inset.w - 28);
                }
            }
            rule(c, MARGIN, headBottom, w, INK, 4);
            blocks.forEach((b, i) => {
                const m = moments[i]!;
                if (local < m.question - 0.02) return;
                question(c, b.q, say(d, data.qa[i]!.q), MARGIN, b.top, fonts.display, d.palette.ink, local, m.question);
                answer(c, b, MARGIN, fonts.body, say(d, data.qa[i]!.a)[0] ?? "", local - m.answer);
            });
        },
        folio: folioOf(d, "m_interview"),
        section: d.print?.labels?.people ?? "",
        cam: {
            ox: tall ? sp.right.x + sp.right.w / 2 : st.w / 2,
            oy: st.h / 2,
            zoom: 1 + 0.03 * easeInOut(local / span),
            dx: 0,
            dy: shift,
            rot: 0,
        },
    });
    grain(ctx, st, local, 0.05);
}

function question(
    c: Ctx,
    b: Block,
    text: string,
    x: number,
    y: number,
    family: string,
    ink: string,
    local: number,
    at: number,
): void {
    let left = typedLength(text, local, at, CPS);
    const lines = b.lines.map((line) => {
        const shown = line.slice(0, Math.max(0, left));
        left -= line.length + 1;
        return shown;
    });
    drawBlock(c, { ...b, lines }, x, y, { family, weight: 700, fill: ink });
    const typing = typedLength(text, local, at, CPS) < text.length;
    if (typing) {
        let i = 0;
        lines.forEach((l, j) => l.length > 0 && (i = j));
        setFont(c, { family, weight: 700, px: b.px } as TextStyle);
        const lw = c.measureText(lines[i] ?? "").width;
        c.fillStyle = ink;
        c.fillRect(x + lw + 6, y + b.lineH * i + b.lineH * 0.15, b.px * 0.08, b.lineH * 0.75);
    }
}

/** The answer sets in line by line; the first opens on a drop cap in ink. */
function answer(c: Ctx, b: Qa, x: number, family: string, letter: string, since: number): void {
    if (since < 0) return;
    const reveal = clamp01(since / 0.45);
    if (b.cap > 0) {
        c.save();
        c.globalAlpha = easeOutCubic(clamp01(reveal * 2));
        dropCap(c, letter, x, b.aTop, b.a.lineH, family, INK);
        c.restore();
        const top = { ...b.a, lines: b.a.lines.slice(0, CAP_LINES) };
        drawBlock(c, top, x + b.cap, b.aTop, deckStyle(family), { reveal: clamp01(reveal * 1.4) });
        const tail = { ...b.a, lines: b.a.lines.slice(CAP_LINES) };
        drawBlock(c, tail, x, b.aTop + b.a.lineH * CAP_LINES, deckStyle(family), {
            reveal: clamp01(reveal * 1.4 - 0.4),
        });
        return;
    }
    drawBlock(c, b.a, x, b.aTop, deckStyle(family), { reveal });
}
