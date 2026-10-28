import type { Signal, SignalFacts, SignalId } from "@deadlock-plus/stats/dispatch/signals";
import type { Edition, RankPoint } from "@deadlock-plus/stats/dispatch/types";
import { climbSteps, peakOf, topHeroes } from "../../../kinds/collectors/model";
import { VIDEO_VARIANTS, videoCopyKey, type Beat } from "../../beats";
import type { SfxCue } from "../../sfx";
import {
    castCards,
    chaseFlipBar,
    type CardBeatId,
    type Casting,
    type ChaseFace,
    type CollectorsBeatId,
    type PullFace,
} from "./plan";

/** A slot is plain text, or a `_one`/`_other` pair picked by `count`. */
type SlotKind = "text" | "count";

const PULL_LINE: Record<PullFace, SlotKind> = {
    streak: "count",
    losing_then_winning: "count",
    bounce_back: "text",
    marathon: "count",
    mvp: "count",
    explorer: "count",
    debut: "count",
    night_owl: "text",
    grinder: "count",
    weekender: "text",
    winning: "text",
    losing: "text",
};

const CHASE_LINE: Record<ChaseFace, SlotKind> = {
    peak: "text",
    bounce_back: "text",
    streak: "count",
    losing_then_winning: "count",
    main: "count",
    explorer: "count",
    mvp: "count",
    winning: "text",
};

const faceSlots = <F extends string>(lines: Record<F, SlotKind>) =>
    Object.fromEntries(
        Object.entries<SlotKind>(lines).flatMap(([face, kind]) => [
            [`${face}_name`, "text"],
            [`${face}_line`, kind],
        ]),
    ) as Record<string, SlotKind>;

/** Every copy slot the Pack Opening can ask for, per beat. The insert card reads the pull card's face slots. */
export const COPY_SLOTS: Record<CollectorsBeatId, Record<string, SlotKind>> = {
    c_pack: { hook: "count", kicker: "text" },
    c_tear: { back: "text", deal: "count" },
    c_grind: { name: "text", line: "count", line_plain: "count", flavor: "text" },
    c_main: { name: "text", line: "count", line_plain: "count", line_trick: "count", flavor: "text" },
    c_pull: faceSlots(PULL_LINE),
    c_insert: { label: "text" },
    c_climb: {
        up_name: "text",
        up_line: "count",
        down_name: "text",
        down_line: "count",
        held_name: "text",
        held_line: "text",
    },
    c_chase: { tease: "text", stamp: "text", flavor: "text", ...faceSlots(CHASE_LINE), peak_line_nodate: "text" },
    c_slab: { label: "count", label_anon: "count", seal: "text" },
    c_fan: { cta: "text", sign: "text", sign_anon: "text" },
};

/** Every locale key the data can ask for, with both plural forms of a counted slot. */
export function slotKeys(): string[] {
    return Object.entries(COPY_SLOTS).flatMap(([beat, slots]) =>
        Object.entries(slots).flatMap(([slot, kind]) =>
            Array.from(
                { length: VIDEO_VARIANTS },
                (_, i) => `dispatch.video.collectors.${beat}.${slot}_${i + 1}`,
            ).flatMap((key) => (kind === "count" ? [`${key}_one`, `${key}_other`] : [key])),
        ),
    );
}

/** A line to translate: `t(key, params)`, or `tn(key, count, params)` when `count` is set. Params are formatted. */
export interface CopyRef {
    key: string;
    count?: number;
    params: Record<string, string>;
}

/** A number the scene draws big or counts up to, with the edition field it comes from. Never 0. */
export interface Stat {
    value: number;
    source: string;
}

export type Rarity = "common" | "uncommon" | "rare" | "gold" | "holo";
const RARITIES: readonly Rarity[] = ["common", "uncommon", "rare", "gold"];

export interface Card {
    beat: CardBeatId | "c_chase";
    /** `grind`, `main`, the climb's `up`/`down`/`held`, a pull face or a chase face. */
    face: string;
    rarity: Rarity;
    signal?: SignalId;
    name: CopyRef;
    line: CopyRef;
    /** Small italic text under the line, on the cards that carry one. */
    flavor?: CopyRef;
    /** The insert card's "insert" tag. */
    label?: CopyRef;
    stats: Stat[];
    /** Hero card art: smug for a winning record, battered for a losing one. */
    hero?: { id: number; mood: "gloat" | "critical" };
    /** Rank badges on the face, in reading order (start then end, or the peak alone). */
    badges?: number[];
}

