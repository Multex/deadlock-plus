<script lang="ts">
    import type { Snippet } from "svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { SLEEVE, SLOT } from "./layout";
    import { flecksAt, type TearFrame } from "./tear";

    let {
        frame,
        at,
        still = false,
        ontear,
        children,
    }: {
        /** `null` while sealed. */
        frame: TearFrame | null;
        /** Milliseconds into the tear, for the flecks. */
        at: number;
        still?: boolean;
        ontear: () => void;
        children: Snippet;
    } = $props();

    const id = $props.id();
    const W = SLEEVE.width;
    const H = SLEEVE.height;
    const TEAR_Y = 72;
    /** The flecks' canvas reaches this far above the bag, where they fly. */
    const SKY = 120;
    const CANVAS_H = SKY + 140;
    const RES = 2;

    const JAG = (() => {
        const pts: string[] = [];
        for (let x = 0, i = 0; x <= W; x += 13, i++) pts.push(`${x} ${TEAR_Y + (i % 2 ? 3.5 : -3.5)}`);
        pts.push(`${W} ${TEAR_Y}`);
        return pts;
    })();
    const STRIP_D = `M0 0 H${W} V${TEAR_Y} L${[...JAG].reverse().join(" L")} Z`;
    const BODY_D = `M${JAG.join(" L")} V${H - 6} Q${W} ${H} ${W - 6} ${H} H6 Q0 ${H} 0 ${H - 6} Z`;
    const HANGER =
        "M357 20 H423 A8 8 0 0 1 423 36 H357 A8 8 0 0 1 357 20 Z M390 28 m-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0";
    const STAR = Array.from({ length: 48 }, (_, i) => {
        const r = i % 2 ? 44 : 50;
        const a = (i / 48) * 2 * Math.PI;
        return `${50 + r * Math.sin(a)},${50 - r * Math.cos(a)}`;
    }).join(" ");

    const pose = (p: { x: number; y: number; rotate: number; opacity: number }) =>
        `transform: translate(${p.x}px, ${p.y}px) rotate(${p.rotate}deg); opacity: ${p.opacity};`;

    let canvas = $state<HTMLCanvasElement | null>(null);

    $effect(() => {
        const ctx = canvas?.getContext("2d");
        if (!ctx || !frame) return;
        ctx.setTransform(RES, 0, 0, RES, 0, 0);
        ctx.clearRect(0, 0, W, CANVAS_H);
        ctx.fillStyle = "#ffffffd9";
        for (const f of flecksAt(at)) {
            if (f.opacity <= 0) continue;
            ctx.save();
            ctx.globalAlpha = f.opacity;
            ctx.translate(f.x + f.w / 2, f.y + SKY + f.h / 2);
            ctx.rotate((f.rotate * Math.PI) / 180);
            ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
            ctx.restore();
        }
    });
</script>

