import type { PresenceCard } from "@deadlock-plus/ipc-types/PresenceCard";
import type { PresenceConfig } from "@deadlock-plus/ipc-types/PresenceConfig";
import type { PresenceImage } from "@deadlock-plus/ipc-types/PresenceImage";
import type { PresencePartialImage } from "@deadlock-plus/ipc-types/PresencePartialImage";
import type { PresencePartialSlot } from "@deadlock-plus/ipc-types/PresencePartialSlot";
import type { PresencePlaceholder } from "@deadlock-plus/ipc-types/PresencePlaceholder";
import type { PresenceSample } from "@deadlock-plus/ipc-types/PresenceSample";
import type { PresenceSlot } from "@deadlock-plus/ipc-types/PresenceSlot";
import type { PresenceStateId } from "@deadlock-plus/ipc-types/PresenceStateId";
import type { PresenceStateInfo } from "@deadlock-plus/ipc-types/PresenceStateInfo";
import type { PresenceTimer } from "@deadlock-plus/ipc-types/PresenceTimer";
import type { PresenceVariantId } from "@deadlock-plus/ipc-types/PresenceVariantId";

const MODE_VARIANTS: PresenceVariantId[] = [
    "unranked",
    "ranked",
    "bots",
    "tutorial",
    "streetBrawl",
    "sandbox",
    "exploreNyc",
];
// A Street Brawl in progress is its own state, so "In a match" never carries that variant.
const IN_MATCH_VARIANTS = MODE_VARIANTS.filter((variant) => variant !== "streetBrawl");

const VARIANTS: { [state in PresenceStateId]?: PresenceVariantId[] } = {
    hideout: ["solo", "party"],
    findingMatch: ["unranked", "ranked", "bots", "streetBrawl"],
    matchFound: MODE_VARIANTS,
    inMatch: IN_MATCH_VARIANTS,
    paused: MODE_VARIANTS,
    postGame: ["won", "lost", "unscored"],
};

type Art = "hero" | "plain" | "hidden";
type StateRow = [id: PresenceStateId, details: string, state: string, timer: PresenceTimer, art: Art];

/**
 * The built-in slot of each state, in editor order. These texts, like the variants and the template rules below,
 * repeat the Rust crate `dp-presence` that builds the activity in the app, and must change with it. `hero` states know the player's hero, so its icon is the large
 * image. `hidden` states (spectating, private matches) have no hover text either: the art would describe someone
 * else, or give a private match away.
 */
const STATES: StateRow[] = [
    ["playing", "Playing Deadlock", "", "elapsedInState", "plain"],
    ["mainMenu", "Browsing the main menu", "", "elapsedInState", "plain"],
    ["hideout", "Relaxing in the Hideout", "[[Hanging out as {hero}]]", "matchTime", "hero"],
    ["findingMatch", "Looking for a match", "", "queueTime", "plain"],
    ["matchFound", "Loading into a match", "", "elapsedInState", "plain"],
    ["preGame", "Waiting for the match to start", "[[Playing as {hero}]]", "elapsedInState", "hero"],
    ["inMatch", "In a match", "[[Playing as {hero}]]", "matchTime", "hero"],
    ["streetBrawlRound", "Playing Street Brawl", "[[Round {round}]]", "matchTime", "hero"],
    ["paused", "Match paused", "[[Playing as {hero}]]", "none", "hero"],
    ["spectating", "Spectating a match", "", "matchTime", "hidden"],
    ["postGame", "Match finished", "{result}", "elapsedInState", "hero"],
    ["privateLobby", "In a private match", "", "elapsedInState", "hidden"],
    ["practice", "Practicing", "", "elapsedInState", "hero"],
];

// Per-hero overrides never apply here, so one can never key off an observed player or a custom game.
const NO_HERO_SCOPE: PresenceStateId[] = ["playing", "mainMenu", "spectating", "privateLobby"];

const IN_MATCH_DETAILS: { [variant in PresenceVariantId]?: string } = {
    unranked: "Playing Unranked",
    ranked: "Playing Ranked",
    bots: "Playing against bots",
    tutorial: "Learning in the tutorial",
    streetBrawl: "Playing Street Brawl",
    sandbox: "Experimenting in the Sandbox",
    exploreNyc: "Exploring New York",
};
const FINDING_MATCH_DETAILS: { [variant in PresenceVariantId]?: string } = {
    unranked: "Looking for an Unranked match",
    ranked: "Looking for a Ranked match",
    bots: "Setting up a bot match",
    streetBrawl: "Looking for a Street Brawl match",
};

