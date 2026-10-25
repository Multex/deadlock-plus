import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import { badgeParts } from "../rank";
import type { DispatchParam, DispatchStory, DispatchStoryKind, DispatchText, Edition } from "./types";

export type DispatchEditionInput = Omit<Edition, "stories">;

/**
 * Base score per kind, highest first. The order also breaks equal scores. Each detector adds a bonus
 * for a bigger number, capped at `BONUS_MAX`. The weights and thresholds are editorial, not game facts.
 */
const BASE_SCORE = {
    best_game: 50,
    rank_move: 48,
    hours: 44,
    record: 42,
    best_streak: 40,
    top_hero: 38,
    played_with: 36,
    nemesis: 34,
    new_hero: 32,
    mvp_count: 30,
    damage: 28,
    longest_session: 26,
    busiest_day: 24,
    longest_match: 22,
    night_owl: 20,
} as const satisfies Record<DispatchStoryKind, number>;

const KIND_ORDER = Object.keys(BASE_SCORE) as DispatchStoryKind[];

export const BONUS_MAX = 15;

const HOUR_S = 3600;
const DAY_S = 86400;
export const HOURS_MIN_S = HOUR_S;
export const TOP_HERO_MIN_SHARE = 0.4;
export const STREAK_MIN = 3;
export const SESSION_MIN_MATCHES = 3;
export const BUSIEST_DAY_MIN_MATCHES = 4;
export const LONG_MATCH_MIN_S = 45 * 60;
export const PLAYED_WITH_MIN_MATCHES = 3;
export const NEMESIS_MIN_LOSSES = 2;
export const NIGHT_OWL_MIN_SHARE = 0.3;

const GRADE_ORDER: readonly MvpLetter[] = [
    "S+",
    "S",
    "S-",
    "A+",
    "A",
    "A-",
    "B+",
    "B",
    "B-",
    "C+",
    "C",
    "C-",
    "D+",
    "D",
    "D-",
    "E+",
    "E",
    "E-",
    "F",
];

const STORY_NS = "dispatch.story";

const number = (value: number): DispatchParam => ({ type: "number", value });
const percent = (value: number): DispatchParam => ({ type: "percent", value });
const duration = (seconds: number): DispatchParam => ({ type: "duration", seconds });
const date = (unixS: number): DispatchParam => ({ type: "date", unixS });
const hero = (heroId: number): DispatchParam => ({ type: "hero", heroId });
const rank = (badge: number): DispatchParam => ({ type: "rank", badge });

interface Draft {
    kind: DispatchStoryKind;
    extra?: number;
    headline?: string;
    headlineCount?: number;
    deck?: string;
    deckCount?: number;
    params: Record<string, DispatchParam>;
    matchId?: number;
}

type Detector = (e: DispatchEditionInput) => Draft[];

const record: Detector = ({ stats: { wins, losses, matches } }) => {
    const scored = wins + losses;
    if (scored === 0) return [];
    const outcome = wins > losses ? "winning" : wins < losses ? "losing" : "even";
    return [
        {
            kind: "record",
            extra: wins - losses,
            headline: `headline_${outcome}`,
            deckCount: matches,
            params: { wins: number(wins), losses: number(losses), winrate: percent(wins / scored) },
        },
    ];
};

const hours: Detector = ({ stats: { playtimeS } }) => {
    if (playtimeS < HOURS_MIN_S) return [];
    const whole = Math.floor(playtimeS / HOUR_S);
    const params: Record<string, DispatchParam> = { hours: number(whole), playtime: duration(playtimeS) };
    const draft: Draft = { kind: "hours", extra: Math.floor(whole / 2), headlineCount: whole, params };
    if (playtimeS >= DAY_S) {
        const days = Math.floor(playtimeS / (DAY_S / 10)) / 10;
        params.days = number(days);
        draft.deck = "deck_days";
        draft.deckCount = days;
    }
    return [draft];
};

