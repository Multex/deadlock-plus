<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import { ARC_TEXT_LENGTH } from "./model";
    import { shrink } from "./shrink";
    import type { Pose } from "./tear";
    import type { CollectorsView } from "./view";

    let {
        v,
        still = false,
        tilt = true,
        plate = null,
    }: {
        v: CollectorsView;
        /** Reduced motion or an export: no tilt and the foil holds still. */
        still?: boolean;
        tilt?: boolean;
        /** The copy-number plate's pose while it thunks down during the tear. */
        plate?: Pose | null;
    } = $props();

    const id = $props.id();
    const BRAND = "Deadlock+";
    const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);
    const CORNERS = [
        [25, 25, 1, 1],
        [695, 25, -1, 1],
        [25, 1055, 1, -1],
        [695, 1055, -1, -1],
    ] as const;
    const corner = (cx: number, cy: number, sx: number, sy: number) =>
        `M${cx} ${cy + sy * 54} V${cy + sy * 12} Q${cx} ${cy} ${cx + sx * 12} ${cy} H${cx + sx * 54} ` +
        `M${cx + sx * 10} ${cy + sy * 30} L${cx + sx * 30} ${cy + sy * 10}`;

    const title = $derived(t("dispatch.collectors.title"));
    const ribbon = $derived(`${t("dispatch.stamp.collectors")} · ${v.season}`);
    const climbLine = $derived(v.start && v.end ? `${v.start.label} → ${v.end.label}` : "");
    const barX = $derived(v.bars.map((_, i) => v.bars.slice(0, i).reduce((a, b) => a + b, 0) * 2));
    const barW = $derived(v.bars.reduce((a, b) => a + b, 0) * 2);

    let el = $state<HTMLElement | null>(null);

    function move(e: PointerEvent) {
        if (still || !el) return;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        el.style.setProperty("--mx", x.toFixed(3));
        el.style.setProperty("--my", y.toFixed(3));
        el.style.setProperty("--hover", "1");
        if (tilt) {
            el.style.setProperty("--ry", `${((x - 0.5) * 9).toFixed(2)}deg`);
            el.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
        }
    }

    function leave() {
        for (const name of ["--mx", "--my", "--rx", "--ry", "--hover"]) el?.style.removeProperty(name);
    }
</script>

<div
    bind:this={el}
    class="cover"
    class:still
    style="--tier: {v.peak?.color ?? '#8a6aa8'};"
    role="img"
    aria-label={t("dispatch.collectors.cover_label", { season: v.season, rank: v.peakName })}
    onpointermove={move}
    onpointerleave={leave}