<div class="sleeve" class:sealed={!frame} class:still style="width: {W}px; height: {H}px;">
    <div
        class="slot"
        style="left: {SLOT.x}px; top: {SLOT.y}px;{frame
            ? ` transform: translateY(${frame.slot.y}px) scale(${frame.slot.scale});`
            : ''}"
    >
        {@render children()}
        {#if frame?.flash != null}
            <div class="flash" aria-hidden="true">
                <i style="transform: translateX({frame.flash}%) skewX(-12deg);"></i>
            </div>
        {/if}
    </div>

    <div class="body" aria-hidden="true" style={frame ? pose(frame.body) : undefined}>
        <div class="haze" style="left: {SLOT.x}px; top: {SLOT.y}px;"></div>
        <svg class="film" viewBox="0 0 {W} {H}">
            <defs>
                <linearGradient id="{id}-film" x1="0" y1="0" x2="1" y2="0.35">
                    <stop offset="0" stop-color="#fff" stop-opacity="0.16" />
                    <stop offset="0.22" stop-color="#fff" stop-opacity="0.03" />
                    <stop offset="0.36" stop-color="#fff" stop-opacity="0.22" />
                    <stop offset="0.42" stop-color="#fff" stop-opacity="0.04" />
                    <stop offset="0.7" stop-color="#fff" stop-opacity="0.02" />
                    <stop offset="0.8" stop-color="#fff" stop-opacity="0.14" />
                    <stop offset="1" stop-color="#fff" stop-opacity="0.05" />
                </linearGradient>
                <filter id="{id}-crinkle" x="0" y="0" width="100%" height="100%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.006 0.022" numOctaves="3" seed="7" />
                    <feDiffuseLighting lighting-color="#fff" surfaceScale="3.2" diffuseConstant="1.1">
                        <feDistantLight azimuth="235" elevation="38" />
                    </feDiffuseLighting>
                    <feComponentTransfer><feFuncA type="table" tableValues="0 1" /></feComponentTransfer>
                </filter>
                <clipPath id="{id}-clip"><path d={BODY_D} /></clipPath>
            </defs>
            <path d={BODY_D} fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="3" />
            <path d={BODY_D} fill="url(#{id}-film)" stroke="#fff" stroke-opacity="0.4" stroke-width="1.5" />
            <g clip-path="url(#{id}-clip)">
                <rect width={W} height={H} filter="url(#{id}-crinkle)" opacity="0.09" style="mix-blend-mode: screen" />
                <rect x="0" y="0" width="12" height={H} fill="#fff" opacity="0.12" />
                <rect x={W - 12} y="0" width="12" height={H} fill="#fff" opacity="0.12" />
                <rect x="0" y={H - 14} width={W} height="14" fill="#fff" opacity="0.12" />
                <path
                    d="M150 120 L40 520"
                    stroke="#fff"
                    stroke-opacity="0.18"
                    stroke-width="18"
                    stroke-linecap="round"
                />
                <path
                    d="M720 600 L640 1100"
                    stroke="#fff"
                    stroke-opacity="0.1"
                    stroke-width="30"
                    stroke-linecap="round"
                />
            </g>
        </svg>
        <div class="seal low"><span>{t("dispatch.collectors.sealed")}</span></div>
        <div class="sticker">
            <svg viewBox="0 0 100 100">
                <polygon points={STAR} fill="#b3261e" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="#f1d688" stroke-width="1.6" />
                <circle cx="50" cy="50" r="35" fill="none" stroke="#f1d688" stroke-width="0.6" />
            </svg>
            <span class="s1">{t("dispatch.collectors.sticker_top")}</span>
            <span class="s2">{t("dispatch.collectors.sticker_main")}</span>
            <span class="s3">{t("dispatch.collectors.sticker_note")}</span>
        </div>
    </div>

    <div class="strip" aria-hidden="true" style={frame ? pose(frame.strip) : undefined}>
        <svg class="film" viewBox="0 0 {W} {TEAR_Y + 4}" style="height: {TEAR_Y + 4}px;">
            <defs>
                <linearGradient id="{id}-lip" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="#fff" stop-opacity="0.2" />
                    <stop offset="0.5" stop-color="#fff" stop-opacity="0.08" />
                    <stop offset="1" stop-color="#fff" stop-opacity="0.18" />
                </linearGradient>
            </defs>
            <path d="{STRIP_D} {HANGER}" fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="3" />
            <path
                d="{STRIP_D} {HANGER}"
                fill-rule="evenodd"
                fill="url(#{id}-lip)"
                stroke="#fff"
                stroke-opacity="0.4"
                stroke-width="1.5"
            />
            <rect x="0" y="40" width={W} height="7" fill="#fff" opacity="0.16" />
            <rect x="250" y="34" width="280" height="18" fill="#e8b85a" opacity="0.32" />
        </svg>
        <div class="seal high"><span>{t("dispatch.collectors.sealed")}</span></div>
    </div>

    {#if !frame}
        <div class="perf" aria-hidden="true"></div>
        <Button variant="unstyled" class="tab" onclick={ontear} aria-label={t("dispatch.collectors.tear_label")}>
            <span class="notch"></span>
            <span>{t("dispatch.collectors.tear")}</span>
            <span class="arrow" aria-hidden="true">▸</span>
        </Button>
    {:else}
        <div
            class="rip"
            aria-hidden="true"
            style="transform: scaleX({frame.rip.scaleX}); opacity: {frame.rip.opacity};"
        ></div>
        <canvas
            bind:this={canvas}
            class="flecks"
            aria-hidden="true"
            width={W * RES}
            height={CANVAS_H * RES}
            style="top: {-SKY}px; width: {W}px; height: {CANVAS_H}px;"
        ></canvas>
    {/if}
</div>

<style>
    .sleeve {
        position: relative;
    }
    .slot {
        position: absolute;
        width: 720px;
        height: 1080px;
    }
    .body,
    .strip {
        position: absolute;
        inset: 0;
        pointer-events: none;
        filter: drop-shadow(0 4px 10px #0000002e);
    }
    .strip {
        bottom: auto;
        height: 80px;
        transform-origin: 100% 50%;
    }
    .film {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }
    .haze {
        position: absolute;
        width: 720px;
        height: 1080px;
        background: #ffffff04;
        backdrop-filter: blur(0.5px) saturate(0.92);
    }
    .seal {
        position: absolute;
        top: 50px;
        left: 520px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 190px;
        height: 44px;
        padding: 0 12px;
        overflow: hidden;
        color: #2c2f3b;
        font-family: "Retail Demo", sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        white-space: nowrap;
        background:
            repeating-linear-gradient(60deg, #ffffff47 0 2px, #0000 2px 6px),
            linear-gradient(110deg, #c6c9d6, #ffd6f3 20%, #c9fff0 40%, #d5e2ff 60%, #fff1c7 80%, #c6c9d6);
        border-radius: 22px;
        box-shadow: 0 1px 2px #00000059;
    }
    .seal.high {
        clip-path: inset(0 0 50%);
    }
    .seal.low {
        clip-path: inset(50% 0 0);
    }
    .sticker {
        position: absolute;
        top: 486px;
        left: 566px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 176px;
        height: 176px;
        color: #fbefc2;
        text-align: center;
        text-transform: uppercase;
        filter: drop-shadow(0 3px 4px #00000080);
        transform: rotate(14deg);
    }
    .sticker svg {
        position: absolute;
        inset: 0;
    }
    .sticker span {
        position: relative;
        max-width: 132px;
    }
    .s1 {
        font-family: "Retail Demo", sans-serif;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.14em;
    }
    .s2 {
        color: #ffe7a3;
        font-family: "Valve Pulp", sans-serif;
        font-size: 40px;
        font-weight: 700;
        line-height: 0.95;
    }
    .s3 {
        margin-top: 4px;
        padding: 2px 8px;
        color: #8e1c15;
        font-family: "Retail Demo", sans-serif;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.12em;
        background: #fbefc2;
    }
    .perf {
        position: absolute;
        top: 71px;
        right: 12px;
        left: 40px;
        height: 2px;
        pointer-events: none;
        background: repeating-linear-gradient(90deg, #ffffffbf 0 7px, #0000 7px 13px);
    }
    .sleeve :global(.tab) {
        position: absolute;
        top: 56px;
        left: -14px;
        display: flex;
        gap: 6px;
        align-items: center;
        height: 32px;
        padding: 0 12px 0 10px;
        color: #2b1f07;
        font-family: "Retail Demo", sans-serif;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        white-space: nowrap;
        cursor: pointer;
        background: linear-gradient(#f1d688, #c99a3e);
        border-radius: 4px;
        box-shadow: 0 2px 6px #00000080;
        animation: nudge 2.4s ease-in-out infinite;
    }
    .sleeve :global(.tab:focus-visible) {
        outline: 3px solid #fff3c4;
        outline-offset: 2px;
    }
    .still :global(.tab) {
        animation: none;
    }
    .notch {
        width: 0;
        height: 0;
        border-block: 6px solid #0000;
        border-left: 8px solid #2b1f07;
    }
    @keyframes nudge {
        0%,
        80%,
        to {
            transform: translate(0);
        }
        88% {
            transform: translate(6px);
        }
    }
    .rip {
        position: absolute;
        top: 70px;
        right: 0;
        left: 0;
        height: 4px;
        background: #fff;
        transform-origin: 0 50%;
        box-shadow:
            0 0 10px 2px #ffffffe6,
            0 0 30px 6px #ffe29699;
    }
    .flecks {
        position: absolute;
        left: 0;
        pointer-events: none;
    }
    .flash {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        border-radius: 6px;
    }
    .flash i {
        position: absolute;
        top: -20%;
        bottom: -20%;
        left: 0;
        width: 40%;
        background: linear-gradient(100deg, #0000, #ffe67859 25%, #fffffff2 45%, #8cfff073 60%, #dc8cff59 75%, #0000);
        mix-blend-mode: screen;
    }
</style>
