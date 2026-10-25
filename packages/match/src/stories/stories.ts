import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";
import { teamLeadLine } from "../deep-dive/chart";
import { objectiveNames, type ObjectiveKind } from "../deep-dive/names";
import { allPlayers, findPlayer, playerBySlot, type MatchDetail, type MatchPlayer, type MatchTeam } from "../detail";
import { buildTimeline } from "../timeline";

/** What a story needs from a Deadlock+ grade; `MvpPlayerGrade` fits as is. */
export type GradeInput = Pick<MvpPlayerGrade, "playerSlot" | "letter" | "place" | "s10">;

/**
 * Base score per kind, highest first. The order also breaks equal scores. A story about the viewer gets
 * `VIEWER_BONUS`, a team story for the viewer's team `TEAM_BONUS`, and a comeback one point per 1,000
 * net worth of deficit up to `COMEBACK_BONUS_MAX`. The weights are editorial, not game facts.
 */
const BASE_SCORE = {
    comeback: 60,
    critics_top: 50,
    viewer_line: 45,
    mid_boss: 36,
    first_blood: 34,
    top_damage: 33,
    patron_fall: 32,
    walker_fall: 30,
    top_healing: 28,
    base_guardian_fall: 27,
    richest: 26,
    shrine_fall: 24,
    most_last_hits: 22,
    guardian_fall: 20,
} as const;

export type StoryKind = keyof typeof BASE_SCORE;

const KIND_ORDER = Object.keys(BASE_SCORE) as StoryKind[];

export const VIEWER_BONUS = 15;
export const TEAM_BONUS = 5;
export const COMEBACK_BONUS_MAX = 25;
/** Smallest net worth deficit the winner must have overcome. */
export const COMEBACK_MIN_DEFICIT = 5000;

/** A value for one placeholder; the view turns it into text (names, clock, ordinals). */
export type StoryParam =
    | { type: "hero"; slot: number }
    /** The player's name, or the hero's when the name is unknown. */
    | { type: "player"; slot: number }
    | { type: "team"; team: MatchTeam }
    | { type: "time"; seconds: number }
    | { type: "number"; value: number }
    | { type: "grade"; letter: MvpLetter }
    | { type: "place"; value: number };

export interface StoryText {
    key: string;
    /** Set when `key` is the base of an `_one`/`_other` pair: translate with `tn(key, count, params)`. */
    count?: number;
}

export interface Story {
    kind: StoryKind;
    score: number;
    /** Slot of the player the story is about. */
    subject?: number;
    headline: StoryText;
    deck: StoryText;
    /** Keyed by placeholder name. */
    params: Record<string, StoryParam>;
}

export interface StoryInput {
    detail: MatchDetail;
    viewerAccountId?: number | null;
    grades?: readonly GradeInput[] | null;
}

const STORY_NS = "front_page.story";

const key = (kind: StoryKind, part: string) => `${STORY_NS}.${kind}.${part}`;

const hero = (slot: number): StoryParam => ({ type: "hero", slot });
const player = (slot: number): StoryParam => ({ type: "player", slot });
const team = (t: MatchTeam): StoryParam => ({ type: "team", team: t });
const time = (seconds: number): StoryParam => ({ type: "time", seconds });
const number = (value: number): StoryParam => ({ type: "number", value });

const otherTeam = (t: MatchTeam): MatchTeam => (t === "hidden-king" ? "archmother" : "hidden-king");

interface Context {
    detail: MatchDetail;
    players: MatchPlayer[];
    viewer?: MatchPlayer;
    grades: GradeInput[];
}

interface Draft {
    kind: StoryKind;
    subject?: number;
    /** The team a team story is about, for the viewer's team bonus. */
    team?: MatchTeam;
    extra?: number;
    deck?: string;
    count?: number;
    params: Record<string, StoryParam>;
}

/** Highest value wins, then the lower slot. Absent when nobody has more than zero. */
function leader(players: readonly MatchPlayer[], value: (p: MatchPlayer) => number): MatchPlayer | undefined {
    let best: MatchPlayer | undefined;
    for (const p of players) {
        const v = value(p);
        if (v <= 0) continue;
        if (!best || v > value(best) || (v === value(best) && p.slot < best.slot)) best = p;
    }
    return best;
}