>
    <div class="bg"></div>
    <div class="rays"></div>
    <div class="grain"></div>
    <svg class="frame" viewBox="0 0 720 1080" aria-hidden="true">
        <defs>
            <linearGradient id="{id}-gold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#7a5716" />
                <stop offset="0.3" stop-color="#f3dc92" />
                <stop offset="0.5" stop-color="#b48731" />
                <stop offset="0.75" stop-color="#f7e8b4" />
                <stop offset="1" stop-color="#8a6420" />
            </linearGradient>
        </defs>
        <rect x="16" y="16" width="688" height="1048" rx="4" fill="none" stroke="url(#{id}-gold)" stroke-width="3" />
        <rect x="25" y="25" width="670" height="1030" rx="2" fill="none" stroke="url(#{id}-gold)" stroke-width="1" />
        {#each CORNERS as [cx, cy, sx, sy] (`${cx}-${cy}`)}
            <path d={corner(cx, cy, sx, sy)} fill="none" stroke="url(#{id}-gold)" stroke-width="3" />
        {/each}
    </svg>

    <header class="mast">
        <span class="brand">{BRAND}</span>
        <h1 class="foil" {@attach shrink(118, 80, title)}>{title}</h1>
    </header>
    <div class="ribbon"><span {@attach shrink(21, 13, ribbon)}>{ribbon}</span></div>

    <div class="star">
        <svg class="medal" viewBox="0 0 460 460" aria-hidden="true">
            <defs>
                <path id="{id}-arc" d="M230 230 m-196 0 a196 196 0 1 1 392 0 a196 196 0 1 1 -392 0" />
                <linearGradient id="{id}-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#8a6420" />
                    <stop offset="0.35" stop-color="#fbeec0" />
                    <stop offset="0.6" stop-color="#b48731" />
                    <stop offset="1" stop-color="#f1d688" />
                </linearGradient>
            </defs>
            <circle cx="230" cy="230" r="224" fill="none" stroke="url(#{id}-ring)" stroke-width="4" />
            <circle cx="230" cy="230" r="178" fill="none" stroke="url(#{id}-ring)" stroke-width="2" />
            {#each TICKS as a (a)}
                <line
                    x1="230"
                    y1="10"
                    x2="230"
                    y2={a % 30 === 0 ? 24 : 17}
                    stroke="url(#{id}-ring)"
                    stroke-width={a % 30 === 0 ? 2.4 : 1.2}
                    transform="rotate({a} 230 230)"
                />
            {/each}
            <text class="arc" textLength={ARC_TEXT_LENGTH - 16} lengthAdjust="spacing">
                <textPath href="#{id}-arc">{v.arc}</textPath>
            </text>
        </svg>
        <div class="glow"></div>
        {#if v.peak?.image}
            <img class="badge" src={v.peak.image} alt="" />
        {/if}
    </div>

    <div class="peak">
        <span class="name foil" {@attach shrink(96, 56, v.peakName)}>{v.peakName}</span>
        <span class="when">{v.peakLine}</span>
    </div>

    <div class="lines">
        <div class="line">
            <span class="k">{t("dispatch.collectors.the_climb")}</span>
            {#if v.start && v.end}
                <span class="v" {@attach shrink(24, 14, climbLine)}>
                    {#if v.start.image}<img src={v.start.image} alt="" />{/if}
                    {v.start.label}
                    <b>→</b>
                    {#if v.end.image}<img src={v.end.image} alt="" />{/if}
                    {v.end.label}
                </span>
            {:else}
                <span class="v">{v.peakName}</span>
            {/if}
        </div>
        <div class="line rec">
            <span class="k">{t("dispatch.collectors.ranked_record")}</span>
            <span class="v big" {@attach shrink(40, 24, v.record)}>{v.record}</span>
        </div>
    </div>

    <footer class="foot">
        <div class="code">
            <svg viewBox="0 0 {barW} 40" preserveAspectRatio="none" aria-hidden="true">
                {#each v.bars as w, i (i)}
                    {#if i % 2 === 0}<rect x={barX[i]} y="0" width={w * 2} height="40" />{/if}
                {/each}
            </svg>
            <span>{v.code}</span>
        </div>
        <div class="teaser">
            <span class="dates">{v.dates}</span>
            <span>{t("dispatch.collectors.teaser")}</span>
        </div>
        <div
            class="plate"
            style={plate
                ? `opacity: ${plate.opacity}; transform: rotate(${plate.rotate}deg) scale(${plate.scale});`
                : undefined}
        >
            <span class="lbl">{t("dispatch.collectors.your_copy")}</span>
            <span class="no"><small>{t("dispatch.collectors.copy_no")}</small>{v.serial}</span>
        </div>
    </footer>

    <div class="holo" aria-hidden="true"></div>
    <div class="glare" aria-hidden="true"></div>
</div>

<style>
    /* The cover prints the same in every app theme: it is a gold-on-black keepsake, not app chrome. */
    .cover {
        --mx: 0.32;
        --my: 0.22;
        --rx: 0deg;
        --ry: 0deg;
        --hover: 0;
        --gold: linear-gradient(
            100deg,
            #6e4f14 0%,
            #c99a3e 12%,
            #f7e7ae 24%,
            #b88a33 38%,
            #e6c56f 52%,
            #fff6d0 60%,
            #9a7425 76%,
            #e6c56f 90%,
            #7d5a17 100%
        );
        --rainbow: linear-gradient(
            115deg,
            #ff8fd0 0%,
            #ffd77a 14%,
            #8dffcf 28%,
            #7fd0ff 42%,
            #c49bff 56%,
            #ff8fd0 70%,
            #ffd77a 84%,
            #8dffcf 100%
        );
        position: relative;
        width: 720px;
        height: 1080px;
        overflow: hidden;
        color: #f4e9cc;
        border-radius: 6px;
        transform: perspective(1600px) rotateX(var(--rx)) rotateY(var(--ry));
        transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
        user-select: none;
        box-shadow:
            inset 0 2px #fff0c814,
            0 30px 60px -20px #000000bf,
            0 10px 22px #00000073;
    }
    .cover:hover {
        transition: transform 80ms linear;
    }
    .cover.still {
        transform: none;
        transition: none;
    }
    .bg {
        position: absolute;
        inset: 0;
        background:
            radial-gradient(circle at 50% 44%, color-mix(in oklab, var(--tier) 62%, #000) 0%, transparent 46%),
            radial-gradient(ellipse at 50% 120%, #7850148c, transparent 55%),
            linear-gradient(180deg, #120d1c 0%, #0a0810 60%, #07060a 100%);
    }
    .rays {
        position: absolute;
        inset: 0;
        background: repeating-conic-gradient(from 2deg at 360px 470px, #ffe29633 0deg 4deg, #0000 4deg 12deg);
        mask-image: radial-gradient(circle at 360px 470px, #000 0 120px, #00000080 260px, #0000 470px);
    }
    .grain {
        position: absolute;
        inset: 0;
        background: repeating-linear-gradient(45deg, #ffffff05 0 2px, #0000 2px 9px);
    }
    .frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }
    .foil {
        background: var(--rainbow), var(--gold);
        background-size:
            300% 100%,
            240% 100%;
        background-position:
            calc(var(--mx) * 100%) 50%,
            calc(var(--mx) * 100%) 50%;
        background-blend-mode: soft-light, normal;
        background-clip: text;
        color: #0000;
        filter: drop-shadow(0 3px #23180399) drop-shadow(0 0 1px #000);
    }
    .mast {
        position: absolute;
        top: 40px;
        right: 0;
        left: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .brand {
        margin-right: -0.5em;
        color: #e9cf86;
        font-family: "Retail Demo", sans-serif;
        font-size: 22px;
        font-weight: 700;
        letter-spacing: 0.5em;
        text-transform: uppercase;
    }
    h1 {
        align-self: stretch;
        margin: -6px 40px 0;
        overflow-x: clip;
        font-family: "Valve Pulp", sans-serif;
        font-size: 118px;
        font-weight: 700;
        line-height: 1;
        letter-spacing: 0.02em;
        text-align: center;
        text-transform: uppercase;
        white-space: nowrap;
    }
    .ribbon {
        position: absolute;
        top: 196px;
        right: -6px;
        left: -6px;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 46px;
        padding: 0 40px;
        color: #f1d688;
        background: linear-gradient(#1b1306, #050403 60%, #1a1207);
        border-block: 2px solid #c9a24a;
        box-shadow:
            0 0 0 1px #000,
            0 6px 14px #00000080;
    }
    .ribbon span {
        min-width: 0;
        overflow-x: clip;
        font-family: "Retail Demo", sans-serif;
        font-size: 21px;
        font-weight: 700;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        white-space: nowrap;
    }
    .star {
        position: absolute;
        top: 248px;
        left: 130px;
        width: 460px;
        height: 460px;
    }
    .medal {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
    }
    .arc {
        fill: #f1d688;
        font-family: "Retail Demo", sans-serif;
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
    }
    .glow {
        position: absolute;
        inset: 70px;
        background: radial-gradient(circle, color-mix(in oklab, var(--tier) 70%, #fff) 0%, transparent 68%);
        border-radius: 50%;
        opacity: 0.55;
        filter: blur(6px);
    }
    .badge {
        position: absolute;
        inset: 40px;
        width: 380px;
        height: 380px;
        object-fit: contain;
        filter: drop-shadow(0 14px 18px #000000a6) drop-shadow(0 0 30px #ffdc9640);
    }
    .peak {
        position: absolute;
        top: 712px;
        right: 40px;
        left: 40px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        align-items: center;
        text-align: center;
    }
    .peak .name {
        align-self: stretch;
        overflow-x: clip;
        font-family: "Valve Pulp", sans-serif;
        font-size: 96px;
        font-weight: 700;
        line-height: 1;
        text-transform: uppercase;
        white-space: nowrap;
    }
    .when {
        color: #eadbb4;
        font-family: "Radiance", serif;
        font-size: 24px;
        font-style: italic;
    }
    .lines {
        position: absolute;
        top: 862px;
        right: 44px;
        left: 44px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 190px;
        border-block: 1px solid #c9a24a99;
    }
    .line {
        display: flex;
        flex-direction: column;
        gap: 4px;
        justify-content: center;
        min-width: 0;
        padding: 10px 4px;
    }
    .line.rec {
        padding-left: 18px;
        border-left: 1px solid #c9a24a99;
    }
    .k {
        color: #c9a24a;
        font-family: "Retail Demo", sans-serif;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
    }
    .v {
        display: flex;
        gap: 6px;
        align-items: center;
        overflow-x: clip;
        color: #f7ecd0;
        font-family: "Retail Demo", sans-serif;
        font-size: 24px;
        font-weight: 600;
        white-space: nowrap;
    }
    .v img {
        flex: none;
        width: 1.4em;
        height: 1.4em;
        object-fit: contain;
    }
    .v b {
        margin: 0 4px;
        color: #f1d688;
    }
    .v.big {
        font-family: "Valve Pulp", sans-serif;
        font-size: 40px;
        font-weight: 700;
        line-height: 1;
    }
    .foot {
        position: absolute;
        right: 44px;
        bottom: 42px;
        left: 44px;
        display: grid;
        grid-template-columns: 132px minmax(0, 1fr) 166px;
        gap: 16px;
        align-items: end;
    }
    .code {
        display: flex;
        flex-direction: column;
        gap: 2px;
        align-items: center;
        padding: 6px 7px 4px;
        color: #111;
        background: #f6efdc;
    }
    .code svg {
        width: 118px;
        height: 40px;
        fill: #111;
    }
    .code span {
        font-family: "Retail Demo", sans-serif;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.08em;
        white-space: nowrap;
    }
    .teaser {
        display: flex;
        flex-direction: column;
        gap: 2px;
        color: #eadbb4;
        font-family: "Radiance", serif;
        font-size: 16px;
        line-height: 1.25;
        text-align: center;
    }
    .dates {
        color: #c9a24a;
        font-family: "Retail Demo", sans-serif;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
    }
    .plate {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 6px 8px 7px;
        background: linear-gradient(#fbf4df, #eadfbf);
        border: 2px solid #b48731;
        transform: rotate(-2deg);
        box-shadow:
            inset 0 0 0 2px #fbf4df,
            inset 0 0 0 3px #b48731;
    }
    .lbl {
        color: #6a4a12;
        font-family: "Retail Demo", sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        white-space: nowrap;
    }
    .no {
        display: flex;
        gap: 4px;
        align-items: baseline;
        color: #b3261e;
        font-family: "Retail Demo", sans-serif;
        font-size: 30px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        line-height: 1.05;
        letter-spacing: 0.06em;
    }
    .no small {
        font-size: 14px;
        letter-spacing: 0;
    }
    .holo {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: repeating-linear-gradient(
                115deg,
                #ff7773 0%,
                #ffed5f 6%,
                #a8ff5f 12%,
                #83fff7 18%,
                #7894ff 24%,
                #d875ff 30%,
                #ff7773 36%
            )
            0 0 / 220% 220%;
        background-position: calc(var(--mx) * 100%) calc(var(--my) * 100%);
        mix-blend-mode: screen;
        opacity: calc(0.1 + var(--hover) * 0.26);
        mask-image: radial-gradient(
            circle at calc(var(--mx) * 100%) calc(var(--my) * 100%),
            #000 0,
            #00000073 38%,
            #00000026 75%
        );
    }
    .glare {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(
            circle at calc(var(--mx) * 100%) calc(var(--my) * 100%),
            #ffffff52,
            #ffffff0f 28%,
            transparent 55%
        );
        mix-blend-mode: overlay;
        opacity: calc(0.6 + var(--hover) * 0.4);
    }
</style>