/** Every placeholder a template may use. */
const PLACEHOLDERS = [
    "hero",
    "heroPresence",
    "mode",
    "gameMode",
    "rank",
    "kills",
    "deaths",
    "assists",
    "souls",
    "partySize",
    "partyMax",
    "round",
    "scoreAmber",
    "scoreSapphire",
    "elapsed",
    "queueTime",
    "result",
    "matchId",
] as const;
type Placeholder = (typeof PLACEHOLDERS)[number];
// Placeholders that identify the match: no built-in template uses them.
const SENSITIVE: Placeholder[] = ["matchId"];

const RANK_IMAGE_BASE = "https://api.deadlock-api.com/v1/assets/ranks";
const MAX_URL_CHARS = 256;
const MAX_TEXT_CHARS = 128;
const SEPARATORS = "-–—,/:;|&·•()[]";

/** The match the preview pretends is being played. */
const SAMPLE = {
    hero: "Haze",
    rankTier: 5,
    rankSubrank: 2,
    elapsedSecs: 754,
    elapsed: "12:34",
    queuedSecs: 75,
    queueTime: "1:15",
    kills: "12",
    deaths: "3",
    assists: "8",
    souls: "24.1k",
    matchId: "123456789",
    round: "3",
    scoreAmber: "2",
    scoreSapphire: "1",
    partySize: 3,
    partyMax: 6,
    streetBrawlPartyMax: 4,
};

const MODE_NAMES: { [variant in PresenceVariantId]?: string } = {
    unranked: "Unranked",
    ranked: "Ranked",
    bots: "vs bots",
    tutorial: "Tutorial",
};
const GAME_MODE_NAMES: { [variant in PresenceVariantId]?: string } = {
    streetBrawl: "Street Brawl",
    sandbox: "Sandbox",
    exploreNyc: "Explore NYC",
};

function builtinState(id: PresenceStateId): PresencePartialSlot {
    const [, details, state, timer, art] = STATES.find((row) => row[0] === id)!;
    return {
        enabled: true,
        details,
        state,
        largeImage: { enabled: art === "hero", source: "heroIcon" },
        smallImage: { enabled: false, source: "rankBadge" },
        largeText: art === "hidden" ? "" : "{hero}",
        smallText: art === "hidden" ? "" : "{rank}",
        timer,
    };
}

function builtinVariant(state: PresenceStateId, variant: PresenceVariantId): PresencePartialSlot | undefined {
    if (state === "hideout" && variant === "party") {
        return { state: "[[In a party of {partySize} as {hero}||In a party of {partySize}]]" };
    }
    if (state === "findingMatch") {
        const details = FINDING_MATCH_DETAILS[variant];
        return details === undefined ? undefined : { details };
    }
    if (state !== "inMatch" && state !== "paused") return undefined;
    const details = IN_MATCH_DETAILS[variant];
    if (details === undefined) return undefined;
    return variant === "ranked" ? { details, smallImage: { enabled: true } } : { details };
}

export const PRESENCE_LAYOUT: PresenceStateInfo[] = STATES.map(([id]) => ({
    id,
    variants: VARIANTS[id] ?? [],
    heroScope: !NO_HERO_SCOPE.includes(id),
}));

export const PRESENCE_PLACEHOLDERS: PresencePlaceholder[] = PLACEHOLDERS.map((name) => ({
    name,
    sensitive: SENSITIVE.includes(name),
}));

/** Every built-in state and variant slot written out, for the editor to show and reset to. */
export const PRESENCE_DEFAULTS: PresenceConfig = { states: {}, variants: {}, heroes: {} };
for (const { id, variants } of PRESENCE_LAYOUT) {
    PRESENCE_DEFAULTS.states[id] = builtinState(id);
    for (const variant of variants) {
        const slot = builtinVariant(id, variant);
        if (slot) (PRESENCE_DEFAULTS.variants[id] ??= {})[variant] = slot;
    }
}

/**
 * One slot, each field from the first layer that sets it: the hero's override of the variant, the variant, the
 * hero's override of the state, the state, then the built-in defaults.
 */