function viewerLine({ viewer, grades }: Context): Draft[] {
    if (!viewer) return [];
    const params: Record<string, StoryParam> = {
        hero: hero(viewer.slot),
        player: player(viewer.slot),
        kills: number(viewer.kills),
        deaths: number(viewer.deaths),
        assists: number(viewer.assists),
        net_worth: number(viewer.souls),
    };
    const grade = grades.find((g) => g.playerSlot === viewer.slot);
    if (!grade) return [{ kind: "viewer_line", subject: viewer.slot, params }];
    return [
        {
            kind: "viewer_line",
            subject: viewer.slot,
            deck: "deck_graded",
            params: {
                ...params,
                letter: { type: "grade", letter: grade.letter },
                place: { type: "place", value: grade.place },
                total: number(grades.length),
            },
        },
    ];
}

function topDamage({ players }: Context): Draft[] {
    const top = leader(
        players.filter((p) => p.series.length > 0),
        (p) => p.playerDamage,
    );
    if (!top) return [];
    return [
        {
            kind: "top_damage",
            subject: top.slot,
            params: { hero: hero(top.slot), player: player(top.slot), damage: number(top.playerDamage) },
        },
    ];
}

function topHealing({ players }: Context): Draft[] {
    const top = leader(
        players.filter((p) => p.series.length > 0),
        (p) => p.healing,
    );
    if (!top) return [];
    return [
        {
            kind: "top_healing",
            subject: top.slot,
            params: { hero: hero(top.slot), player: player(top.slot), healing: number(top.healing) },
        },
    ];
}

const MAX_PLAYER_SLOT = 12;

function firstBlood({ players, detail }: Context): Draft[] {
    const first = players
        .flatMap((victim) =>
            victim.deathLog
                .filter((d) => d.killerSlot >= 1 && d.killerSlot <= MAX_PLAYER_SLOT && d.killerSlot !== victim.slot)
                .map((d) => ({ victim, death: d })),
        )
        .sort((a, b) => a.death.timeS - b.death.timeS || a.victim.slot - b.victim.slot)[0];
    if (!first) return [];
    const killer = playerBySlot(detail, first.death.killerSlot);
    if (!killer) return [];
    return [
        {
            kind: "first_blood",
            subject: killer.slot,
            params: {
                hero: hero(killer.slot),
                player: player(killer.slot),
                victim_hero: hero(first.victim.slot),
                victim: player(first.victim.slot),
                time: time(first.death.timeS),
            },
        },
    ];
}

function comeback({ detail }: Context): Draft[] {
    const winner = detail.winningTeam;
    if (!winner) return [];
    // The lead line is The Hidden King minus The Archmother.
    const sign = winner === "hidden-king" ? -1 : 1;
    let worst: { t: number; deficit: number } | undefined;
    for (const p of teamLeadLine(detail, "souls")) {
        const deficit = sign * p.v;
        if (!worst || deficit > worst.deficit) worst = { t: p.t, deficit };
    }
    if (!worst || worst.deficit < COMEBACK_MIN_DEFICIT) return [];
    const deficit = Math.round(worst.deficit);
    return [
        {
            kind: "comeback",
            team: winner,
            extra: Math.min(COMEBACK_BONUS_MAX, Math.floor(deficit / 1000)),
            params: { team: team(winner), deficit: number(deficit), time: time(worst.t) },
        },
    ];
}

function midBoss({ detail }: Context): Draft[] {
    const first = detail.midBoss
        .filter((m) => m.claimedBy !== undefined)
        .sort((a, b) => a.destroyedS - b.destroyedS)[0];
    if (!first?.claimedBy) return [];
    const params: Record<string, StoryParam> = { team: team(first.claimedBy), time: time(first.destroyedS) };
    if (first.killedBy && first.killedBy !== first.claimedBy) {
        return [
            {
                kind: "mid_boss",
                team: first.claimedBy,
                deck: "deck_split",
                params: { ...params, killer: team(first.killedBy) },
            },
        ];
    }
    return [{ kind: "mid_boss", team: first.claimedBy, params }];
}

