export const TOSS_KINDS = ["slap", "slide", "spin", "flop", "skid"] as const;
export type TossKind = (typeof TOSS_KINDS)[number];
export type LandingKind = TossKind | "fade";

export const MAX_ANGLE = 5;
export const MAX_DX = 28;
export const MAX_DY = 18;

export interface Landing {
    kind: LandingKind;
    /** Resting angle in degrees. */
    angle: number;
    dx: number;
    dy: number;
    sideX: 1 | -1;
    sideY: 1 | -1;
}

export interface TossMotion {
    keyframes: Keyframe[];
    shadow: Keyframe[];
    duration: number;
    easing: string;
    /** Ms into the toss when the paper hits the table hard enough to shake it. */
    impactAt?: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Every random draw lands in [0, 1), whatever `random` returns. */
function draw(random: () => number): number {
    return Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
}

export function pickLanding(random: () => number, last: TossKind | null, reduced: boolean): Landing {
    const kinds = TOSS_KINDS.filter((k) => k !== last);
    const pick = draw(random);
    const spread = (max: number) => round(-max + draw(random) * 2 * max);
    return {
        kind: reduced ? "fade" : kinds[Math.floor(pick * kinds.length)],
        angle: spread(MAX_ANGLE),
        dx: spread(MAX_DX),
        dy: spread(MAX_DY),
        sideX: draw(random) < 0.5 ? -1 : 1,
        sideY: draw(random) < 0.5 ? -1 : 1,
    };
}

let lastToss: TossKind | null = null;

/** Picks the next landing, never the same toss as the one before it in this session. */
export function nextLanding(reduced: boolean, random: () => number = Math.random): Landing {
    const landing = pickLanding(random, lastToss, reduced);
    if (landing.kind !== "fade") lastToss = landing.kind;
    return landing;
}

export function restTransform(l: Landing): string {
    return `translate(${l.dx}px, ${l.dy}px) rotate(${l.angle}deg)`;
}

/** The contact shadow once the paper lies flat. */
export const REST_SHADOW: Keyframe = { opacity: 0.45, transform: "translateY(10px) scale(1)" };

const shadowAt = (offset: number, opacity: number, y: number, scale: number): Keyframe => ({
    offset,
    opacity,
    transform: `translateY(${y}px) scale(${scale})`,
});

// Gravity: speeds up into the table. Brake: hard deceleration after a hit.
const GRAVITY = "cubic-bezier(0.55, 0, 0.9, 0.45)";
const BRAKE = "cubic-bezier(0.15, 0.75, 0.25, 1)";
const SETTLE = "ease-in-out";
// A thrown sheet skidding on the table: slows steadily instead of stopping dead.
const SKID = "cubic-bezier(0.2, 0.65, 0.3, 1)";

export function tossMotion(l: Landing, sheetHeight: number): TossMotion {
    const rest = restTransform(l);
    const { sideX: sx, sideY: sy } = l;
    switch (l.kind) {
        case "slap": {
            const at = (y: number, r: number, s: number) => `${rest} translateY(${y}px) rotate(${r}deg) scale(${s})`;
            const duration = 620;
            const hit = 0.62;
            return {
                duration,
                easing: "linear",
                impactAt: Math.round(duration * hit),
                keyframes: [
                    { offset: 0, opacity: 0, transform: at(-30, -3 * sx, 1.18), easing: GRAVITY },
                    { offset: 0.14, opacity: 1 },
                    { offset: hit, transform: at(0, 0, 0.975), easing: BRAKE },
                    { offset: 0.78, transform: at(-4, 0.6 * sx, 1.012), easing: SETTLE },
                    { offset: 0.9, transform: at(0, -0.15 * sx, 0.998), easing: SETTLE },
                    { offset: 1, opacity: 1, transform: at(0, 0, 1) },
                ],
                shadow: [shadowAt(0, 0, 90, 1.25), shadowAt(hit, 0.6, 6, 1), REST_SHADOW],
            };
        }
        case "slide": {
            const at = (x: string, y: number, r: number) => `${rest} translate(${x}, ${y}px) rotate(${r}deg)`;
            return {
                duration: 780,
                easing: "linear",
                keyframes: [
                    { offset: 0, opacity: 1, transform: at(`${sx * 85}vw`, 40, -sx * 30), easing: SKID },
                    { offset: 0.78, transform: at(`${-sx * 12}px`, -2, sx * 1.8), easing: SETTLE },
                    { offset: 1, opacity: 1, transform: at("0px", 0, 0) },
                ],
                shadow: [shadowAt(0, 0.35, 16, 1), shadowAt(0.78, 0.45, 10, 1), REST_SHADOW],
            };
        }
        case "spin": {
            const at = (x: string, y: string, r: number, s: number) =>
                `${rest} translate(${x}, ${y}) rotate(${r}deg) scale(${s})`;
            const land = 0.72;
            return {
                duration: 850,
                easing: "linear",
                keyframes: [
                    {
                        offset: 0,
                        opacity: 0,
                        transform: at(`${sx * 55}vw`, `${sy * 60}vh`, -sx * 320, 1.3),
                        easing: BRAKE,
                    },
                    { offset: 0.1, opacity: 1 },
                    { offset: land, transform: at("0px", "0px", sx * 3, 0.985), easing: SETTLE },
                    { offset: 0.86, transform: at("0px", "0px", -sx * 0.8, 1.004), easing: SETTLE },
                    { offset: 1, opacity: 1, transform: at("0px", "0px", 0, 1) },
                ],
                shadow: [shadowAt(0, 0, 80, 0.85), shadowAt(land, 0.6, 6, 1), REST_SHADOW],
            };
        }
        case "flop": {
            const half = Math.round(sheetHeight / 2);
            // Hinged on the bottom edge: the top starts raised towards the viewer and falls flat.
            const at = (y: number, tilt: number) =>
                `${rest} translateY(${y + half}px) perspective(1800px) rotateX(${tilt}deg) translateY(${-half}px)`;
            const hit = 0.66;
            return {
                duration: 720,
                easing: "linear",
                keyframes: [
                    { offset: 0, opacity: 0, transform: at(-24, -45), easing: GRAVITY },
                    { offset: 0.1, opacity: 1 },
                    { offset: hit, transform: at(0, 0), easing: BRAKE },
                    { offset: 0.8, transform: at(0, -4), easing: GRAVITY },
                    { offset: 1, opacity: 1, transform: at(0, 0) },
                ],
                shadow: [shadowAt(0, 0, 40, 0.9), shadowAt(hit, 0.6, 6, 1), REST_SHADOW],
            };
        }
        case "skid": {
            const at = (x: number, y: string, r: number) => `${rest} translate(${x}px, ${y}) rotate(${r}deg)`;
            return {
                duration: 760,
                easing: "linear",
                keyframes: [
                    { offset: 0, opacity: 1, transform: at(sx * 40, "80vh", sx * 10), easing: SKID },
                    { offset: 0.7, transform: at(-sx * 4, "-26px", -sx * 1.4), easing: SETTLE },
                    { offset: 0.86, transform: at(0, "6px", sx * 0.4), easing: SETTLE },
                    { offset: 1, opacity: 1, transform: at(0, "0px", 0) },
                ],
                shadow: [shadowAt(0, 0.35, 16, 1), shadowAt(0.7, 0.45, 10, 1), REST_SHADOW],
            };
        }
        case "fade":
            return {
                duration: 180,
                easing: "ease-out",
                keyframes: [
                    { opacity: 0, transform: rest },
                    { opacity: 1, transform: rest },
                ],
                shadow: [{ ...REST_SHADOW, opacity: 0 }, REST_SHADOW],
            };
    }
}