function resolveSlot(
    config: PresenceConfig,
    state: PresenceStateId,
    variant: PresenceVariantId | null,
    heroId: number | null,
): PresenceSlot {
    const hero = heroId === null || NO_HERO_SCOPE.includes(state) ? undefined : config.heroes[heroId];
    const layers = [
        variant ? hero?.variants[state]?.[variant] : undefined,
        variant ? config.variants[state]?.[variant] : undefined,
        hero?.states[state],
        config.states[state],
        variant ? builtinVariant(state, variant) : undefined,
        builtinState(state),
    ].filter((layer) => layer !== undefined);
    const pick = <K extends keyof PresencePartialSlot>(key: K) =>
        layers.find((layer) => layer[key] !== undefined)?.[key];
    const image = (key: "largeImage" | "smallImage", source: PresenceImage["source"]): PresenceImage => {
        const field = <F extends keyof PresencePartialImage>(name: F) =>
            layers.find((layer) => layer[key]?.[name] !== undefined)?.[key]?.[name];
        return { enabled: field("enabled") ?? false, source: field("source") ?? source };
    };
    return {
        enabled: pick("enabled") ?? true,
        details: pick("details") ?? "",
        state: pick("state") ?? "",
        largeImage: image("largeImage", "heroIcon"),
        smallImage: image("smallImage", "rankBadge"),
        largeText: pick("largeText") ?? "",
        smallText: pick("smallText") ?? "",
        timer: pick("timer") ?? "none",
        partySize: pick("partySize") ?? true,
    };
}

type Values = { [name in Placeholder]?: string };
type Item = { kind: "word" | "sep" | "gap"; text: string };

const isPlaceholder = (name: string): name is Placeholder => (PLACEHOLDERS as readonly string[]).includes(name);
const isSeparator = (char: string) => /\s/u.test(char) || SEPARATORS.includes(char);
const count = (text: string, chars: string) => [...text].filter((char) => chars.includes(char)).length;

/** Keeps the first alternative of each `[[a||b]]` group whose placeholders all have values, or nothing. */
function expandGroups(template: string, values: Values): string {
    let out = "";
    let rest = template;
    for (;;) {
        const start = rest.indexOf("[[");
        const length = start === -1 ? -1 : rest.slice(start + 2).indexOf("]]");
        if (length === -1) return out + rest;
        const alternatives = rest.slice(start + 2, start + 2 + length).split("||");
        const names = (text: string) =>
            text
                .split("{")
                .slice(1)
                .flatMap((part) => (part.includes("}") ? [part.slice(0, part.indexOf("}"))] : []));
        out += rest.slice(0, start);
        out += alternatives.find((text) => names(text).every((name) => !isPlaceholder(name) || values[name])) ?? "";
        rest = rest.slice(start + length + 4);
    }
}

function pushLiteral(items: Item[], text: string): void {
    for (const char of text) {
        const kind = isSeparator(char) ? "sep" : "word";
        const last = items.at(-1);
        if (last?.kind === kind) last.text += char;
        else items.push({ kind, text: char });
    }
}

/** A placeholder with no value. Separators between two empty placeholders in a row go into the first gap. */
function pushGap(items: Item[]): void {
    const last = items.at(-1);
    const before = items.at(-2);
    if (last?.kind === "gap") return;
    if (last?.kind === "sep" && before?.kind === "gap") {
        before.text += last.text;
        items.pop();
        return;
    }
    items.push({ kind: "gap", text: "" });
}

function tokenize(template: string, values: Values): Item[] {
    const items: Item[] = [];
    let rest = template;
    for (;;) {
        const start = rest.indexOf("{");
        const after = rest.slice(start + 1);
        const end = start === -1 ? -1 : after.indexOf("}");
        if (end === -1) break;
        const name = after.slice(0, end);
        if (!isPlaceholder(name)) {
            pushLiteral(items, rest.slice(0, start + 1));
            rest = after;
            continue;
        }
        pushLiteral(items, rest.slice(0, start));
        const value = values[name];
        const last = items.at(-1);
        if (!value) pushGap(items);
        else if (last?.kind === "word") last.text += value;
        else items.push({ kind: "word", text: value });
        rest = after.slice(end + 1);
    }
    pushLiteral(items, rest);
    return items;
}

/** Removes the separators and brackets that only joined an empty placeholder to its neighbours. */
function resolveGaps(items: Item[]): void {
    items.forEach((gap, at) => {
        if (gap.kind !== "gap") return;
        const separator = (index: number) => (items[index]?.kind === "sep" ? items[index] : undefined);
        const left = separator(at - 1);
        const right = separator(at + 1);
        const isWord = (item: Item) => item.kind === "word";
        const joinsWords = items.slice(0, at).some(isWord) && items.slice(at + 1).some(isWord);

        let opens = count(gap.text, "([");
        if (left) {
            opens += count(left.text, "([");
            left.text = [...left.text].filter((char) => !"([".includes(char)).join("");
        }
        if (right) right.text = [...right.text].filter((char) => !(")]".includes(char) && opens-- > 0)).join("");

        if (!joinsWords && left) left.text = "";
        if (right && (!joinsWords || left)) right.text = "";
    });
}

