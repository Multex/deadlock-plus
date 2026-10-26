import type { Signal, SignalId } from "@deadlock-plus/stats/dispatch/signals";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import type { Beat } from "../../beats";
import type { InterviewTopic } from "./slots";

export const MONTHLY_BEAT_IDS = [
    "m_flash",
    "m_takes",
    "m_shot",
    "m_wardrobe",
    "m_interview",
    "m_feature",
    "m_cover",
    "m_stand",
    "m_end",
] as const;
export type MonthlyBeatId = (typeof MONTHLY_BEAT_IDS)[number];
type Placed = Exclude<MonthlyBeatId, "m_flash" | "m_stand" | "m_end">;

/** Stats a beat shows that are not signals; each belongs to one beat per video. */
export type MonthlyFact = "matches" | "calendar" | "best_game" | "heroes" | "busiest" | "mate" | "hours" | "record" | "days";

export interface CastBeat {
    id: MonthlyBeatId;
    /** Signals this beat spends, strongest first; `[0]` is the beat's own. */
    signals: Signal[];
    facts: MonthlyFact[];
    /** The interview's questions, in the order they are asked. */
    topics?: InterviewTopic[];
}

export interface MonthlyCast {
    /** The strongest signal the Monthly can tell; the beat right after the flash spends it. */
    lead: Signal | null;
    /** Play order. */
    beats: CastBeat[];
}

/** Where each signal reads best, first choice first. Signals this video cannot tell are absent. */
const HOMES: Partial<Record<SignalId, readonly Placed[]>> = {
    climb: ["m_feature", "m_cover"],
    slide: ["m_feature", "m_cover"],
    streak: ["m_feature", "m_interview", "m_cover"],
    losing_then_winning: ["m_feature", "m_takes", "m_cover"],
    marathon: ["m_feature", "m_interview", "m_takes", "m_cover"],
    duo: ["m_interview", "m_feature", "m_cover"],
    nemesis: ["m_interview", "m_feature", "m_cover"],
    one_trick: ["m_wardrobe", "m_feature", "m_cover"],
    explorer: ["m_wardrobe", "m_feature", "m_cover"],
    debut: ["m_wardrobe", "m_interview", "m_cover"],
    big_game: ["m_shot"],
    night_owl: ["m_interview", "m_takes", "m_feature", "m_cover"],
    grinder: ["m_takes", "m_interview", "m_cover"],
    weekender: ["m_takes", "m_interview", "m_cover"],
    dry_spell: ["m_takes", "m_interview", "m_cover"],
    winning: ["m_feature", "m_cover"],
    losing: ["m_feature", "m_cover"],
    vs_last: ["m_feature", "m_interview", "m_cover"],
    mvp: ["m_interview", "m_cover"],
};

const ROOM: Record<Placed, number> = { m_takes: 1, m_shot: 1, m_wardrobe: 1, m_interview: 3, m_feature: 1, m_cover: 3 };
const MIN_TOPICS = 2;
/** `vs_last` also fires on a winrate move; the Monthly only words a move in the match count this big. */
export const VS_LAST_SHARE = 0.2;
const HOUR_S = 3600;

/** A signal the Monthly can put into words: `vs_last` only when the match count itself moved. */
function tellable(s: Signal): boolean {
    if (!HOMES[s.id]) return false;
    // A companion is only worth a line when the history has a name for them.
    if (s.id === "duo") return s.facts.mate.name !== null;
    if (s.id === "nemesis") return s.facts.rival.name !== null;
    return s.id !== "vs_last" || Math.abs(s.facts.matchesChange) >= VS_LAST_SHARE;
}

export function interviewTopic(s: Signal): InterviewTopic {
    if (s.id === "vs_last") return s.facts.matchesChange > 0 ? "vs_last_up" : "vs_last_down";
    return s.id as InterviewTopic;
}

