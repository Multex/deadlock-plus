<script lang="ts" module>
    import type { Glass } from "./glass";

    // Outside the component, so the window keeps its rain and wiped patches when Settings rebuilds the panel.
    const field: { glass: Glass | null; width: number; height: number } = { glass: null, width: 0, height: 0 };
</script>

<script lang="ts">
    import { onMount } from "svelte";
    import { BUSY_MS, burst, glowSprite, runCanvas, runTicker } from "../../theme-decor-loop";
    import { decorScope } from "../../theme-decor-scope";
    import { between, seeded } from "../../theme-decor-random";
    import { litShare, sky } from "./city";
    import { TURN_STEP_MS, hands, onShift, turnAt } from "./clock";
    import { FOG_CELL, createGlass, stepGlass } from "./glass";
    import { BULB_DROP, HALO, glow, stringLights, wireAt, type Header, type Strand } from "./lights";

    const GLINT_PERIOD = 19_000;
    const GLINT_RUN = 2_600;
    /** Condensation creeps back so slowly that four redraws a second keep up, except while being wiped. */
    const FOG_REDRAW_MS = 250;
    const CITY_REDRAW_MS = 60_000;
    /** The string lights sway slowly enough that ten frames a second keep up. */
    const LIGHTS_MS = 100;
    /** New drops landing and the fog creeping back keep up at ten frames a second while no drop slides. */
    const RAIN_IDLE_MS = 100;
    const LIGHTS_HEIGHT = 200;
    /** The longest step the glass takes at once; a longer gap is walked in steps this size. */
    const GLASS_STEP = 0.05;

    const BOKEH_COLOURS = ["#3c9f99", "#2a7774", "#8dd1c8", "#8dd1c8", "#5cb6ad", "#f0c380"];
    const WINDOW_COLOURS = ["#76c6bb", "#76c6bb", "#4f9f98", "#f0c380"];
    const random = seeded(0x5417);
    const bokeh = Array.from({ length: 90 }, () => ({
        x: random(),
        y: between(random, 0.45, 0.92),
        r: between(random, 4, 15),
        colour: Math.floor(random() * BOKEH_COLOURS.length),
        alpha: between(random, 0.1, 0.32),
        /** On when the share of lit windows is above this. */
        threshold: random(),
    }));
    const streetlamps = Array.from({ length: 7 }, (_, i) => ({
        x: (i + 0.5) / 7 + between(random, -0.03, 0.03),
        y: between(random, 0.86, 0.95),
        r: between(random, 16, 24),
    }));

    function diamond(x: number, y: number, r: number): string {
        return `M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`;
    }

    // The medallion's radiant: long and short rays turning round the ring, and the wheel's spokes inside it.
    const RAYS = Array.from({ length: 32 }, (_, i) => {
        const a = (i / 32) * Math.PI * 2;
        const outer = i % 2 ? 50 : 60;
        const side = 0.045;
        const point = (r: number, da: number) =>
            `${(Math.sin(a + da) * r).toFixed(2)} ${(-Math.cos(a + da) * r).toFixed(2)}`;
        return `M ${point(41, -side)} L ${point(outer, 0)} L ${point(41, side)} Z`;
    }).join(" ");
    const SPOKES = Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return `M ${Math.sin(a) * 20} ${-Math.cos(a) * 20} L ${Math.sin(a) * 33} ${-Math.cos(a) * 33}`;
    }).join(" ");
    const HOURS = Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return diamond(Math.sin(a) * 37, -Math.cos(a) * 37, i % 3 ? 1.6 : 2.6);
    }).join(" ");
    const CORNER_STUDS = [
        diamond(24.5, 24.5, 6),
        diamond(232, 8, 4),
        diamond(8, 162, 4),
        diamond(132, 22, 3),
        diamond(22, 108, 3),
    ].join(" ");

    let { layers = {} }: { layers?: Record<string, boolean> } = $props();
    const rain = $derived(layers.rain !== false);
    const lit = $derived(layers.lights !== false);
    const frames = $derived(layers.frames !== false);
    const clock = $derived(layers.clock !== false);

    let cityCanvas: HTMLCanvasElement;
    let lightsCanvas = $state<HTMLCanvasElement>();
    let fogCanvas = $state<HTMLCanvasElement>();
    let dropsCanvas = $state<HTMLCanvasElement>();
    let turn = $state(turnAt(Date.now()));
    let glinting = $state(false);
    let shift = $state(onShift(new Date()));
    let time = $state(hands(new Date()));

    /** A soft out-of-focus disc, as lights look through a lens focused on the glass. */
    function bokehSprite(colour: string): HTMLCanvasElement {
        const s = document.createElement("canvas");
        s.width = s.height = 64;
        const ctx = s.getContext("2d");
        if (!ctx) return s;
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, colour);
        g.addColorStop(0.8, colour);
        g.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        return s;
    }

    /** A water drop: darker where it bends the light, a bright lower rim, a glint up top. */
    function dropSprite(): HTMLCanvasElement {
        const s = document.createElement("canvas");
        s.width = s.height = 32;
        const ctx = s.getContext("2d");
        if (!ctx) return s;
        ctx.fillStyle = "rgba(0, 10, 11, 0.45)";
        ctx.beginPath();
        ctx.arc(16, 16, 14, 0, Math.PI * 2);
        ctx.fill();
        const rim = ctx.createRadialGradient(16, 22, 2, 16, 18, 15);
        rim.addColorStop(0, "rgba(190, 240, 232, 0.75)");
        rim.addColorStop(1, "rgba(180, 236, 228, 0)");
        ctx.fillStyle = rim;
        ctx.beginPath();
        ctx.arc(16, 16, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(11, 10, 2.6, 0, Math.PI * 2);
        ctx.fill();
        return s;
    }

    /** Both sides of the street running away to a point a little above the middle, their windows lit by the hour. */
    function paintStreet(ctx: CanvasRenderingContext2D, width: number, height: number, share: number) {
        const r = seeded(0x5ee7);
        const vy = height * 0.48;
        for (const side of [-1, 1]) {
            const outer = side < 0 ? 0 : width;
            const inner = width / 2 + side * width * 0.19;
            const roof = [-0.1 * height, vy - height * 0.24];
            const foot = [1.05 * height, vy + height * 0.2];
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = "#000506";
            ctx.beginPath();
            ctx.moveTo(outer, roof[0]!);
            ctx.lineTo(inner, roof[1]!);
            ctx.lineTo(inner, foot[1]!);
            ctx.lineTo(outer, foot[0]!);
            ctx.fill();
            for (let col = 0; col < 9; col++) {
                const u = (col + 0.5) / 9;
                const x = outer + (inner - outer) * u;
                const top = roof[0]! + (roof[1]! - roof[0]!) * u;
                const bottom = foot[0]! + (foot[1]! - foot[0]!) * u;
                const scale = 1 - u * 0.78;
                const rows = 7;
                for (let row = 0; row < rows; row++) {
                    const threshold = r();
                    const colour = WINDOW_COLOURS[Math.floor(r() * WINDOW_COLOURS.length)]!;
                    if (threshold > share) continue;
                    const y = top + ((bottom - top) * (row + 0.5)) / rows;
                    ctx.globalAlpha = 0.5;
                    ctx.fillStyle = colour;
                    ctx.fillRect(x - 9 * scale, y - 12 * scale, 18 * scale, 24 * scale);
                }
            }
        }
        // Blocks closing off the far end of the street.
        for (let x = width * 0.31; x < width * 0.69;) {
            const w = between(r, 30, 70);
            const h = between(r, height * 0.12, height * 0.3);
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = "#000708";
            ctx.fillRect(x, vy + height * 0.18 - h, w, h);
            if (r() < share) {
                ctx.globalAlpha = 0.45;
                ctx.fillStyle = WINDOW_COLOURS[Math.floor(r() * WINDOW_COLOURS.length)]!;
                ctx.fillRect(x + w * 0.3, vy + height * 0.18 - h * 0.7, w * 0.15, h * 0.12);
            }
            x += w + between(r, -4, 6);
        }
    }

    function paintCity(date: Date) {
        const ctx = cityCanvas.getContext("2d");
        if (!ctx) return;
        const width = (cityCanvas.width = Math.max(1, cityCanvas.clientWidth));
        const height = (cityCanvas.height = Math.max(1, cityCanvas.clientHeight));
        const colours = sky(date);
        const air = ctx.createLinearGradient(0, 0, 0, height);
        air.addColorStop(0, colours.top);
        air.addColorStop(0.55, colours.horizon);
        air.addColorStop(1, colours.top);
        ctx.globalAlpha = 1;
        ctx.fillStyle = air;
        ctx.fillRect(0, 0, width, height);

        const share = litShare(date);
        ctx.filter = "blur(7px)";
        paintStreet(ctx, width, height, share);
        ctx.filter = "none";

        const sprites = BOKEH_COLOURS.map(bokehSprite);
        for (const l of bokeh) {
            if (l.threshold > share) continue;
            ctx.globalAlpha = l.alpha;
            const sprite = sprites[l.colour];
            if (sprite) ctx.drawImage(sprite, l.x * width - l.r, l.y * height - l.r, l.r * 2, l.r * 2);
        }
        const lamp = sprites[sprites.length - 1];
        for (const s of streetlamps) {
            ctx.globalAlpha = 0.4;
            if (lamp) ctx.drawImage(lamp, s.x * width - s.r, s.y * height - s.r, s.r * 2, s.r * 2);
        }

        const mist = ctx.createLinearGradient(0, height * 0.5, 0, height);
        mist.addColorStop(0, "rgba(40, 112, 108, 0)");
        mist.addColorStop(0.6, "rgba(40, 112, 108, 0.16)");
        mist.addColorStop(1, "rgba(40, 112, 108, 0.05)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = mist;
        ctx.fillRect(0, height * 0.5, width, height * 0.5);
    }

    onMount(() => {
        paintCity(new Date());
        const resized = new ResizeObserver(() => paintCity(new Date()));
        resized.observe(cityCanvas);
        const city = runTicker(() => {
            paintCity(new Date());
            return CITY_REDRAW_MS;
        });
        return () => {
            city.stop();
            resized.disconnect();
        };
    });

    $effect(() => {
        const canvas = lightsCanvas;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const bulb = glowSprite("#ffe6ae", "#f5a94f", 64, 0.75);
        let strands: Strand[] = [];

        const paint = (now: number) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const strand of strands) {
                ctx.globalAlpha = 1;
                ctx.beginPath();
                for (let i = 0; i <= 40; i++) {
                    const p = wireAt(strand, i / 40, now);
                    if (i) ctx.lineTo(p.x, p.y);
                    else ctx.moveTo(p.x, p.y);
                }
                ctx.strokeStyle = "rgba(240, 195, 128, 0.22)";
                ctx.lineWidth = 1.2;
                ctx.stroke();
                for (const b of strand.bulbs) {
                    const p = wireAt(strand, b.t, now);
                    ctx.globalAlpha = 0.9;
                    ctx.fillStyle = "#4a3820";
                    ctx.fillRect(p.x - 1.5, p.y - 1, 3, b.size * 0.9);
                    const size = b.size * HALO * 2;
                    ctx.globalAlpha = glow(b, now);
                    ctx.drawImage(bulb, p.x - size / 2, p.y + b.size * BULB_DROP - size / 2, size, size);
                }
            }
        };

        const page = decorScope(canvas, document, window);
        const main = page.root;
        // The page's title row on the canvas, measured from the top of the page rather than the scrolled view.
        const header = (): Header | null => {
            const title = main?.querySelector("h1");
            if (!main || !title) return null;
            const box = (title.closest("header") ?? title).getBoundingClientRect();
            const origin = canvas.getBoundingClientRect();
            const top = box.top - origin.top + page.scrollTop();
            if (top >= LIGHTS_HEIGHT) return null;
            return { left: box.left - origin.left, right: box.right - origin.left, top };
        };
        let laidOut = "";
        // Painted on every resize as well, so the lights still hang in the street while motion is reduced.
        const fit = () => {
            const width = Math.max(1, canvas.clientWidth);
            const over = header();
            const key = [width, over?.left, over?.right, over?.top].map((n) => n && Math.round(n)).join();
            if (key === laidOut) return;
            laidOut = key;
            canvas.width = width;
            canvas.height = LIGHTS_HEIGHT;
            strands = stringLights(width, seeded(0x11c7), over);
            paint(Date.now());
        };
        fit();
        const resized = new ResizeObserver(fit);
        resized.observe(canvas);
        // A new page brings its own header. Text updates leave the tree alone, so live pages stay quiet here.
        let refit = 0;
        const paged = new MutationObserver(() => {
            cancelAnimationFrame(refit);
            refit = requestAnimationFrame(fit);
        });
        if (main) paged.observe(main, { childList: true, subtree: true });
        const sway = runTicker((now) => {
            paint(now);
            return LIGHTS_MS;
        });
        return () => {
            sway.stop();
            resized.disconnect();
            paged.disconnect();
            cancelAnimationFrame(refit);
        };
    });

    $effect(() => {
        const fog = fogCanvas;
        const drops = dropsCanvas;
        const fogCtx = fog?.getContext("2d");
        if (!fog || !drops || !fogCtx) return;
        const drop = dropSprite();
        const fogTexture = document.createElement("canvas");
        const glassRandom = seeded(0x7a1);
        let lastFog = 0;
        let lastStep = 0;

        const paintFog = (width: number, height: number) => {
            const glass = field.glass;
            if (!glass) return;
            fogTexture.width = glass.cols;
            fogTexture.height = glass.rows;
            const tctx = fogTexture.getContext("2d");
            if (!tctx) return;
            const image = tctx.createImageData(glass.cols, glass.rows);
            for (let i = 0; i < glass.fog.length; i++) {
                image.data[i * 4] = 84;
                image.data[i * 4 + 1] = 150;
                image.data[i * 4 + 2] = 146;
                image.data[i * 4 + 3] = (glass.fog[i] ?? 1) * 40;
            }
            tctx.putImageData(image, 0, 0);
            fogCtx.clearRect(0, 0, width, height);
            fogCtx.imageSmoothingEnabled = true;
            fogCtx.drawImage(fogTexture, 0, 0, glass.cols * FOG_CELL, glass.rows * FOG_CELL);
        };

        return runCanvas(drops, {
            fit(width, height) {
                const old = field.glass;
                if (!old || Math.abs(field.width - width) > 40 || Math.abs(field.height - height) > 40) {
                    field.glass = createGlass(width, height, seeded(0x91a5));
                }
                field.width = width;
                field.height = height;
                fog.width = width;
                fog.height = height;
            },
            frame(ctx, _dt, now, pointer, width, height) {
                const glass = field.glass;
                if (!glass) return RAIN_IDLE_MS;
                // The shared loop hands a scene no time after a sleep this long, so the glass keeps its own clock.
                let left = lastStep ? Math.min((now - lastStep) / 1000, 0.25) : 0;
                lastStep = now;
                let busy = false;
                do {
                    const step = Math.min(left, GLASS_STEP);
                    busy = stepGlass(glass, step, width, height, pointer, glassRandom) || busy;
                    left -= step;
                } while (left > 0);
                const wiping = pointer !== null && Math.hypot(pointer.vx, pointer.vy) > 0;
                if (wiping || now - lastFog > FOG_REDRAW_MS) {
                    paintFog(width, height);
                    lastFog = now;
                }
                ctx.clearRect(0, 0, width, height);
                for (const d of glass.drops) {
                    // Drawn a little larger than the drop's water, which reads truer at these sizes.
                    const size = d.r * 2.8;
                    const stretch = d.sliding ? 1.25 : 1;
                    ctx.drawImage(drop, d.x - size / 2, d.y - (size * stretch) / 2, size, size * stretch);
                }
                return busy ? BUSY_MS : RAIN_IDLE_MS;
            },
        });
    });

    $effect(() => {
        if (!frames && !clock) return;
        const medallion = runTicker((now) => {
            turn = turnAt(now);
            const date = new Date(now);
            shift = onShift(date);
            time = hands(date);
            const glint = burst(now, GLINT_PERIOD, GLINT_RUN, 6_000);
            glinting = glint.active;
            return Math.min(TURN_STEP_MS - (now % TURN_STEP_MS), glint.untilChange);
        });
        return medallion.stop;
    });