export interface ChaseCard extends Card {
    /** The caption while the last card trembles face down. */
    tease: CopyRef;
    /** The "one of one" mark on the holo. */
    stamp: CopyRef;
    flavor: CopyRef;
}

export interface CollectorsVideoData {
    /** The plan's input: `collectorsPlan(data.casting, timing.bars)` gives the beats for any track. */
    casting: Casting;
    serial: string;
    pack: { hook: CopyRef; kicker: CopyRef; stats: Stat[] };
    tear: { back: CopyRef; deal: CopyRef };
    /** Dealt in this order, after the tear and before the chase. */
    cards: Card[];
    chase: ChaseCard | null;
    /** Ranked matches per month of the season, for the mini bars on the grind card; zeros are empty bars. */
    months: number[];
    /** The climb card's line, one point per ranked match; empty on editions frozen without it. */
    rankSeries: RankPoint[];
    slab: { label: CopyRef; seal: CopyRef; stats: Stat[] };
    fan: { cta: CopyRef; sign: CopyRef };
}

export interface CollectorsVideoDeps {
    hero: (id: number) => string;
    /** A badge's rank name, e.g. "Phantom 3". */
    badge: (badge: number) => string;
    /** A day in the edition's own time zone. */
    day: (unixS: number) => string;
    number: (n: number) => string;
    percent: (share: number) => string;
    season: string;
    serial: string;
    site: string;
}

type FactsOf<K extends SignalId> = SignalFacts[K];
const factsOf = <K extends SignalId>(signals: readonly Signal[], id: K): FactsOf<K> | undefined =>
    (signals.find((s) => s.id === id) as { facts: FactsOf<K> } | undefined)?.facts;

/**
 * Everything the Pack Opening draws, from the frozen edition and its signals: which cards the pack holds, each
 * card's copy keys and formatted params, and the numbers with their source fields.
 */
