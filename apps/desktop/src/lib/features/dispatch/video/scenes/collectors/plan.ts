import { badgeParts } from "@deadlock-plus/stats/rank";
import type { Signal, SignalId } from "@deadlock-plus/stats/dispatch/signals";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import { climbSteps, topHeroes } from "../../../kinds/collectors/model";
import type { Beat } from "../../beats";

export type CardBeatId = "c_grind" | "c_main" | "c_pull" | "c_insert" | "c_climb";
export type CollectorsBeatId = "c_pack" | "c_tear" | CardBeatId | "c_chase" | "c_slab" | "c_fan";

/** Every beat the Pack Opening can play, in story order (the cards between `c_tear` and `c_chase` reorder). */
export const COLLECTORS_BEAT_IDS: readonly CollectorsBeatId[] = [
    "c_pack",
    "c_tear",
    "c_grind",
    "c_main",
    "c_pull",
    "c_insert",
    "c_climb",
    "c_chase",
    "c_slab",
    "c_fan",
];

/**
 * Signals a pull card (and the insert) can carry. Left out: mates and enemies (mate-stats and enemy-stats have
 * no mode filter, so a ranked-only Copy cannot claim them), the single best game and month swings (other kinds
 * own those), climb and slide (the climb card's), one_trick (the Main card's), vs_last and dry_spell (too thin).
 */
export const PULL_FACES = [
    "streak",
    "losing_then_winning",
    "bounce_back",
    "marathon",
    "mvp",
    "explorer",
    "debut",
    "night_owl",
    "grinder",
    "weekender",
    "winning",
    "losing",
] as const satisfies readonly SignalId[];
export type PullFace = (typeof PULL_FACES)[number];

/** What the chase card can be. `peak` and `main` also stand in when no signal is chase-worthy. */
export const CHASE_FACES = [
    "peak",
    "bounce_back",
    "streak",
    "losing_then_winning",
    "main",
    "explorer",
    "mvp",
    "winning",
] as const;
export type ChaseFace = (typeof CHASE_FACES)[number];

/** Chase-worthy signals and the face each one gets. A slide or a losing season is never the chase. */
const CHASE_OF: Partial<Record<SignalId, ChaseFace>> = {
    climb: "peak",
    bounce_back: "bounce_back",
    streak: "streak",
    losing_then_winning: "losing_then_winning",
    one_trick: "main",
    explorer: "explorer",
    mvp: "mvp",
    winning: "winning",
};

/** A second card-worthy signal this strong earns an insert card. */
export const INSERT_MIN = 0.6;

export interface CardSlot {
    beat: CardBeatId;
    /** Orders the deal, weakest first: a signal's strength, or a small number from the card's own stat. */
    strength: number;
    signal?: SignalId;
    /** Pull and insert cards: which signal face they show. */
    face?: PullFace;
}

export interface Casting {
    /** Dealt in this order, before the chase. */
    cards: CardSlot[];
    chase: { face: ChaseFace; signal?: SignalId } | null;
}

/** False when a face would put a 0 on screen; that pull is skipped for the next signal. */
function usable(s: Signal): boolean {
    if (s.id === "losing") return s.facts.wins > 0;
    if (s.id === "winning") return s.facts.wins > 0;
    if (s.id === "night_owl") return s.facts.share > 0;
    return true;
}

const PULLABLE = new Set<SignalId>(PULL_FACES);

/**
 * Which cards the pack holds and which signal each one spends. The chase takes the strongest chase-worthy
 * signal (the lead); the climb card then takes climb or slide, the Main card one_trick, the pull the strongest
 * signal left, and an insert the next one when it is strong. A card with no data is not dealt.
 */
export function castCards(edition: Edition, signals: readonly Signal[]): Casting {
    const spent = new Set<SignalId>();
    const take = (s: Signal | undefined) => {
        if (s) spent.add(s.id);
        return s;
    };
    const free = (pred: (s: Signal) => boolean) => signals.find((s) => !spent.has(s.id) && pred(s));

    const top = topHeroes(edition.heroes, 1)[0];
    const hasHero = !!top && top.games > 0;
    const steps = climbSteps(edition.rank);
    const peakOk = edition.rank !== null && badgeParts(edition.rank.peakBadge) !== null && (steps ?? 0) >= 0;

    const lead = take(free((s) => CHASE_OF[s.id] !== undefined && usable(s) && (s.id !== "one_trick" || hasHero)));
    let chase: Casting["chase"] = null;
    if (lead) chase = { face: CHASE_OF[lead.id]!, signal: lead.id };
    else if (peakOk) chase = { face: "peak" };
    else if (hasHero) chase = { face: "main" };

    const cards: CardSlot[] = [{ beat: "c_grind", strength: 0.1 + Math.min(0.3, edition.stats.matches / 400) }];
    if (hasHero && chase?.face !== "main") {
        const trick = take(free((s) => s.id === "one_trick"));
        cards.push(
            trick
                ? { beat: "c_main", strength: trick.strength, signal: trick.id }
                : { beat: "c_main", strength: 0.5 * (top.games / Math.max(1, edition.stats.matches)) },
        );
    }
    if (edition.rank !== null) {
        const move = take(free((s) => s.id === "climb" || s.id === "slide"));
        cards.push(
            move
                ? { beat: "c_climb", strength: move.strength, signal: move.id }
                : { beat: "c_climb", strength: Math.min(0.45, 0.2 + 0.05 * Math.abs(steps ?? 0)) },
        );
    }
    const pull = take(free((s) => PULLABLE.has(s.id) && usable(s)));
    if (pull) {
        cards.push({ beat: "c_pull", strength: pull.strength, signal: pull.id, face: pull.id as PullFace });
        const insert = take(free((s) => PULLABLE.has(s.id) && usable(s) && s.strength >= INSERT_MIN));
        if (insert) {
            cards.push({ beat: "c_insert", strength: insert.strength, signal: insert.id, face: insert.id as PullFace });
        }
    }
    cards.sort(
        (a, b) => a.strength - b.strength || COLLECTORS_BEAT_IDS.indexOf(a.beat) - COLLECTORS_BEAT_IDS.indexOf(b.beat),
    );
    return { cards, chase };
}

