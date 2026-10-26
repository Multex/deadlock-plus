import { clamp01, easeInOut, easeOutBack, easeOutCubic } from "../../../kit/ease";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Ctx, Rect } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import { folioOf, heroTone, pagePhoto } from "./feature";
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
    readShift,
    spreadLayout,
} from "./print";
import {
    drawBlock,
    fitBlock,
    formatNumber,
    grain,
    greasePencil,
    image,
    imageKeys,
    mix,
    PENCIL,
    say,
    stage,
    type MonthlyDraw,
} from "./studio";

/** A cloth swatch cut with pinking shears: the hero's colour, a twill weave and a zigzag edge all round. */
function swatch(ctx: Ctx, r: Rect, colour: string, seed: number): void {
    const tooth = 14;
    ctx.save();
    ctx.beginPath();
    const edge = (x0: number, y0: number, x1: number, y1: number) => {
        const len = Math.hypot(x1 - x0, y1 - y0);
        const n = Math.max(2, Math.round(len / tooth));
        const nx = -(y1 - y0) / len;
        const ny = (x1 - x0) / len;
        for (let i = 0; i <= n; i++) {
            const k = i / n;
            const out = i % 2 ? tooth * 0.45 : 0;
            ctx.lineTo(x0 + (x1 - x0) * k + nx * out, y0 + (y1 - y0) * k + ny * out);
        }
    };
    edge(r.x, r.y, r.x + r.w, r.y);
    edge(r.x + r.w, r.y, r.x + r.w, r.y + r.h);
    edge(r.x + r.w, r.y + r.h, r.x, r.y + r.h);
    edge(r.x, r.y + r.h, r.x, r.y);
    ctx.closePath();
    ctx.shadowColor = "rgb(0 0 0 / 0.35)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    ctx.strokeStyle = "rgb(255 255 255 / 0.12)";
    ctx.lineWidth = 3;
    for (let x = r.x - r.h; x < r.x + r.w; x += 9) {
        ctx.beginPath();
        ctx.moveTo(x, r.y + r.h);
        ctx.lineTo(x + r.h, r.y);
        ctx.stroke();
    }
    ctx.strokeStyle = "rgb(0 0 0 / 0.12)";
    for (let x = r.x - r.h + 4; x < r.x + r.w; x += 9) {
        ctx.beginPath();
        ctx.moveTo(x, r.y + r.h);
        ctx.lineTo(x + r.h, r.y);
        ctx.stroke();
    }
    const light = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    light.addColorStop(0, "rgb(255 255 255 / 0.22)");
    light.addColorStop(0.5 + 0.1 * Math.sin(seed), "rgb(255 255 255 / 0)");
    light.addColorStop(1, "rgb(0 0 0 / 0.2)");
    ctx.fillStyle = light;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();
    // The dressmaker's pin holding it to the page.
    ctx.save();
    ctx.fillStyle = "#c9c4ba";
    ctx.fillRect(r.x + r.w * 0.5 - 2, r.y - 6, 4, 34);
    ctx.fillStyle = PENCIL;
    ctx.beginPath();
    ctx.arc(r.x + r.w * 0.5, r.y - 8, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/** A small tag on a swatch's corner. */
function tag(ctx: Ctx, text: string, x: number, y: number, family: string): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.12);
    setFont(ctx, { family, weight: 700, px: 34, track: 0.12 } as TextStyle);
    const w = ctx.measureText(text).width + 28;
    ctx.fillStyle = "#fbf8f1";
    ctx.shadowColor = "rgb(0 0 0 / 0.3)";
    ctx.shadowBlur = 8;
    ctx.fillRect(-w, -26, w, 52);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = PENCIL;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.fillText(text, -14, 2);
    ctx.restore();
}