/** The contact sheet needs at least one played day, from `days` or the tape. */
export function hasTakes(e: Edition): boolean {
    return (e.days?.some((d) => d.matches > 0) ?? false) || (e.tape?.length ?? 0) > 0;
}

function fillers(e: Edition): { interview: MonthlyFact[]; cover: MonthlyFact[] } {
    const mate = e.mates[0];
    const s = e.stats;
    return {
        interview: [
            ...(s.busiestDay && s.busiestDay.matches > 0 ? (["busiest"] as const) : []),
            ...(mate?.name && mate.matches >= 2 ? (["mate"] as const) : []),
            ...(s.playtimeS >= HOUR_S ? (["hours"] as const) : []),
        ],
        cover: [
            ...(s.wins > 0 && s.losses > 0 ? (["record"] as const) : []),
            ...(s.playtimeS >= HOUR_S ? (["hours"] as const) : []),
            ...(s.daysPlayed > 0 ? (["days"] as const) : []),
        ],
    };
}

/** Which beats play, which signals and stats each one spends, and in what order. */
export function monthlyCast(e: Edition, signals: readonly Signal[]): MonthlyCast {
    const told = signals.filter(tellable);
    const open = new Set<Placed>(["m_cover", "m_feature", "m_interview"]);
    if (hasTakes(e)) open.add("m_takes");
    if (e.bestGame) open.add("m_shot");
    if (e.heroes.some((h) => h.games > 0)) open.add("m_wardrobe");
    const extra = fillers(e);

    for (;;) {
        const homes = new Map<Placed, Signal[]>();
        told.forEach((s, i) => {
            const prefs = i === 0 && HOMES[s.id]!.includes("m_feature") ? ["m_feature" as const] : HOMES[s.id]!;
            const home = prefs.find((b) => open.has(b) && (homes.get(b)?.length ?? 0) < ROOM[b]);
            if (home) homes.set(home, [...(homes.get(home) ?? []), s]);
        });
        const spent = new Set<MonthlyFact>(["matches"]);
        // The takes' caption is its signal; without one it tells the busiest day.
        if (open.has("m_takes") && !homes.has("m_takes")) spent.add("busiest");
        if ([...homes.values()].flat().some((s) => s.id === "duo")) spent.add("mate");

        const asked = (homes.get("m_interview") ?? []).map(interviewTopic);
        const interviewFacts: MonthlyFact[] = [];
        for (const f of extra.interview) {
            if (asked.length + interviewFacts.length >= ROOM.m_interview) break;
            if (!spent.has(f)) interviewFacts.push(f);
        }
        if (open.has("m_interview") && asked.length + interviewFacts.length < MIN_TOPICS) {
            open.delete("m_interview");
            continue;
        }
        interviewFacts.forEach((f) => spent.add(f));
        const coverFacts = extra.cover
            .filter((f) => !spent.has(f))
            .slice(0, Math.max(0, ROOM.m_cover - (homes.get("m_cover")?.length ?? 0)));

        const cast = (id: MonthlyBeatId, facts: MonthlyFact[] = []): CastBeat => ({
            id,
            signals: id === "m_flash" || id === "m_stand" || id === "m_end" ? [] : (homes.get(id) ?? []),
            facts,
        });
        const beats = new Map<Placed, CastBeat>();
        if (open.has("m_takes")) beats.set("m_takes", cast("m_takes", homes.has("m_takes") ? ["calendar"] : ["calendar", "busiest"]));
        if (open.has("m_shot")) beats.set("m_shot", cast("m_shot", ["best_game"]));
        if (open.has("m_wardrobe")) beats.set("m_wardrobe", cast("m_wardrobe", ["heroes"]));
        if (open.has("m_interview")) {
            beats.set("m_interview", { ...cast("m_interview", interviewFacts), topics: [...asked, ...(interviewFacts as InterviewTopic[])] });
        }
        if (homes.has("m_feature")) beats.set("m_feature", cast("m_feature"));

        const lead = told[0] ?? null;
        const strength = (b: CastBeat | undefined) => b?.signals[0]?.strength ?? -1;
        const shotLeads = lead !== null && beats.get("m_shot")?.signals[0] === lead;
        const units: CastBeat[][] = [
            (shotLeads ? ["m_shot", "m_takes"] : ["m_takes", "m_shot"]).flatMap((id) => beats.get(id as Placed) ?? []),
            [beats.get("m_wardrobe")],
            [beats.get("m_interview")],
            [beats.get("m_feature")],
        ]
            .map((u) => u.filter((b): b is CastBeat => b !== undefined))
            .filter((u) => u.length > 0);
        const ranked = units
            .map((u, i) => ({ u, i, s: Math.max(...u.map(strength)) }))
            .sort((a, b) => b.s - a.s || a.i - b.i)
            .flatMap((x) => x.u);

        return {
            lead: lead && ranked.some((b) => b.signals[0] === lead) ? lead : null,
            beats: [cast("m_flash", ["matches"]), ...ranked, cast("m_cover", coverFacts), cast("m_stand"), cast("m_end")],
        };
    }
}

