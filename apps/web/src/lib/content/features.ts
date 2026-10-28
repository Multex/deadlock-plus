import type { Translator } from "$lib/i18n";

export type GroupId = "match" | "builds" | "progress" | "upkeep";

export interface Feature {
    id: string;
    group: GroupId;
    /** How many bullet points the feature's copy has, numbered from 1 in the catalog. */
    points: number;
    /** File name, without extension, of the page's screenshot in `static/screenshots`. */
    shot?: string;
    /** File name, without extension, of a portrait crop of that screenshot, sized for a phone. */
    detailShot?: string;
}

export interface FeatureText {
    name: string;
    summary: string;
    points: string[];
}

export const GROUPS: readonly { id: GroupId }[] = [
    { id: "match" },
    { id: "builds" },
    { id: "progress" },
    { id: "upkeep" },
];

export const FEATURES: readonly Feature[] = [
    {
        id: "discord-presence",
        shot: "discord-presence",
        detailShot: "discord-presence-mobile",
        group: "match",
        points: 4,
    },
    { id: "server-picker", shot: "server-picker", detailShot: "server-picker-mobile", group: "match", points: 3 },
    { id: "live", shot: "live", detailShot: "live-mobile", group: "match", points: 3 },
    { id: "builds", shot: "builds", detailShot: "builds-mobile", group: "builds", points: 6 },
    { id: "build-editor", shot: "build-editor", detailShot: "build-editor-mobile", group: "builds", points: 6 },
    { id: "match-history", shot: "match-history", detailShot: "match-history-mobile", group: "progress", points: 6 },
    { id: "stats", shot: "stats", detailShot: "stats-mobile", group: "progress", points: 6 },
    { id: "mutes", shot: "mutes", group: "upkeep", points: 2 },
    { id: "replays", shot: "replays", detailShot: "replays-mobile", group: "upkeep", points: 2 },
    { id: "storage", shot: "storage", detailShot: "storage-mobile", group: "upkeep", points: 2 },
    { id: "performance", shot: "performance", detailShot: "performance-mobile", group: "upkeep", points: 3 },
    { id: "background", group: "upkeep", points: 3 },
];

/** The single-match page: the densest view the app has. */
export const HERO_SHOT = "match";
export const HERO_DETAIL_SHOT = "match-mobile";

export const HIGHLIGHTS = [
    "discord-presence",
    "build-editor",
    "live",
    "server-picker",
    "match-history",
    "stats",
] as const;

export function featuresIn(group: GroupId): Feature[] {
    return FEATURES.filter((feature) => feature.group === group);
}

export function highlights(): Feature[] {
    return HIGHLIGHTS.flatMap((id) => FEATURES.filter((feature) => feature.id === id));
}

// Ids double as page anchors, which keep their hyphens; catalog keys use underscores.
export function featureText({ t }: Translator, feature: Feature): FeatureText {
    const key = feature.id.replaceAll("-", "_");
    return {
        name: t(`features.items.${key}.name`),
        summary: t(`features.items.${key}.summary`),
        points: Array.from({ length: feature.points }, (_, i) => t(`features.items.${key}.points.${i + 1}`)),
    };
}

export function groupText({ t }: Translator, group: GroupId): { name: string; blurb: string } {
    return { name: t(`features.groups.${group}.name`), blurb: t(`features.groups.${group}.blurb`) };
}