export function collectorsVideoData(
    edition: Edition,
    signals: readonly Signal[],
    deps: CollectorsVideoDeps,
): CollectorsVideoData {
    const { stats } = edition;
    const n = deps.number;
    const copy = (
        beat: CollectorsBeatId,
        slot: string,
        params: Record<string, string> = {},
        count?: number,
    ): CopyRef => {
        const key = videoCopyKey(edition.accountId, edition.id, "collectors", beat, slot);
        return count === undefined ? { key, params } : { key, count, params };
    };
    const casting = castCards(edition, signals);
    const player = edition.playerName ?? null;
    const season = deps.season;
    const mood = (wins: number, games: number): "gloat" | "critical" => (wins * 2 >= games ? "gloat" : "critical");
    const top = topHeroes(edition.heroes, 1)[0];

    const pullFace = (beat: "c_pull" | "c_insert", face: PullFace, rarity: Rarity): Card => {
        const s = (id: string) => copy("c_pull", `${face}_${id}`);
        const line = (params: Record<string, string>, count?: number) => copy("c_pull", `${face}_line`, params, count);
        const card = (l: CopyRef, statsOf: Stat[], extra: Partial<Card> = {}): Card => ({
            beat,
            face,
            rarity,
            signal: face,
            name: s("name"),
            line: l,
            stats: statsOf,
            ...(beat === "c_insert" ? { label: copy("c_insert", "label") } : {}),
            ...extra,
        });
        switch (face) {
            case "streak": {
                const f = factsOf(signals, "streak")!;
                return card(line({}, f.wins), [{ value: f.wins, source: "longestWin" }]);
            }
            case "losing_then_winning": {
                const f = factsOf(signals, "losing_then_winning")!;
                return card(line({ wins: n(f.wins), of: n(f.of) }, f.losses), [
                    { value: f.losses, source: "tape[].outcome" },
                    { value: f.wins, source: "tape[].outcome" },
                ]);
            }
            case "bounce_back": {
                const f = factsOf(signals, "bounce_back")!;
                return card(
                    line({ low: deps.badge(f.lowBadge), end: deps.badge(f.endBadge), date: deps.day(f.lowS) }),
                    [],
                    { badges: [f.lowBadge, f.endBadge] },
                );
            }
            case "marathon": {
                const f = factsOf(signals, "marathon")!;
                return card(line({ date: deps.day(f.startS) }, f.matches), [
                    { value: f.matches, source: "stats.longestSession.matches" },
                ]);
            }
            case "mvp": {
                const f = factsOf(signals, "mvp")!;
                return card(line({}, f.placements), [{ value: f.placements, source: "combat[].mvpRankCounts" }]);
            }
            case "explorer": {
                const f = factsOf(signals, "explorer")!;
                return card(line({}, f.heroes), [{ value: f.heroes, source: "heroes.length" }]);
            }
            case "debut": {
                const f = factsOf(signals, "debut")!;
                return card(
                    line({ hero: deps.hero(f.heroId) }, f.games),
                    [{ value: f.games, source: "heroes[].games" }],
                    {
                        hero: { id: f.heroId, mood: mood(f.wins, f.games) },
                    },
                );
            }
            case "night_owl": {
                const f = factsOf(signals, "night_owl")!;
                return card(line({ share: deps.percent(f.share) }), [{ value: f.share, source: "stats.nightShare" }]);
            }
            case "grinder": {
                const f = factsOf(signals, "grinder")!;
                return card(line({ window: n(f.windowDays) }, f.daysPlayed), [
                    { value: f.daysPlayed, source: "stats.daysPlayed" },
                ]);
            }
            case "weekender": {
                const f = factsOf(signals, "weekender")!;
                return card(line({ share: deps.percent(f.share) }), [{ value: f.share, source: "tape[].startS" }]);
            }
            case "winning":
            case "losing": {
                const f = factsOf(signals, face)!;
                return card(line({ rate: deps.percent(f.winrate), wins: n(f.wins) }), [
                    { value: f.winrate, source: "stats.winrate" },
                    { value: f.wins, source: "stats.wins" },
                ]);
            }
        }
    };

    const tiers = casting.cards.length;
    const cards = casting.cards.map((slot, i): Card => {
        const rarity = RARITIES[Math.floor((i * RARITIES.length) / Math.max(1, tiers))];
        switch (slot.beat) {
            case "c_grind": {
                const record = stats.wins > 0 && stats.losses > 0;
                return {
                    beat: "c_grind",
                    face: "grind",
                    rarity,
                    name: copy("c_grind", "name"),
                    line: record
                        ? copy("c_grind", "line", { wins: n(stats.wins), losses: n(stats.losses) }, stats.matches)
                        : copy("c_grind", "line_plain", {}, stats.matches),
                    flavor: copy("c_grind", "flavor", { season }),
                    stats: [
                        { value: stats.matches, source: "stats.matches" },
                        ...(record
                            ? [
                                  { value: stats.wins, source: "stats.wins" },
                                  { value: stats.losses, source: "stats.losses" },
                              ]
                            : []),
                    ],
                };
            }
            case "c_main": {
                const hero = deps.hero(top.heroId);
                const share = top.games / Math.max(1, stats.matches);
                return {
                    beat: "c_main",
                    face: "main",
                    rarity,
                    signal: slot.signal,
                    name: copy("c_main", "name", { hero }),
                    line: slot.signal
                        ? copy("c_main", "line_trick", { hero, share: deps.percent(share) }, top.games)
                        : top.wins > 0
                          ? copy("c_main", "line", { hero, wins: n(top.wins) }, top.games)
                          : copy("c_main", "line_plain", { hero }, top.games),
                    flavor: copy("c_main", "flavor", { hero }),
                    stats: [
                        { value: top.games, source: "heroes[0].games" },
                        ...(top.wins > 0 ? [{ value: top.wins, source: "heroes[0].wins" }] : []),
                    ],
                    hero: { id: top.heroId, mood: mood(top.wins, top.games) },
                };
            }
            case "c_climb": {
                const rank = edition.rank!;
                const steps = climbSteps(rank) ?? 0;
                const dir = steps > 0 ? "up" : steps < 0 ? "down" : "held";
                const start = deps.badge(rank.startBadge);
                const end = deps.badge(rank.endBadge);
                return {
                    beat: "c_climb",
                    face: dir,
                    rarity,
                    signal: slot.signal,
                    name: copy("c_climb", `${dir}_name`),
                    line:
                        dir === "held"
                            ? copy("c_climb", "held_line", { badge: end })
                            : copy("c_climb", `${dir}_line`, { start, end }, Math.abs(steps)),
                    stats: steps === 0 ? [] : [{ value: Math.abs(steps), source: "rank.endBadge - rank.startBadge" }],
                    badges: dir === "held" ? [rank.endBadge] : [rank.startBadge, rank.endBadge],
                };
            }
            case "c_pull":
            case "c_insert":
                return pullFace(slot.beat, slot.face!, rarity);
        }
    });

    const data: CollectorsVideoData = {
        casting,
        serial: deps.serial,
        pack: {
            hook: copy("c_pack", "hook", { season }, stats.matches),
            kicker: copy("c_pack", "kicker", { season, date: deps.day(edition.window.endS - 1) }),
            stats: [{ value: stats.matches, source: "stats.matches" }],
        },
        tear: {
            back: copy("c_tear", "back", { serial: deps.serial }),
            deal: copy("c_tear", "deal", {}, cards.length + (casting.chase ? 1 : 0)),
        },
        cards,
        chase: casting.chase ? chaseCard(edition, signals, casting.chase, deps, copy) : null,
        months: (edition.months ?? []).map((m) => m.matches),
        rankSeries: edition.rankSeries ?? [],
        slab: {
            label:
                player === null
                    ? copy("c_slab", "label_anon", { season }, stats.matches)
                    : copy("c_slab", "label", { season, player }, stats.matches),
            seal: copy("c_slab", "seal", { serial: deps.serial }),
            stats: [{ value: stats.matches, source: "stats.matches" }],
        },
        fan: {
            cta: copy("c_fan", "cta", { site: deps.site }),
            sign: player === null ? copy("c_fan", "sign_anon", { season }) : copy("c_fan", "sign", { player }),
        },
    };
    spreadShapes([data.pack.hook, ...data.cards.map((c) => c.line), ...(data.chase ? [data.chase.line] : [])]);
    return data;
}

