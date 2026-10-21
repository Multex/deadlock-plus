import type { ShopUiImage } from "@deadlock-plus/ipc-types/ShopUiImage";
import { gameColors } from "../colors";
import { shrinkFont } from "../item-tooltip/view";
import { panoramaAlpha, panoramaColor } from "../panorama";
import type { UpgradeState } from "./model";

const UPGRADE_ART: Record<UpgradeState, ShopUiImage> = {
    has: "ability_upgrade_rect_default",
    available: "ability_upgrade_rect_available",
    cantAfford: "ability_upgrade_rect_cant_afford",
    notTrained: "ability_upgrade_rect_default",
};

/** `.abilityUpgradeContent`'s `ap_rect_*` art for a card state. */
export function upgradeArt(state: UpgradeState): ShopUiImage {
    return UPGRADE_ART[state];
}

/** `.AbilityName`: oracle bold 36, shrunk to fit its 370 max width. */
export function abilityNameSize(name: string): number {
    return shrinkFont(name, 370, 36);
}

function opacity(alpha: number): string {
    return String(Math.round(panoramaAlpha(alpha) * 1000) / 1000);
}

function radial(from: string, to: string): string {
    return `radial-gradient(circle at 50% 50%, ${panoramaColor(from)}, ${panoramaColor(to)})`;
}

/**
 * Every colour the ability tooltip draws that is not a plain base colour, as `--at-*` custom properties, plus
 * the `--tt-*` ones the shared scaling marker reads. Panorama alphas go through the alpha rule here.
 */
export function abilityTooltipVars(): Record<string, string> {
    return {
        "--at-description": gameColors.silvered,
        "--at-highlight": gameColors.offWhite,
        "--at-weapon": "#ff9900",
        "--at-tech": gameColors.tech,
        "--at-armor": gameColors.armor,
        "--at-courage": gameColors.courageBright,
        "--at-spirit": gameColors.spiritBright,
        "--at-fortitude": gameColors.fortitudeBright,
        "--at-special": "#e9a34e",
        "--at-diminish": panoramaColor("#bfbbb050"),
        "--at-affix": "#a4a4a4",
        "--at-chip": panoramaColor("#ffffff05"),
        "--at-chip-dim": panoramaColor("#ffffff03"),
        "--at-cell": panoramaColor("offWhite&08"),
        "--at-spirit-border": panoramaColor("spirit&40"),
        "--at-spirit-fill": radial("#00000080", "spiritDark&50"),
        "--at-weapon-border": panoramaColor("courage&30"),
        "--at-weapon-fill": radial("#00000080", "courageDark&30"),
        "--at-boon-border": panoramaColor("shard&10"),
        "--at-boon-fill": radial("#00000080", "shard&10"),
        "--at-group-title": "#909090",
        "--at-imbued": gameColors.spiritBright,
        "--at-card": panoramaColor("offWhite&05"),
        "--at-card-cant-afford": "#5a2020",
        "--at-strip": gameColors.offBlack,
        "--at-strip-has": gameColors.deadlockGreenDarker,
        "--at-bolt": gameColors.deadlockGreen,
        "--at-enemy": gameColors.enemy,
        "--at-check": gameColors.fortitudeBright,
        "--at-recommended": gameColors.buildsDark,
        "--at-icon-opacity": opacity(0.3),
        "--at-name-opacity": opacity(0.8),
        "--at-status-opacity": opacity(0.5),
        "--at-card-desc-opacity": opacity(0.6),
        "--at-card-dim-opacity": opacity(0.5),
        "--tt-scaling-x": panoramaColor("#ffffff86"),
        "--tt-scaling-x-opacity": opacity(0.8),
    };
}
