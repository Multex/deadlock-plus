import type { Hero } from "$lib/features/heroes/heroes";
import type { Scope } from "$lib/features/presence/config";
import type { PresencePlaceholder } from "@deadlock-plus/ipc-types/PresencePlaceholder";
import type { PresenceCard } from "@deadlock-plus/ipc-types/PresenceCard";
import type { PresenceConfig } from "@deadlock-plus/ipc-types/PresenceConfig";
import type { PresenceImageSource } from "@deadlock-plus/ipc-types/PresenceImageSource";
import type { PresenceSample } from "@deadlock-plus/ipc-types/PresenceSample";
import type { PresenceStateId } from "@deadlock-plus/ipc-types/PresenceStateId";
import type { PresenceStateInfo } from "@deadlock-plus/ipc-types/PresenceStateInfo";
import type { PresenceTimer } from "@deadlock-plus/ipc-types/PresenceTimer";
import type { PresenceVariantId } from "@deadlock-plus/ipc-types/PresenceVariantId";

export const TIMERS: PresenceTimer[] = ["none", "elapsedInState", "matchTime", "queueTime"];

export type SourceKind = "heroPortrait" | "heroIcon" | "rankBadge" | "modeIcon" | "customUrl";
export const SOURCE_KINDS: SourceKind[] = ["heroPortrait", "heroIcon", "rankBadge", "customUrl"];

export type PreviewCard = PresenceCard & { deadlockPlusLogo: boolean };

/** Mirrors the live substitution: Discord shows its own app icon unless a large image is sent. The preview draws the
 * bundled logo for it, so it never reaches the network. */
export function withDeadlockPlusLogo(card: PresenceCard, on: boolean): PreviewCard {
    if (!on || card.largeImage) return { ...card, deadlockPlusLogo: false };
    return { ...card, largeText: card.largeText || "Deadlock+", deadlockPlusLogo: true };
}

export function insertPlaceholder(text: string, start: number | null, end: number | null, name: string) {
    const token = `{${name}}`;
    const a = Math.min(start ?? text.length, end ?? text.length);
    const b = Math.max(start ?? text.length, end ?? text.length);
    return { text: text.slice(0, a) + token + text.slice(b), caret: a + token.length };
}

export function sourceKind(source: PresenceImageSource | undefined): SourceKind | undefined {
    if (source === undefined) return undefined;
    return typeof source === "string" ? source : "customUrl";
}

export function sourceFromKind(kind: SourceKind, url: string): PresenceImageSource {
    return kind === "customUrl" ? { customUrl: url } : kind;
}

export function sourceUrl(source: PresenceImageSource | undefined): string {
    return typeof source === "object" ? source.customUrl : "";
}

export function heroOptions(heroes: Record<number, Hero>): Hero[] {
    return Object.values(heroes)
        .filter((h) => h.selectable !== false)
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function scopeFor(
    info: PresenceStateInfo,
    variant: PresenceVariantId | undefined,
    heroId: number | undefined,
): Scope {
    return { state: info.id, variant, heroId: info.heroScope ? heroId : undefined };
}

export function formatElapsed(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function exampleConfig(template: string): PresenceConfig {
    return { states: { playing: { details: template } }, variants: {}, heroes: {} };
}

export type SyntaxExample = { id: string; source: string };

export const SYNTAX_EXAMPLES: SyntaxExample[] = [
    { id: "placeholder", source: "Playing as {hero}" },
    { id: "empty", source: "Rank {rank}" },
    { id: "group_shown", source: "[[Playing as {hero}]]" },
    { id: "group_dropped", source: "[[Rank {rank}]]" },
    { id: "fallback", source: "[[Rank {rank}||Unranked]]" },
    { id: "chain", source: "[[{rank} in {mode}||{mode}||Playing]]" },
];

type PreviewFn = (
    config: PresenceConfig,
    state: PresenceStateId,
    variant: PresenceVariantId | null,
    heroId: number | null,
    sample: PresenceSample | null,
) => Promise<PresenceCard | null>;

export async function renderTemplate(preview: PreviewFn, template: string): Promise<string> {
    try {
        const card = await preview(exampleConfig(template), "playing", null, null, null);
        return card?.details ?? "";
    } catch {
        return "";
    }
}

export type PlaceholderGroupId = "you" | "match" | "party" | "streetBrawl" | "other";

const GROUP_ORDER: { id: Exclude<PlaceholderGroupId, "other">; names: string[] }[] = [
    { id: "you", names: ["hero", "heroPresence", "kills", "deaths", "assists", "souls", "rank"] },
    { id: "match", names: ["mode", "gameMode", "result", "elapsed", "matchId"] },
    { id: "party", names: ["partySize", "partyMax", "queueTime"] },
    { id: "streetBrawl", names: ["round", "scoreAmber", "scoreSapphire"] },
];

export function groupPlaceholders(
    list: PresencePlaceholder[],
): { id: PlaceholderGroupId; items: PresencePlaceholder[] }[] {
    const known = new Set(GROUP_ORDER.flatMap((g) => g.names));
    const groups: { id: PlaceholderGroupId; items: PresencePlaceholder[] }[] = GROUP_ORDER.map((g) => ({
        id: g.id,
        items: g.names.flatMap((name) => list.filter((p) => p.name === name)),
    }));
    groups.push({ id: "other", items: list.filter((p) => !known.has(p.name)) });
    return groups.filter((g) => g.items.length > 0);
}

/** The tier of the preview's made-up rank (the Rust sample badge is 52). */
export const SAMPLE_RANK_TIER = 5;

export function previewSample(
    heroes: Hero[],
    pickedId: number | undefined,
    sampleName: string,
    rankNames: Record<number, string>,
): PresenceSample {
    const hero = heroes.find((h) => (pickedId === undefined ? h.name === sampleName : h.id === pickedId));
    return {
        heroName: hero?.name ?? sampleName,
        heroPortrait: hero?.portrait ?? null,
        heroIcon: hero?.artIcon ?? null,
        rankName: rankNames[SAMPLE_RANK_TIER] ?? null,
        heroPresence: hero?.hideoutLine ?? null,
    };
}
