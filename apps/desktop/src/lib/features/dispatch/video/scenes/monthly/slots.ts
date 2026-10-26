import { VIDEO_VARIANTS } from "../../beats";
import type { MonthlyBeatId } from "./plan";

/** One copy slot of the Monthly video: `counted` slots take a `count` and carry `_one`/`_other` per variant. */
export interface MonthlySlot {
    beat: MonthlyBeatId;
    slot: string;
    counted: boolean;
}

const slots = (beat: MonthlyBeatId, plain: readonly string[], counted: readonly string[] = []): MonthlySlot[] => [
    ...plain.map((slot) => ({ beat, slot, counted: false })),
    ...counted.map((slot) => ({ beat, slot, counted: true })),
];

/** Interview topics: one question and one answer each. */
export const INTERVIEW_TOPICS = [
    "busiest",
    "mate",
    "hours",
    "duo",
    "nemesis",
    "night_owl",
    "marathon",
    "streak",
    "debut",
    "weekender",
    "dry_spell",
    "grinder",
    "mvp",
    "vs_last_up",
    "vs_last_down",
] as const;
export type InterviewTopic = (typeof INTERVIEW_TOPICS)[number];
const COUNTED_ANSWERS: ReadonlySet<InterviewTopic> = new Set([
    "busiest",
    "mate",
    "duo",
    "nemesis",
    "marathon",
    "streak",
    "debut",
    "dry_spell",
    "grinder",
    "mvp",
]);

export const TAKES_CAPTIONS = [
    "busiest",
    "grinder",
    "weekender",
    "dry_spell",
    "losing_then_winning",
    "marathon",
    "night_owl",
] as const;
const COUNTED_TAKES = new Set(["busiest", "grinder", "dry_spell", "marathon"]);

export const WARDROBE_CAPTIONS = ["plain", "one_trick", "explorer", "debut"] as const;

export const FEATURE_ANGLES = [
    "climb",
    "slide",
    "streak",
    "losing_then_winning",
    "marathon",
    "duo",
    "nemesis",
    "one_trick",
    "explorer",
    "night_owl",
    "winning",
    "losing",
    "vs_last_up",
    "vs_last_down",
] as const;
export type FeatureAngle = (typeof FEATURE_ANGLES)[number];
const COUNTED_FEATURE = new Set(["streak", "marathon", "duo", "nemesis", "one_trick", "explorer", "winning", "losing"]);

export const COVER_LINES = [
    "climb",
    "slide",
    "streak",
    "losing_then_winning",
    "marathon",
    "duo",
    "nemesis",
    "one_trick",
    "explorer",
    "debut",
    "night_owl",
    "grinder",
    "weekender",
    "dry_spell",
    "winning",
    "losing",
    "vs_last_up",
    "vs_last_down",
    "mvp",
    "record",
    "hours",
    "days",
] as const;
export type CoverLine = (typeof COVER_LINES)[number];
const COUNTED_COVER = new Set([
    "streak",
    "marathon",
    "duo",
    "nemesis",
    "one_trick",
    "explorer",
    "grinder",
    "dry_spell",
    "winning",
    "losing",
    "mvp",
    "days",
]);

const split = <T extends string>(all: readonly T[], counted: ReadonlySet<string>, prefix = "", suffix = "") => [
    all.filter((s) => !counted.has(s)).map((s) => `${prefix}${s}${suffix}`),
    all.filter((s) => counted.has(s)).map((s) => `${prefix}${s}${suffix}`),
];

/** Every copy slot the Monthly video can ask for. */
export const MONTHLY_SLOTS: readonly MonthlySlot[] = [
    ...slots("m_flash", ["slate", "slate_anon"], ["hook"]),
    ...slots(
        "m_takes",
        ["title", ...split(TAKES_CAPTIONS, COUNTED_TAKES, "caption_")[0]!],
        split(TAKES_CAPTIONS, COUNTED_TAKES, "caption_")[1],
    ),
    ...slots("m_shot", ["label", "caption_big_game", "caption_plain"]),
    ...slots(
        "m_wardrobe",
        ["title", "debut_tag"],
        WARDROBE_CAPTIONS.map((c) => `caption_${c}`),
    ),
    ...slots(
        "m_interview",
        [
            "title",
            ...INTERVIEW_TOPICS.map((t) => `${t}_q`),
            ...INTERVIEW_TOPICS.filter((t) => !COUNTED_ANSWERS.has(t)).map((t) => `${t}_a`),
        ],
        INTERVIEW_TOPICS.filter((t) => COUNTED_ANSWERS.has(t)).map((t) => `${t}_a`),
    ),
    ...slots(
        "m_feature",
        [
            "kicker",
            ...FEATURE_ANGLES.map((a) => `headline_${a}`),
            ...split(FEATURE_ANGLES, COUNTED_FEATURE, "deck_")[0]!,
        ],
        split(FEATURE_ANGLES, COUNTED_FEATURE, "deck_")[1],
    ),
    ...slots(
        "m_cover",
        ["title_hero", "title_month", ...split(COVER_LINES, COUNTED_COVER, "line_")[0]!],
        split(COVER_LINES, COUNTED_COVER, "line_")[1],
    ),
    ...slots("m_stand", ["tag", "price"]),
    ...slots("m_end", ["cta"]),
];

export function isCounted(beat: MonthlyBeatId, slot: string): boolean {
    const found = MONTHLY_SLOTS.find((s) => s.beat === beat && s.slot === slot);
    if (!found) throw new Error(`no Monthly video slot ${beat}.${slot}`);
    return found.counted;
}

/** The locale keys a slot owns: one per variant, or its `_one`/`_other` pair when counted. */
export function slotKeys({ beat, slot, counted }: MonthlySlot): string[] {
    return Array.from({ length: VIDEO_VARIANTS }, (_, i) => `dispatch.video.monthly.${beat}.${slot}_${i + 1}`).flatMap(
        (k) => (counted ? [`${k}_one`, `${k}_other`] : [k]),
    );
}