const topHero: Detector = ({ heroes, stats }) => {
    if (stats.matches === 0) return [];
    const top = [...heroes].sort((a, b) => b.games - a.games || b.playtimeS - a.playtimeS || a.heroId - b.heroId)[0];
    if (!top) return [];
    const share = top.games / stats.matches;
    if (share < TOP_HERO_MIN_SHARE) return [];
    return [
        {
            kind: "top_hero",
            extra: Math.round((share - TOP_HERO_MIN_SHARE) * 25),
            deckCount: top.games,
            params: { hero: hero(top.heroId), share: percent(share), wins: number(top.wins) },
        },
    ];
};

const newHero: Detector = ({ newHeroes }) => {
    if (newHeroes.length === 0) return [];
    return [
        {
            kind: "new_hero",
            extra: (newHeroes.length - 1) * 3,
            deckCount: newHeroes.length,
            params: { hero: hero(newHeroes[0]) },
        },
    ];
};

const bestGame: Detector = ({ bestGame: g }) => {
    if (!g) return [];
    const params: Record<string, DispatchParam> = {
        hero: hero(g.heroId),
        kills: number(g.kills),
        deaths: number(g.deaths),
        assists: number(g.assists),
        net_worth: number(g.netWorth),
        date: date(g.startTime),
    };
    if (!g.letter) return [{ kind: "best_game", matchId: g.matchId, params }];
    return [
        {
            kind: "best_game",
            matchId: g.matchId,
            extra: BONUS_MAX - GRADE_ORDER.indexOf(g.letter),
            deck: "deck_graded",
            params: { ...params, letter: { type: "grade", letter: g.letter } },
        },
    ];
};

const bestStreak: Detector = ({ longestWin }) => {
    if (longestWin < STREAK_MIN) return [];
    return [
        {
            kind: "best_streak",
            extra: (longestWin - STREAK_MIN) * 3,
            headlineCount: longestWin,
            params: { wins: number(longestWin) },
        },
    ];
};

const longestSession: Detector = ({ stats: { longestSession: s } }) => {
    if (!s || s.matches < SESSION_MIN_MATCHES) return [];
    return [
        {
            kind: "longest_session",
            extra: s.matches - SESSION_MIN_MATCHES,
            headlineCount: s.matches,
            params: { duration: duration(s.durationS), date: date(s.startS) },
        },
    ];
};

const busiestDay: Detector = ({ stats: { busiestDay: d } }) => {
    if (!d || d.matches < BUSIEST_DAY_MIN_MATCHES) return [];
    return [
        {
            kind: "busiest_day",
            extra: d.matches - BUSIEST_DAY_MIN_MATCHES,
            headlineCount: d.matches,
            params: { date: date(d.dayStartS) },
        },
    ];
};

const longestMatch: Detector = ({ stats: { longestMatchS } }) => {
    if (longestMatchS < LONG_MATCH_MIN_S) return [];
    return [
        {
            kind: "longest_match",
            extra: Math.floor((longestMatchS - LONG_MATCH_MIN_S) / 120),
            params: { duration: duration(longestMatchS) },
        },
    ];
};

/** Subranks from the bottom, so a move across a tier boundary counts its real steps. */
function step(badge: number): number {
    const parts = badgeParts(badge);
    return parts ? parts.tier * 6 + parts.sub : 0;
}

const rankMove: Detector = ({ rank: r }) => {
    if (!r || r.delta === 0) return [];
    const variant = `${r.startBadge === r.endBadge ? "held_" : ""}${r.delta > 0 ? "up" : "down"}`;
    return [
        {
            kind: "rank_move",
            extra: 2 * Math.abs(step(r.endBadge) - step(r.startBadge)),
            headline: `headline_${variant}`,
            deck: `deck_${variant}`,
            params: { from: rank(r.startBadge), to: rank(r.endBadge), peak: rank(r.peakBadge) },
        },
    ];
};

