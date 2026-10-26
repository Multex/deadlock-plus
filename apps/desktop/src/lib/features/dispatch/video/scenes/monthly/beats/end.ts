import { flashAt } from "../../../kit/beat";
import { clamp01, easeOutBack, easeOutCubic } from "../../../kit/ease";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import {
    BODY_PX,
    drawBlock,
    fitBlock,
    flashOverlay,
    grain,
    greasePencil,
    HEADLINE_PX,
    image,
    imageKeys,
    say,
    stage,
    studioSet,
    tint,
    vignette,
    withCamera,
    type MonthlyDraw,
} from "./studio";

/** The end card: the Deadlock+ mark, the call to action, the address circled in grease pencil. */
export function draw(
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const st = stage(size);
    const u = st.u;
    const bar = assets.timing.barSeconds;
    const fonts = assets.fonts;
    const wide = st.aspect === "wide";

    studioSet(ctx, st, d.palette, {
        backdrop: image(assets, imageKeys.backdrop),
        light: 0.8,
        art: 0.25,
        drift: local / span,
    });
    ctx.fillStyle = tint(d.palette.bg, 0.55);
    ctx.fillRect(0, 0, st.w, st.h);

    const ctaStyle = { family: fonts.display, weight: 700, fill: d.palette.fg };
    const cta = fitBlock(
        ctx,
        say(d, d.video.beats.m_end.cta).toUpperCase(),
        ctaStyle,
        {
            px: (wide ? 130 : 140) * u,
            floor: HEADLINE_PX * u,
            maxW: st.w - 2 * st.m,
            maxLines: 2,
        },
        0.95,
    );
    const site = d.print?.site ?? "deadlockplus.app";
    const urlPx = 64 * u;
    const mark = image(assets, imageKeys.brand);
    const markH = (wide ? 170 : 220) * u;
    const gap = 50 * u;
    const total = markH + gap + cta.height + gap + urlPx * 1.3;
    const mid = st.aspect === "tall" ? (st.safe.top + st.safe.bottom) / 2 : st.h / 2;
    const top = mid - total / 2;

    const zoom = 1.06 - 0.06 * easeOutCubic(local / span);
    withCamera(ctx, { ox: st.w / 2, oy: mid, zoom }, () => {
        const mk = easeOutBack(clamp01(local / 0.4), 1.8);
        if (mark) {
            const mw = (mark.width / mark.height) * markH;
            ctx.save();
            ctx.globalAlpha = clamp01(local / 0.15);
            ctx.translate(st.w / 2, top + markH / 2);
            ctx.scale(0.6 + 0.4 * mk, 0.6 + 0.4 * mk);
            ctx.shadowColor = "rgb(0 0 0 / 0.45)";
            ctx.shadowBlur = 30 * u;
            ctx.drawImage(mark, -mw / 2, -markH / 2, mw, markH);
            ctx.restore();
        } else {
            const px = markH * 0.6;
            ctx.save();
            setFont(ctx, { family: fonts.display, weight: 700, px } as TextStyle, px);
            ctx.fillStyle = d.palette.accent;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("Deadlock+", st.w / 2, top + markH / 2);
            ctx.restore();
        }
        const ctaTop = top + markH + gap;
        drawBlock(ctx, cta, st.w / 2, ctaTop, ctaStyle, {
            align: "center",
            reveal: clamp01((local - bar * 0.25) / (bar * 0.3)),
            shadow: "rgb(0 0 0 / 0.5)",
        });
        const urlY = ctaTop + cta.height + gap + urlPx * 0.5;
        const uk = clamp01((local - bar * 0.5) / 0.25);
        if (uk > 0) {
            ctx.save();
            ctx.globalAlpha = uk;
            setFont(
                ctx,
                { family: fonts.display, weight: 700, px: Math.max(BODY_PX * u, urlPx), track: 0.04 } as TextStyle,
                urlPx,
            );
            ctx.fillStyle = d.palette.accent;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "rgb(0 0 0 / 0.5)";
            ctx.shadowBlur = 12 * u;
            ctx.fillText(site, st.w / 2, urlY);
            const w = ctx.measureText(site).width;
            ctx.restore();
            greasePencil(
                ctx,
                st.w / 2,
                urlY,
                w * 0.62,
                urlPx * 0.95,
                211,
                clamp01((local - bar * 0.75) / (bar * 0.5)),
                9 * u,
            );
        }
    });
    vignette(ctx, st, 0.45);
    grain(ctx, st, local, 0.06);
    flashOverlay(ctx, st, flashAt(local, 0) * 0.7);
}