interface Size {
    base: number;
    min: number;
    max: number;
}

const CARD: Size = { base: 3, min: 2, max: 4 };
const SIZES: Record<Exclude<CollectorsBeatId, CardBeatId>, Size> = {
    c_pack: { base: 2, min: 1, max: 3 },
    c_tear: { base: 1, min: 1, max: 2 },
    c_chase: { base: 5, min: 3, max: 7 },
    c_slab: { base: 3, min: 2, max: 4 },
    c_fan: { base: 3, min: 2, max: 4 },
};
const sizeOf = (id: CollectorsBeatId): Size => (id in SIZES ? SIZES[id as keyof typeof SIZES] : CARD);

function presents(slot: CardSlot | null, id: CollectorsBeatId, casting: Casting): string[] {
    switch (id) {
        case "c_pack":
            return ["matches:pack_hook", "season:pack"];
        case "c_tear":
            return ["serial:card_back"];
        case "c_grind":
            return ["matches:grind_card", "record:grind_card", "months:card_bars"];
        case "c_main":
            return ["heroes:main_card"];
        case "c_climb":
            return ["rank:climb_card"];
        case "c_pull":
            return [`${slot!.face}:pull_card`];
        case "c_insert":
            return [`${slot!.face}:insert_card`];
        case "c_chase":
            return [`${casting.chase!.face}:chase_card`];
        case "c_slab":
            return ["season:slab", "serial:slab"];
        case "c_fan":
            return ["cards:fan"];
    }
}

/**
 * The Pack Opening on the bar grid: pack, tear, the cards weakest first, the chase, the slab and the fan.
 * A dropped card frees its bars; spare bars grow the chase first, then the strongest cards; a short track
 * takes them back from the pack and the outro first. Always fills `bars` exactly.
 */
export function collectorsPlan(casting: Casting, bars: number): Beat<CollectorsBeatId>[] {
    const slots: { id: CollectorsBeatId; slot: CardSlot | null }[] = [
        { id: "c_pack", slot: null },
        { id: "c_tear", slot: null },
        ...casting.cards.map((c) => ({ id: c.beat, slot: c })),
        ...(casting.chase ? [{ id: "c_chase" as const, slot: null }] : []),
        { id: "c_slab", slot: null },
        { id: "c_fan", slot: null },
    ];
    const size = new Map(slots.map((s) => [s.id, sizeOf(s.id).base]));
    let total = [...size.values()].reduce((a, b) => a + b, 0);

    const strongest = [...casting.cards].reverse().map((c) => c.beat);
    const grow: CollectorsBeatId[] = [
        ...(casting.chase ? (["c_chase"] as const) : []),
        ...strongest,
        "c_slab",
        "c_fan",
        "c_pack",
        "c_tear",
    ];
    const shrink: CollectorsBeatId[] = [
        "c_pack",
        "c_fan",
        "c_slab",
        ...casting.cards.map((c) => c.beat),
        ...(casting.chase ? (["c_chase"] as const) : []),
    ];
    for (let capped = true; total < bars;) {
        let moved = false;
        for (const id of grow) {
            if (total >= bars) break;
            if (capped && size.get(id)! >= sizeOf(id).max) continue;
            size.set(id, size.get(id)! + 1);
            total++;
            moved = true;
        }
        if (!moved) capped = false;
    }
    for (let moved = true; total > bars && moved;) {
        moved = false;
        for (const id of shrink) {
            if (total <= bars) break;
            if (size.get(id)! <= sizeOf(id).min) continue;
            size.set(id, size.get(id)! - 1);
            total--;
            moved = true;
        }
    }

    let bar = 0;
    return slots.map(({ id, slot }) => {
        const signal = id === "c_chase" ? casting.chase!.signal : (slot?.signal ?? undefined);
        const beat: Beat<CollectorsBeatId> = {
            id,
            kind: "collectors",
            bar,
            bars: size.get(id)!,
            presents: presents(slot, id, casting),
            ...(signal ? { signal } : {}),
        };
        bar += beat.bars;
        return beat;
    });
}

/** Bars into the chase card where it flips: after the dim and the tremble, with at least two bars of holo left. */
export function chaseFlipBar(bars: number): number {
    return Math.max(1, Math.min(3, bars - 3));
}