</script>

<div class="nightshift" class:glinting class:shift>
    <canvas bind:this={cityCanvas} class="layer city"></canvas>
    {#if lit}
        <canvas bind:this={lightsCanvas} class="lights"></canvas>
    {/if}
    {#if rain}
        <canvas bind:this={fogCanvas} class="layer" data-motion></canvas>
        <canvas bind:this={dropsCanvas} class="layer" data-motion></canvas>
    {/if}

    <!-- Gold leaf on the glass: a stepped deco frame in every corner, after the show's own. -->
    <svg class="defs" aria-hidden="true">
        <defs>
            <linearGradient id="nightshift-foil" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="240" y2="170">
                <stop offset="0" stop-color="#c9a46d" />
                <stop offset="0.3" stop-color="#ffe19b" />
                <stop offset="0.5" stop-color="#f0c380" />
                <stop offset="0.75" stop-color="#c9a46d" />
                <stop offset="1" stop-color="#fcdea8" />
            </linearGradient>
            <linearGradient id="nightshift-foil-round" gradientUnits="userSpaceOnUse" x1="-60" y1="-60" x2="60" y2="60">
                <stop offset="0" stop-color="#fcdea8" />
                <stop offset="0.35" stop-color="#c9a46d" />
                <stop offset="0.6" stop-color="#ffe19b" />
                <stop offset="1" stop-color="#c9a46d" />
            </linearGradient>
            <linearGradient id="nightshift-sheen">
                <stop offset="0" stop-color="#fff6dc" stop-opacity="0" />
                <stop offset="0.5" stop-color="#fff6dc" stop-opacity="0.95" />
                <stop offset="1" stop-color="#fff6dc" stop-opacity="0" />
            </linearGradient>
            <filter id="nightshift-soft" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="1.6" />
            </filter>
            <g id="nightshift-corner">
                <path
                    class="ink"
                    d="M 8 8 H 228 M 8 8 V 158 M 13 13 H 196 M 13 13 V 128 M 13 36 H 36 V 13
                       M 13 48 H 30 V 42 H 42 V 30 H 48 V 13 M 13 60 H 38 V 52 H 52 V 38 H 60 V 13
                       M 60 22 H 128 M 22 60 V 104"
                />
                <path class="stud" d={CORNER_STUDS} />
                <path class="stud" d="{diamond(200, 13, 2.4)} {diamond(13, 132, 2.4)}" />
            </g>
            <mask id="nightshift-corner-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="170">
                <use href="#nightshift-corner" class="mask-ink" filter="url(#nightshift-soft)" />
            </mask>
            <g id="nightshift-medal">
                <g transform="rotate({turn})">
                    <path class="stud" d={RAYS} />
                    <path class="ink" d={SPOKES} />
                </g>
                <circle class="ink ring" r="39" />
                <circle class="ink" r="35" />
                <path class="stud" d={HOURS} />
                <circle class="ink ring" r="20" />
                <path class="ink" d="M -13 0 Q 0 -10 13 0 Q 0 10 -13 0 Z" />
                <circle class="ink" r="5.5" />
                <circle class="stud" r="2.4" />
            </g>
            <mask id="nightshift-medal-mask" maskUnits="userSpaceOnUse" x="-64" y="-64" width="128" height="128">
                <use href="#nightshift-medal" class="mask-ink" filter="url(#nightshift-soft)" />
            </mask>
        </defs>
    </svg>

    {#if frames}
        {#each ["top-left", "top-right", "bottom-right", "bottom-left"] as corner (corner)}
            <svg class="corner {corner}" viewBox="0 0 240 170">
                <use href="#nightshift-corner" class="foil" />
                <g mask="url(#nightshift-corner-mask)" data-motion>
                    <rect class="sheen" x="-110" y="-60" width="90" height="300" fill="url(#nightshift-sheen)" />
                </g>
            </svg>
        {/each}
    {/if}

    {#if clock}
        <div class="clock">
            <span class="clock-in">Clock In</span>
            <svg class="medal" viewBox="-64 -64 128 128">
                <use href="#nightshift-medal" class="foil round" />
                <g mask="url(#nightshift-medal-mask)" data-motion>
                    <rect class="sheen" x="-170" y="-80" width="60" height="160" fill="url(#nightshift-sheen)" />
                </g>
                <g class="hands" data-motion>
                    <line y2="-19" transform="rotate({time.hour})" />
                    <line y2="-29" class="minute" transform="rotate({time.minute})" />
                    <circle r="2.6" />
                </g>
            </svg>
        </div>
    {/if}
</div>

<style>
    .nightshift {
        position: absolute;
        inset: 0;
        container-type: size;
    }

    .layer {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }

    /* The street sits back: the glass and its gold are the subject, so the view through them stays dim. */
    .city {
        opacity: 0.7;
    }

    .lights {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 200px;
    }

    .defs {
        position: absolute;
        width: 0;
        height: 0;
    }

    .ink {
        fill: none;
        stroke: var(--ink);
        stroke-width: var(--weight, 1.2);
    }

    .ring {
        stroke-width: calc(var(--weight, 1.2) * 1.5);
    }

    .stud {
        fill: var(--ink);
    }

    .foil {
        --ink: url(#nightshift-foil);
    }

    .foil.round {
        --ink: url(#nightshift-foil-round);
    }

    .mask-ink {
        --ink: white;
        /* Wider than the gold itself, so the glint blooms around the lines it crosses. */
        --weight: 5;
    }

    .corner {
        position: absolute;
        width: clamp(150px, 18cqw, 240px);
        aspect-ratio: 240 / 170;
        overflow: visible;
        opacity: 0.8;
    }

    .top-left {
        top: 0;
        left: 0;
    }

    .top-right {
        top: 0;
        right: 0;
        transform: scaleX(-1);
    }

    .bottom-right {
        right: 0;
        bottom: 0;
        transform: scale(-1, -1);
    }

    .bottom-left {
        bottom: 0;
        left: 0;
        transform: scaleY(-1);
    }

    .sheen {
        transform: translateX(0) rotate(28deg);
        opacity: 0;
    }

    /* The glint runs once round the frame, corner by corner, and ends on the medallion. */
    .glinting .sheen {
        animation: glint 1.1s ease-in-out both;
    }

    .glinting .top-right .sheen {
        animation-delay: 0.45s;
    }

    .glinting .bottom-right .sheen {
        animation-delay: 0.9s;
    }

    .glinting .bottom-left .sheen {
        animation-delay: 1.35s;
    }

    .glinting .medal .sheen {
        animation-name: glint-medal;
        animation-delay: 1.15s;
    }

    @keyframes glint {
        from {
            opacity: 1;
            transform: translateX(0) rotate(28deg);
        }
        to {
            opacity: 1;
            transform: translateX(420px) rotate(28deg);
        }
    }

    @keyframes glint-medal {
        from {
            opacity: 1;
            transform: translateX(0) rotate(28deg);
        }
        to {
            opacity: 1;
            transform: translateX(300px) rotate(28deg);
        }
    }

    .clock {
        position: absolute;
        right: clamp(48px, 5cqw, 72px);
        bottom: clamp(40px, 7cqh, 64px);
        width: clamp(96px, 10cqw, 132px);
        aspect-ratio: 1;
    }

    .medal {
        width: 100%;
        height: 100%;
        overflow: visible;
        opacity: 0.6;
        transition:
            opacity 1.2s ease,
            filter 1.2s ease;
    }

    .hands {
        opacity: 0;
        stroke: #fff4dc;
        stroke-linecap: round;
        stroke-width: 2.6;
        fill: #fff4dc;
        transition: opacity 1.2s ease;
    }

    .hands .minute {
        stroke-width: 1.8;
    }

    .clock-in {
        position: absolute;
        right: 88%;
        bottom: 62%;
        white-space: nowrap;
        font:
            400 34px "Segoe Script",
            "Brush Script MT",
            cursive;
        color: #f0fcfc;
        rotate: -8deg;
        opacity: 0;
        text-shadow:
            0 0 6px rgb(240 252 252 / 55%),
            0 0 18px rgb(120 220 210 / 35%);
        transition: opacity 1.2s ease;
    }

    /* Show night: the clock comes alive and the script lights up. */
    .shift .medal {
        opacity: 1;
        filter: drop-shadow(0 0 10px rgb(240 195 128 / 35%));
    }

    .shift .hands,
    .shift .clock-in {
        opacity: 1;
    }
</style>
