import type { Scene } from "../scene";

/** A stand-in that proves the pipeline end to end: the edition's name, a bar that sweeps on every bar line. */
export function placeholderScene(colors: { ground: string; accent: string }): Scene {
    return (ctx, t, { w, h }, { view, images, fonts, timing }) => {
        const k = Math.min(w, h) / 1080;
        ctx.fillStyle = colors.ground;
        ctx.fillRect(0, 0, w, h);

        const brand = images.brand;
        if (brand) ctx.drawImage(brand, (w - 160 * k) / 2, h / 2 - 380 * k, 160 * k, 160 * k);

        ctx.fillStyle = colors.accent;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `700 ${96 * k}px "${fonts.display}"`;
        ctx.fillText(view.masthead.name, w / 2, h / 2 - 120 * k, w - 80 * k);
        ctx.font = `600 ${56 * k}px "${fonts.body}"`;
        ctx.fillText(view.masthead.edition, w / 2, h / 2, w - 80 * k);
        ctx.fillText(view.label, w / 2, h / 2 + 80 * k, w - 80 * k);

        const sweep = (t % timing.barSeconds) / timing.barSeconds;
        const track = w - 160 * k;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(80 * k, h / 2 + 180 * k, track, 24 * k);
        ctx.globalAlpha = 1;
        ctx.fillRect(80 * k, h / 2 + 180 * k, track * sweep, 24 * k);

        ctx.font = `700 ${40 * k}px "${fonts.display}"`;
        ctx.fillText(`${t.toFixed(2)} s`, w / 2, h / 2 + 280 * k);
        ctx.fillText("deadlockplus.app", w / 2, h - 80 * k);
    };
}