export type LineShape = "number" | "name" | "question" | "quote" | "shout" | "time" | "kicker" | "sentence";

/**
 * The shape of each variant of a main line, in variant order. One video's main lines (the hook, each card's line,
 * the chase's) never share a shape, so the pack does not read as one sentence pattern repeated.
 */
export const LINE_SHAPES: Record<string, readonly LineShape[]> = {
    "c_pack.hook": ["number", "name", "question", "time", "shout"],
    "c_grind.line": ["number", "kicker", "sentence", "question", "time"],
    "c_grind.line_plain": ["number", "sentence", "question", "time", "shout"],
    "c_main.line": ["name", "number", "sentence", "quote", "question"],
    "c_main.line_plain": ["name", "number", "sentence", "quote", "time"],
    "c_main.line_trick": ["number", "name", "shout", "kicker", "question"],
    "c_climb.up_line": ["name", "number", "time", "question", "shout"],
    "c_climb.down_line": ["sentence", "name", "number", "time", "quote"],
    "c_climb.held_line": ["name", "sentence", "question", "time", "shout"],
    "c_chase.peak_line": ["name", "time", "kicker", "question", "quote"],
    "c_chase.peak_line_nodate": ["name", "sentence", "kicker", "question", "shout"],
    "c_chase.bounce_back_line": ["name", "time", "sentence", "question", "quote"],
    "c_chase.streak_line": ["number", "shout", "sentence", "question", "time"],
    "c_chase.losing_then_winning_line": ["number", "sentence", "time", "question", "quote"],
    "c_chase.main_line": ["name", "number", "question", "shout", "time"],
    "c_chase.explorer_line": ["number", "question", "sentence", "shout", "time"],
    "c_chase.mvp_line": ["number", "kicker", "sentence", "question", "time"],
    "c_chase.winning_line": ["number", "sentence", "question", "shout", "kicker"],
    "c_pull.streak_line": ["number", "sentence", "shout", "kicker", "quote"],
    "c_pull.losing_then_winning_line": ["number", "time", "shout", "sentence", "question"],
    "c_pull.bounce_back_line": ["name", "kicker", "time", "sentence", "shout"],
    "c_pull.marathon_line": ["number", "time", "quote", "question", "shout"],
    "c_pull.mvp_line": ["number", "sentence", "time", "question", "kicker"],
    "c_pull.explorer_line": ["number", "sentence", "question", "shout", "time"],
    "c_pull.debut_line": ["name", "number", "quote", "time", "question"],
    "c_pull.night_owl_line": ["number", "time", "question", "quote", "sentence"],
    "c_pull.grinder_line": ["number", "sentence", "question", "time", "shout"],
    "c_pull.weekender_line": ["number", "time", "question", "sentence", "shout"],
    "c_pull.winning_line": ["number", "sentence", "shout", "question", "time"],
    "c_pull.losing_line": ["number", "sentence", "quote", "question", "time"],
    "c_slab.label": ["name", "number", "sentence", "kicker", "time"],
    "c_slab.label_anon": ["name", "sentence", "number", "kicker", "time"],
};

