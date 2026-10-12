import { skullIconSvg } from "../gamedata/map-icons";
import type { MatchTeam } from "./detail";

/** Dot side as a fraction of the map side, so it scales with the displayed map. */
export const DOT_SIZE = 0.064;

export const RELATION_DISC = {
    ally: "#FFEFD7",
    enemy: "#FF410D",
} as const;

const CONE_WASH = "rgb(178, 255, 229)";

export interface PlayerDotInput {
    team: MatchTeam;
    alive: boolean;
    own: boolean;
    /** Team of the viewing player; null when they are not in the match. */
    ownTeam: MatchTeam | null;
    heroArt: string | null;
    markerArt: string | null;
    coneArt: string | null;
}

export interface PlayerDotStyle {
    size: number;
    discColor: string;
    discScale: number;
    discOpacity: number;
    borderPx: number;
    head: { src: string; scale: number } | null;
    marker: { src: string; scale: number; clip: string } | null;
    cone: { src: string; color: string; opacity: number; scale: number } | null;
    skull: { opacity: number } | null;
    zIndex: number;
}

const Z_DEAD = 0;
const Z_ENEMY = 13;
const Z_FRIENDLY = 14;
const Z_LOCAL = 18;

// The self marker art is an eye with a pointer to its right. The match data carries no facing,
// so only the eye is shown: the art is cropped to a circle and scaled so the eye spans the dot.
const MARKER_EYE_CLIP = "circle(24% at 50% 50%)";
const MARKER_EYE_SCALE = 2.1;

export function playerDotStyle(i: PlayerDotInput): PlayerDotStyle {
    const viewerTeam = i.ownTeam ?? "hidden-king";
    const enemy = i.team !== viewerTeam;
    const local = i.alive && i.own;
    return {
        size: DOT_SIZE,
        discColor: enemy ? RELATION_DISC.enemy : RELATION_DISC.ally,
        discScale: 1,
        discOpacity: i.alive ? 0.9 : 0.6,
        borderPx: 1,
        head: i.alive && i.heroArt ? { src: i.heroArt, scale: i.own ? 0.7 : 0.6 } : null,
        marker: local && i.markerArt ? { src: i.markerArt, scale: MARKER_EYE_SCALE, clip: MARKER_EYE_CLIP } : null,
        cone: local && i.coneArt ? { src: i.coneArt, color: CONE_WASH, opacity: 0.35, scale: 2.4 } : null,
        skull: i.alive ? null : { opacity: 0.8 },
        zIndex: !i.alive ? Z_DEAD : i.own ? Z_LOCAL : enemy ? Z_ENEMY : Z_FRIENDLY,
    };
}

export function skullDataUri(): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(skullIconSvg("#241a14"))}`;
}
