import type { BuildTag } from "@deadlock-plus/ipc-types/BuildTag";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";

/** `maxchars` of `BuildNameTextEntry` / `BuildDescriptionTextEntry` in `citadel_hud_hero_builds.xml`. */
export const NAME_MAX_CHARS = 50;
export const DESCRIPTION_MAX_CHARS = 512;

/** The build page has three tag slots (`BuildTag1`-`BuildTag3`); an empty slot is stored as 0. */
export const TAG_SLOTS = 3;

/** Steam's ELanguage numbers, which the build's `language` field uses, with a BCP 47 code for naming them. */
export const STEAM_LANGUAGES: readonly { id: number; code: string }[] = [
    { id: 0, code: "en" },
    { id: 1, code: "de" },
    { id: 2, code: "fr" },
    { id: 3, code: "it" },
    { id: 4, code: "ko" },
    { id: 5, code: "es-ES" },
    { id: 6, code: "zh-Hans" },
    { id: 7, code: "zh-Hant" },
    { id: 8, code: "ru" },
    { id: 9, code: "th" },
    { id: 10, code: "ja" },
    { id: 11, code: "pt-PT" },
    { id: 12, code: "pl" },
    { id: 13, code: "da" },
    { id: 14, code: "nl" },
    { id: 15, code: "fi" },
    { id: 16, code: "no" },
    { id: 17, code: "sv" },
    { id: 18, code: "hu" },
    { id: 19, code: "cs" },
    { id: 20, code: "ro" },
    { id: 21, code: "tr" },
    { id: 22, code: "pt-BR" },
    { id: 23, code: "bg" },
    { id: 24, code: "el" },
    { id: 25, code: "uk" },
    { id: 26, code: "es-419" },
    { id: 27, code: "vi" },
    { id: 28, code: "id" },
];

export interface LanguageOption {
    value: string;
    label: string;
    meta?: string;
}

function languageName(code: string, displayLocale: string): string | undefined {
    try {
        return new Intl.DisplayNames([displayLocale], { type: "language", fallback: "none" }).of(code);
    } catch {
        return undefined;
    }
}

/** `current` is listed even when it is not an ELanguage id, so the select never shows blank for a build. */
export function languageOptions(
    displayLocale: string,
    current: number,
    unknownLabel: (id: number) => string,
): LanguageOption[] {
    const options: LanguageOption[] = STEAM_LANGUAGES.map(({ id, code }) => {
        const label = languageName(code, displayLocale) ?? code;
        const own = languageName(code, code);
        return own && own !== label ? { value: String(id), label, meta: own } : { value: String(id), label };
    });
    if (!STEAM_LANGUAGES.some((l) => l.id === current)) {
        options.push({ value: String(current), label: unknownLabel(current) });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, displayLocale));
}

/** The id Source 2 gives a name: MurmurHash2, seed 0x31415926, over the ASCII-lowercased bytes. */
export function classId(name: string): number {
    const M = 0x5bd1e995;
    const data = new TextEncoder().encode(name.toLowerCase());
    let h = (0x31415926 ^ data.length) >>> 0;
    let i = 0;
    for (; i + 4 <= data.length; i += 4) {
        let k = data[i]! | (data[i + 1]! << 8) | (data[i + 2]! << 16) | (data[i + 3]! << 24);
        k = Math.imul(k, M);
        k ^= k >>> 24;
        h = Math.imul(h, M) ^ Math.imul(k, M);
    }
    const rest = data.length - i;
    if (rest > 0) {
        if (rest === 3) h ^= data[i + 2]! << 16;
        if (rest >= 2) h ^= data[i + 1]! << 8;
        h ^= data[i]!;
        h = Math.imul(h, M);
    }
    h ^= h >>> 13;
    h = Math.imul(h, M);
    h ^= h >>> 15;
    return h >>> 0;
}

/**
 * The picker's "Standard Tags": a standard tag's id is `classId` of its localisation token
 * `citadel_build_tag_<key>` (`citadel_main_english.txt`); published builds carry those ids.
 */
export const STANDARD_TAGS: readonly { id: number; key: string }[] = [
    "weapon",
    "vitality",
    "spirit",
    "complexity_1",
    "complexity_2",
    "complexity_3",
    "damage",
    "utility",
    "healing",
    "crowd_control",
    "mobility",
    "melee",
    "headshots",
    "debuff",
].map((key) => ({ id: classId(`citadel_build_tag_${key}`), key }));

export interface StandardTag {
    id: number;
    key: string;
    /** The game's name; without one, the UI names the tag from its own locale. */
    name?: string;
}

/** `game` is the installed game's list, which leaves out a tag it cannot name. */
export function standardTags(game: readonly BuildTag[]): StandardTag[] {
    const byKey = new Map(game.map((g) => [g.key, g]));
    return STANDARD_TAGS.map(({ id, key }) => {
        const own = byKey.get(key);
        return own ? { id: own.id, key, name: own.name } : { id, key };
    });
}

export interface NamedThing {
    name: string;
    art?: string;
}

export interface TagNames {
    standard?: readonly StandardTag[];
    items?: ReadonlyMap<number, NamedThing>;
    abilities?: ReadonlyMap<number, NamedThing>;
}

export type TagInfo =
    | ({ kind: "standard" } & StandardTag)
    | ({ id: number; kind: "ability" | "item" } & NamedThing)
    | { id: number; kind: "unknown" };

/** A tag that is not a standard tag is an ability or item id. */
export function describeTag(id: number, names: TagNames): TagInfo {
    const standard = (names.standard ?? STANDARD_TAGS).find((s) => s.id === id);
    if (standard) return { kind: "standard", ...standard };
    const ability = names.abilities?.get(id);
    if (ability) return { id, kind: "ability", ...ability };
    const item = names.items?.get(id);
    if (item) return { id, kind: "item", ...item };
    return { id, kind: "unknown" };
}

export function selectedTags(tags: readonly number[]): number[] {
    return tags.filter((t) => t !== 0);
}

export function canAddTag(tags: readonly number[]): boolean {
    return tags.length < TAG_SLOTS || tags.includes(0);
}

/** Slots keep their positions: removing leaves a 0, adding fills the first 0 (or appends). Full: unchanged. */
export function toggleTag(tags: number[], id: number): number[] {
    const at = tags.indexOf(id);
    if (at >= 0) return tags.map((t, i) => (i === at ? 0 : t));
    const empty = tags.indexOf(0);
    if (empty >= 0) return tags.map((t, i) => (i === empty ? id : t));
    return tags.length < TAG_SLOTS ? [...tags, id] : tags;
}

export function buildItemIds(build: BuildView): number[] {
    return [...new Set(build.modCategories.flatMap((c) => c.mods.map((m) => m.abilityId)))];
}