const KEY = /^dispatch\.video\.collectors\.(c_\w+)\.(\w+)_(\d)$/;

/** The shape of a main line's key, or null for a key that is not a main line. */
export function lineShape(key: string): LineShape | null {
    const m = KEY.exec(key);
    return m ? (LINE_SHAPES[`${m[1]}.${m[2]}`]?.[Number(m[3]) - 1] ?? null) : null;
}

/**
 * Moves each main line off its seeded variant only as far as needed for every shape to differ, searching from the
 * seeded picks so a line stays where it was whenever it can. Keeps the seeded picks when no such set exists.
 */
function spreadShapes(refs: CopyRef[]): void {
    const slots = refs.map((ref) => {
        const m = KEY.exec(ref.key)!;
        return {
            ref,
            base: `dispatch.video.collectors.${m[1]}.${m[2]}`,
            variant: Number(m[3]),
            shapes: LINE_SHAPES[`${m[1]}.${m[2]}`],
        };
    });
    const picks: number[] = [];
    const used = new Set<LineShape>();
    const search = (i: number): boolean => {
        if (i === slots.length) return true;
        const { variant, shapes } = slots[i];
        if (!shapes) {
            picks[i] = variant;
            return search(i + 1);
        }
        for (let k = 0; k < shapes.length; k++) {
            const v = ((variant - 1 + k) % shapes.length) + 1;
            const shape = shapes[v - 1];
            if (used.has(shape)) continue;
            used.add(shape);
            picks[i] = v;
            if (search(i + 1)) return true;
            used.delete(shape);
        }
        return false;
    };
    if (!search(0)) return;
    slots.forEach((s, i) => (s.ref.key = `${s.base}_${picks[i]}`));
}

type Copy = (beat: CollectorsBeatId, slot: string, params?: Record<string, string>, count?: number) => CopyRef;