/** The fashion pages: the lead look photographed full bleed, the month's rotation pinned up as cloth swatches. */
export function draw(
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const data = d.video.beats.m_wardrobe;
    if (!data) return;
    const st = stage(size);
    const sp = spreadLayout(st);
    const fonts = assets.fonts;
    const beat = assets.timing.barSeconds / 4;
    const labels = d.print?.labels;
    const w = PAGE_W - 2 * MARGIN;
    const star = d.video.beats.m_flash.heroId;
    const lead = data.lead;
    const leadName = d.heroes?.[lead]?.name ?? "";
    const leadLabel = lead === star ? labels?.coverStar : (labels?.newFace ?? labels?.coverStar);

    const title = headlineBlock(ctx, say(d, data.title), fonts.body, w, 2, 150);
    const deck = fitBlock(
        ctx,
        say(d, data.caption),
        deckStyle(fonts.body),
        { px: 66, floor: PAGE_BODY, maxW: w, maxLines: 2 },
        1.1,
    );
    const titleTop = 90 + PAGE_BODY;
    const deckTop = titleTop + title.height + 18;
    const boardTop = deckTop + deck.height + 60;

    const items = data.swatches;
    const cols = 3;
    const gap = 30;
    const tw = (w - gap * (cols - 1)) / cols;
    const rows = Math.ceil(items.length / cols);
    const nameH = 70;
    const room = PAGE_H - 120 - boardTop;
    const fh = Math.max(110, Math.min(tw * 1.1, room / rows - nameH - 40));
    const tile = (i: number): Rect => ({
        x: MARGIN + (i % cols) * (tw + gap),
        y: boardTop + Math.floor(i / cols) * (fh + nameH + 40),
        w: tw,
        h: fh,
    });
    const leadAt = Math.max(
        0,
        items.findIndex((s) => s.heroId === lead),
    );
    const pinAt = (i: number) => beat * 2 + i * beat;
    const ringAt = pinAt(items.length) + beat;
    const lastRow = tile(items.length - 1);
    const shift = readShift(st, sp, deckTop, lastRow.y + lastRow.h + nameH);

    drawSpread(ctx, st, sp, d, assets, {
        left: (c) => {
            pagePhoto(c, { x: 0, y: 0, w: PAGE_W, h: PAGE_H }, d, assets, lead, {
                zoom: 1.08 + 0.05 * easeOutCubic(local / span),
                fy: 0.05,
                backdrop: lead === star ? image(assets, imageKeys.backdrop) : undefined,
            });
            const g = c.createLinearGradient(0, PAGE_H * 0.65, 0, PAGE_H);
            g.addColorStop(0, "rgb(0 0 0 / 0)");
            g.addColorStop(1, "rgb(0 0 0 / 0.6)");
            c.fillStyle = g;
            c.fillRect(0, PAGE_H * 0.65, PAGE_W, PAGE_H * 0.35);
            if (leadLabel) kicker(c, leadLabel, MARGIN, PAGE_H - 280, w, fonts.display, d.palette.accent);
            const nb = headlineBlock(c, leadName.toUpperCase(), fonts.body, w, 1, 150);
            drawBlock(c, nb, MARGIN, PAGE_H - 230, headStyle(fonts.body, "#ffffff"));
            credit(
                c,
                d.print?.brand ? `${d.print.brand} Studio` : "",
                PAGE_W - 44,
                PAGE_H - 330,
                fonts.display,
                "rgb(255 255 255 / 0.7)",
            );
        },
        right: (c) => {
            kicker(c, labels?.rotation ?? "", MARGIN, 90, w, fonts.display, d.palette.ink, clamp01(local / 0.3));
            drawBlock(c, title, MARGIN, titleTop, headStyle(fonts.body, INK), { reveal: clamp01(local / 0.4) });
            drawBlock(c, deck, MARGIN, deckTop, deckStyle(fonts.body), {
                reveal: clamp01((local - beat) / (beat * 2)),
            });
            items.forEach((s, i) => {
                const k = easeOutBack(clamp01((local - pinAt(i)) / 0.3), 1.6);
                if (k <= 0) return;
                const r = tile(i);
                c.save();
                c.globalAlpha = clamp01(k * 1.5);
                c.translate(r.x + r.w / 2, r.y);
                c.rotate((((i * 37) % 7) - 3) * 0.012 + (1 - k) * 0.2);
                c.translate(-(r.x + r.w / 2), -r.y - (1 - k) * 40);
                swatch(c, r, mix(heroTone(d, s.heroId), "#000000", 0.08), i * 1.7);
                if (s.debut && data.debutTag)
                    tag(c, say(d, data.debutTag).toUpperCase(), r.x + r.w + 6, r.y + 26, fonts.display);
                c.restore();
                c.save();
                c.globalAlpha = clamp01(k);
                const name = (d.heroes?.[s.heroId]?.name ?? "").toUpperCase();
                const games = formatNumber(d, s.games.value);
                setFont(c, { family: fonts.body, weight: 600, px: PAGE_BODY * 1.1 } as TextStyle);
                const gw = c.measureText(games).width;
                c.fillStyle = d.palette.ink;
                c.textBaseline = "alphabetic";
                c.textAlign = "right";
                c.fillText(games, r.x + r.w, r.y + r.h + nameH);
                setFont(c, { family: fonts.display, weight: 700, px: PAGE_BODY * 0.8, track: 0.04 } as TextStyle);
                c.fillStyle = i === leadAt ? INK : MUTED;
                c.textAlign = "left";
                c.fillText(name, r.x, r.y + r.h + nameH, r.w - gw - 14);
                c.restore();
            });
            const lt = tile(leadAt);
            greasePencil(
                c,
                lt.x + lt.w / 2,
                lt.y + (lt.h + nameH) / 2,
                lt.w * 0.66,
                (lt.h + nameH) * 0.66,
                lead + 9,
                (local - ringAt) / (beat * 2),
                9,
            );
        },
        folio: folioOf(d, "m_wardrobe"),
        section: labels?.rotation ?? "",
        cam: {
            ox: st.aspect === "tall" ? sp.right.x + sp.right.w / 2 : st.w / 2,
            oy: st.h / 2,
            zoom: 1 + 0.03 * easeInOut(local / span),
            dx: 0,
            dy: shift * easeInOut(clamp01((local - pinAt(3)) / (beat * 3))),
            rot: 0,
        },
    });
    grain(ctx, st, local, 0.05);
}