const FALL_KINDS: Partial<Record<ObjectiveKind, StoryKind>> = {
    guardian: "guardian_fall",
    walker: "walker_fall",
    base_guardian: "base_guardian_fall",
    shrine: "shrine_fall",
    patron: "patron_fall",
};

function objectiveFalls({ detail }: Context): Draft[] {
    const names = objectiveNames(detail.objectives);
    const kindOf = new Map(detail.objectives.map((o, i) => [`${o.team}:${o.objectiveId}`, names[i].kind]));
    const seen = new Set<StoryKind>();
    const out: Draft[] = [];
    for (const e of buildTimeline(detail)) {
        if (e.kind !== "objective") continue;
        const objective = kindOf.get(`${e.team}:${e.objectiveId}`);
        const kind = objective === undefined ? undefined : FALL_KINDS[objective];
        if (!kind || seen.has(kind)) continue;
        seen.add(kind);
        const by = otherTeam(e.team);
        out.push({ kind, team: by, params: { team: team(by), owner: team(e.team), time: time(e.timeS) } });
    }
    return out;
}

function criticsTop({ grades }: Context): Draft[] {
    const best = [...grades].sort((a, b) => a.place - b.place || b.s10 - a.s10 || a.playerSlot - b.playerSlot)[0];
    if (!best || best.place !== 1) return [];
    return [
        {
            kind: "critics_top",
            subject: best.playerSlot,
            params: {
                hero: hero(best.playerSlot),
                player: player(best.playerSlot),
                letter: { type: "grade", letter: best.letter },
                total: number(grades.length),
            },
        },
    ];
}

function richest({ players }: Context): Draft[] {
    const top = leader(players, (p) => p.souls);
    if (!top) return [];
    return [
        {
            kind: "richest",
            subject: top.slot,
            params: { hero: hero(top.slot), player: player(top.slot), net_worth: number(top.souls) },
        },
    ];
}

function mostLastHits({ players }: Context): Draft[] {
    const top = leader(players, (p) => p.lastHits);
    if (!top) return [];
    return [
        {
            kind: "most_last_hits",
            subject: top.slot,
            count: top.lastHits,
            params: { hero: hero(top.slot), player: player(top.slot), last_hits: number(top.lastHits) },
        },
    ];
}

const DETECTORS: ((ctx: Context) => Draft[])[] = [
    viewerLine,
    comeback,
    criticsTop,
    firstBlood,
    midBoss,
    objectiveFalls,
    topDamage,
    topHealing,
    richest,
    mostLastHits,
];

/** Plural headlines carry `count`; decks never do. */
function finish(draft: Draft, viewer: MatchPlayer | undefined): Story {
    let score = BASE_SCORE[draft.kind] + (draft.extra ?? 0);
    if (viewer && draft.kind !== "viewer_line" && draft.subject === viewer.slot) score += VIEWER_BONUS;
    if (viewer && draft.team === viewer.team) score += TEAM_BONUS;
    const headline: StoryText = { key: key(draft.kind, "headline") };
    if (draft.count !== undefined) headline.count = draft.count;
    const story: Story = {
        kind: draft.kind,
        score,
        headline,
        deck: { key: key(draft.kind, draft.deck ?? "deck") },
        params: draft.params,
    };
    if (draft.subject !== undefined) story.subject = draft.subject;
    return story;
}

/** Highest score first; equal scores follow the kind order of `BASE_SCORE`, then the lower subject slot. */
export function rankStories(stories: readonly Story[]): Story[] {
    return [...stories].sort(
        (a, b) =>
            b.score - a.score ||
            KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
            (a.subject ?? 0) - (b.subject ?? 0),
    );
}

export function detectStories(input: StoryInput): Story[] {
    const { detail } = input;
    const viewer =
        input.viewerAccountId === null || input.viewerAccountId === undefined
            ? undefined
            : findPlayer(detail, [input.viewerAccountId]);
    const players = allPlayers(detail);
    const grades = (input.grades ?? []).filter((g) => players.some((p) => p.slot === g.playerSlot));
    const ctx: Context = { detail, players, viewer, grades };
    return rankStories(DETECTORS.flatMap((detect) => detect(ctx)).map((d) => finish(d, viewer)));
}