const BASE: Record<MonthlyBeatId, number> = {
    m_flash: 2,
    m_takes: 2,
    m_shot: 3,
    m_wardrobe: 3,
    m_interview: 3,
    m_feature: 3,
    m_cover: 4,
    m_stand: 2,
    m_end: 2,
};
/** Spare bars go to the lead and the cover first, then the beats with the most to read. */
const GROW: readonly MonthlyBeatId[] = [
    "m_cover",
    "m_feature",
    "m_interview",
    "m_shot",
    "m_wardrobe",
    "m_takes",
    "m_stand",
    "m_flash",
    "m_end",
];
const FIRST_CAP = 4;

/** How each beat shows what it spends: `<stat>:<presentation>`, unique to the Monthly. */
const PRESENTS: Record<MonthlyBeatId, string> = {
    m_flash: "slate",
    m_takes: "contact_sheet",
    m_shot: "the_shot",
    m_wardrobe: "swatch_rail",
    m_interview: "interview",
    m_feature: "feature_spread",
    m_cover: "coverline",
    m_stand: "newsstand",
    m_end: "end_card",
};

/** Lays the cast on the bar grid: every bar used, the lead beat at least as long as any other middle beat. */
export function monthlyPlan(cast: MonthlyCast, bars: number): Beat<MonthlyBeatId>[] {
    const leadId = cast.lead ? cast.beats.find((b) => b.signals[0] === cast.lead)?.id : undefined;
    const share = new Map(cast.beats.map((b) => [b.id, BASE[b.id]]));
    let spare = bars - [...share.values()].reduce((a, b) => a + b, 0);
    const order = [...(leadId ? [leadId] : []), ...GROW.filter((id) => id !== leadId && share.has(id))];
    for (let cap = FIRST_CAP; spare > 0; cap++) {
        for (let given = true; spare > 0 && given; ) {
            given = false;
            for (const id of order) {
                if (spare === 0) break;
                const n = share.get(id)!;
                const limit = id === leadId || id === "m_cover" ? cap + 1 : cap;
                if (n >= limit) continue;
                share.set(id, n + 1);
                spare--;
                given = true;
            }
        }
    }

    let bar = 0;
    return cast.beats.map((b) => {
        const beat: Beat<MonthlyBeatId> = {
            id: b.id,
            kind: "monthly",
            bar,
            bars: share.get(b.id)!,
            presents: [
                ...b.signals.map((s) => `${s.id}:${PRESENTS[b.id]}`),
                ...b.facts.map((f) => `${f}:${PRESENTS[b.id]}`),
            ],
            ...(b.signals[0] ? { signal: b.signals[0].id } : {}),
        };
        bar += beat.bars;
        return beat;
    });
}