/** Discord rejects text under 2 characters; a zero-width space keeps a 1-character line valid. */
function fit(text: string): string | null {
    const chars = [...text.trim()];
    if (chars.length === 0) return null;
    if (chars.length > MAX_TEXT_CHARS) return `${chars.slice(0, MAX_TEXT_CHARS - 1).join("")}…`;
    return chars.length < 2 ? `${chars.join("")}​` : chars.join("");
}

function render(template: string, values: Values): string | null {
    const items = tokenize(expandGroups(template, values), values);
    resolveGaps(items);
    return fit(items.map((item) => (item.kind === "gap" ? "" : item.text)).join(""));
}

function customUrl(url: string): string | null {
    const ok =
        url.startsWith("https://") &&
        url.length > "https://".length &&
        [...url].length <= MAX_URL_CHARS &&
        !/[\s\p{Cc}]/u.test(url);
    return ok ? url : null;
}

/** What Discord would show for a state, drawn for a made-up player in a made-up match. */
export function presencePreview(
    config: PresenceConfig,
    state: PresenceStateId,
    variant: PresenceVariantId | null,
    heroId: number | null,
    sample: PresenceSample | null,
): PresenceCard | null {
    const slot = resolveSlot(config, state, variant, heroId);
    if (!slot.enabled) return null;

    const ranked = variant === "ranked";
    const queueing = state === "findingMatch";
    const streetBrawl = state === "streetBrawlRound" || variant === "streetBrawl";
    const party = state === "privateLobby" ? null : variant === "solo" ? 1 : SAMPLE.partySize;
    // Outside a match the game mode is the last match's, which says nothing about the size of the next party.
    const partyMax =
        streetBrawl && !["hideout", "mainMenu", "playing"].includes(state)
            ? SAMPLE.streetBrawlPartyMax
            : SAMPLE.partyMax;
    const values: Values = {
        hero: sample?.heroName ?? SAMPLE.hero,
        heroPresence: sample?.heroPresence ?? undefined,
        mode: variant ? MODE_NAMES[variant] : undefined,
        gameMode: streetBrawl ? GAME_MODE_NAMES.streetBrawl : variant ? GAME_MODE_NAMES[variant] : undefined,
        result: variant === "won" ? "Won" : variant === "lost" ? "Lost" : undefined,
        elapsed: SAMPLE.elapsed,
        kills: SAMPLE.kills,
        deaths: SAMPLE.deaths,
        assists: SAMPLE.assists,
        souls: SAMPLE.souls,
        // A rank shows only in the player's own ranked matches.
        rank: ranked && sample?.rankName ? `${sample.rankName} ${SAMPLE.rankSubrank}` : undefined,
        round: SAMPLE.round,
        scoreAmber: SAMPLE.scoreAmber,
        scoreSapphire: SAMPLE.scoreSapphire,
        matchId: SAMPLE.matchId,
        partySize: party === null ? undefined : String(party),
        partyMax: party === null ? undefined : String(partyMax),
        queueTime: queueing && party !== null ? SAMPLE.queueTime : undefined,
    };
    const image = ({ enabled, source }: PresenceImage): string | null => {
        if (!enabled) return null;
        if (source === "heroPortrait") return sample?.heroPortrait ?? sample?.heroIcon ?? null;
        if (source === "heroIcon") return sample?.heroIcon ?? sample?.heroPortrait ?? null;
        if (source === "rankBadge") {
            return ranked ? `${RANK_IMAGE_BASE}/${SAMPLE.rankTier}/${SAMPLE.rankSubrank}/image` : null;
        }
        return source === "modeIcon" ? null : customUrl(source.customUrl);
    };
    const elapsedSecs: Record<PresenceTimer, number | null> = {
        none: null,
        elapsedInState: SAMPLE.elapsedSecs,
        matchTime: SAMPLE.elapsedSecs,
        queueTime: queueing ? SAMPLE.queuedSecs : null,
    };
    return {
        details: render(slot.details, values),
        state: render(slot.state, values),
        largeText: render(slot.largeText, values),
        smallText: render(slot.smallText, values),
        largeImage: image(slot.largeImage),
        smallImage: image(slot.smallImage),
        elapsedSecs: elapsedSecs[slot.timer],
        party: slot.partySize && party !== null && party >= 2 ? [party, partyMax] : null,
    };
}