function chaseCard(
    edition: Edition,
    signals: readonly Signal[],
    chase: NonNullable<Casting["chase"]>,
    deps: CollectorsVideoDeps,
    copy: Copy,
): ChaseCard {
    const n = deps.number;
    const { face } = chase;
    const line = (params: Record<string, string>, count?: number, slot = `${face}_line`) =>
        copy("c_chase", slot, params, count);
    const base = {
        beat: "c_chase" as const,
        face,
        rarity: "holo" as const,
        ...(chase.signal ? { signal: chase.signal } : {}),
        name: copy("c_chase", `${face}_name`),
        tease: copy("c_chase", "tease"),
        stamp: copy("c_chase", "stamp"),
        flavor: copy("c_chase", "flavor", { season: deps.season }),
    };
    switch (face) {
        case "peak": {
            const badge = edition.rank!.peakBadge;
            const at = peakOf(edition.rankSeries);
            const dated = at !== null && at.badge === badge;
            return {
                ...base,
                line: dated
                    ? line({ badge: deps.badge(badge), date: deps.day(at.startS) })
                    : line({ badge: deps.badge(badge) }, undefined, "peak_line_nodate"),
                stats: [],
                badges: [badge],
            };
        }
        case "bounce_back": {
            const f = factsOf(signals, "bounce_back")!;
            return {
                ...base,
                line: line({ low: deps.badge(f.lowBadge), end: deps.badge(f.endBadge), date: deps.day(f.lowS) }),
                stats: [],
                badges: [f.lowBadge, f.endBadge],
            };
        }
        case "streak": {
            const f = factsOf(signals, "streak")!;
            return { ...base, line: line({}, f.wins), stats: [{ value: f.wins, source: "longestWin" }] };
        }
        case "losing_then_winning": {
            const f = factsOf(signals, "losing_then_winning")!;
            return {
                ...base,
                line: line({ wins: n(f.wins), of: n(f.of) }, f.losses),
                stats: [
                    { value: f.losses, source: "tape[].outcome" },
                    { value: f.wins, source: "tape[].outcome" },
                ],
            };
        }
        case "main": {
            const top = topHeroes(edition.heroes, 1)[0];
            const share = top.games / Math.max(1, edition.stats.matches);
            return {
                ...base,
                line: line({ hero: deps.hero(top.heroId), share: deps.percent(share) }, top.games),
                stats: [{ value: top.games, source: "heroes[0].games" }],
                hero: { id: top.heroId, mood: top.wins * 2 >= top.games ? "gloat" : "critical" },
            };
        }
        case "explorer": {
            const f = factsOf(signals, "explorer")!;
            return { ...base, line: line({}, f.heroes), stats: [{ value: f.heroes, source: "heroes.length" }] };
        }
        case "mvp": {
            const f = factsOf(signals, "mvp")!;
            return {
                ...base,
                line: line({}, f.placements),
                stats: [{ value: f.placements, source: "combat[].mvpRankCounts" }],
            };
        }
        case "winning": {
            const f = factsOf(signals, "winning")!;
            return {
                ...base,
                line: line({ rate: deps.percent(f.winrate), wins: n(f.wins) }),
                stats: [
                    { value: f.winrate, source: "stats.winrate" },
                    { value: f.wins, source: "stats.wins" },
                ],
            };
        }
    }
}

/** Every line the data asks for, for the prepare step to translate and the tests to check. */
export function copyRefs(data: CollectorsVideoData): CopyRef[] {
    const card = (c: Card) => [c.name, c.line, ...(c.flavor ? [c.flavor] : []), ...(c.label ? [c.label] : [])];
    return [
        data.pack.hook,
        data.pack.kicker,
        data.tear.back,
        data.tear.deal,
        ...data.cards.flatMap(card),
        ...(data.chase ? [...card(data.chase), data.chase.tease, data.chase.stamp] : []),
        data.slab.label,
        data.slab.seal,
        data.fan.cta,
        data.fan.sign,
    ];
}

const CARD_BEATS = new Set<CollectorsBeatId>(["c_grind", "c_main", "c_pull", "c_insert", "c_climb"]);

/**
 * The sound of each motion, on the plan's bar lines: the glint as the pack turns, the rip and the deal, a flip
 * on each card's downbeat, the build under the chase and the holo on its flip, the slab's click, the fan's deal.
 */
export function collectorsSfx(plan: readonly Beat<CollectorsBeatId>[], barSeconds: number): SfxCue[] {
    const cues: SfxCue[] = [];
    for (const beat of plan) {
        const at = (bars: number) => (beat.bar + bars) * barSeconds;
        if (beat.id === "c_pack") cues.push({ cue: "foil_glint", atSeconds: at(0) });
        else if (beat.id === "c_tear") {
            cues.push({ cue: "foil_rip", atSeconds: at(0) }, { cue: "card_deal", atSeconds: at(0.5) });
        } else if (CARD_BEATS.has(beat.id)) cues.push({ cue: "card_flip", atSeconds: at(0) });
        else if (beat.id === "c_chase") {
            cues.push(
                { cue: "chase_build", atSeconds: at(0) },
                { cue: "holo_reveal", atSeconds: at(chaseFlipBar(beat.bars)) },
            );
        } else if (beat.id === "c_slab") cues.push({ cue: "slab_click", atSeconds: at(Math.min(1, beat.bars - 1)) });
        else if (beat.id === "c_fan") cues.push({ cue: "card_deal", atSeconds: at(0) });
    }
    return cues;
}