const playedWith: Detector = ({ mates }) => {
    const top = [...mates].sort((a, b) => b.matches - a.matches || b.wins - a.wins || a.accountId - b.accountId)[0];
    if (!top || top.matches < PLAYED_WITH_MIN_MATCHES) return [];
    return [
        {
            kind: "played_with",
            extra: top.matches - PLAYED_WITH_MIN_MATCHES,
            deckCount: top.matches,
            params: { player: { type: "player", accountId: top.accountId, name: top.name }, wins: number(top.wins) },
        },
    ];
};

const nemesis: Detector = ({ nemesis: n }) => {
    if (!n) return [];
    const losses = n.matches - n.wins;
    if (losses < NEMESIS_MIN_LOSSES) return [];
    return [
        {
            kind: "nemesis",
            extra: (losses - NEMESIS_MIN_LOSSES) * 2,
            deckCount: losses,
            params: { player: { type: "player", accountId: n.accountId, name: n.name }, matches: number(n.matches) },
        },
    ];
};

const damage: Detector = ({ combat }) => {
    if (!combat) return [];
    let total = 0;
    let matches = 0;
    for (const row of combat) {
        if (row.damage === null) continue;
        total += row.damage;
        matches += row.matches;
    }
    if (total <= 0) return [];
    return [
        {
            kind: "damage",
            extra: Math.floor(total / 50000),
            deckCount: matches,
            params: { damage: number(total) },
        },
    ];
};

const mvpCount: Detector = ({ combat }) => {
    if (!combat) return [];
    const count = combat.reduce((sum, row) => sum + row.mvpRankCounts.reduce((a, b) => a + b, 0), 0);
    if (count <= 0) return [];
    const rated = combat.reduce((sum, row) => sum + row.mvpRated, 0);
    return [{ kind: "mvp_count", extra: count, headlineCount: count, params: { rated: number(rated) } }];
};

const nightOwl: Detector = ({ stats: { nightShare, matches } }) => {
    if (nightShare === null || nightShare < NIGHT_OWL_MIN_SHARE) return [];
    return [
        {
            kind: "night_owl",
            extra: Math.round((nightShare - NIGHT_OWL_MIN_SHARE) * 20),
            deckCount: Math.round(nightShare * matches),
            params: { share: percent(nightShare) },
        },
    ];
};

const DETECTORS: Detector[] = [
    bestGame,
    rankMove,
    hours,
    record,
    bestStreak,
    topHero,
    playedWith,
    nemesis,
    newHero,
    mvpCount,
    damage,
    longestSession,
    busiestDay,
    longestMatch,
    nightOwl,
];

function text(kind: DispatchStoryKind, part: string, count: number | undefined): DispatchText {
    const t: DispatchText = { key: `${STORY_NS}.${kind}.${part}` };
    if (count !== undefined) t.count = count;
    return t;
}

function finish(d: Draft): DispatchStory {
    const story: DispatchStory = {
        kind: d.kind,
        score: BASE_SCORE[d.kind] + Math.max(0, Math.min(BONUS_MAX, d.extra ?? 0)),
        headline: text(d.kind, d.headline ?? "headline", d.headlineCount),
        deck: text(d.kind, d.deck ?? "deck", d.deckCount),
        params: d.params,
    };
    if (d.matchId !== undefined) story.matchId = d.matchId;
    return story;
}

/** Highest score first; equal scores follow the kind order of `BASE_SCORE`. */
export function rankDispatchStories(stories: readonly DispatchStory[]): DispatchStory[] {
    return [...stories].sort((a, b) => b.score - a.score || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/** Every story the edition supports, ranked; `[0]` is the banner. */
export function detectDispatchStories(edition: DispatchEditionInput): DispatchStory[] {
    return rankDispatchStories(DETECTORS.flatMap((detect) => detect(edition)).map(finish));
}
