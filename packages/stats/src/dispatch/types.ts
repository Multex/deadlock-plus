import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import type { Match, Outcome } from "../stats";

/** `collectors` = Collector's Copy at a ranked season's end; `year_end` = Year-End Special, Jan 1 to Dec 1. */
export type EditionKind = "weekly" | "monthly" | "collectors" | "year_end";

export const MIN_EDITION_MATCHES = 3;
export const EDITION_SCHEMA = 1;
export const BEST_GAME_CANDIDATES = 3;
export const EDITION_RIVALS = 3;

/**
 * A local calendar window: start inclusive, end exclusive, unix seconds, computed in `tz` (IANA).
 * Weekly runs Monday 00:00 to the next Monday 00:00; monthly runs from the 1st to the next 1st; year-end runs
 * Jan 1 00:00 to Dec 1 00:00; collectors runs the ranked season's own UTC start to end.
 * `id` is `weekly-<YYYY-MM-DD of the Monday>`, `monthly-<YYYY-MM>`, `year_end-<YYYY>` or `collectors-<season id>`.
 */
export interface EditionWindow {
    kind: EditionKind;
    id: string;
    startS: number;
    endS: number;
    tz: string;
}

/** A mate or an enemy from `mate-stats` / `enemy-stats`; `wins` are the viewer's wins in those matches. */
export interface Companion {
    accountId: number;
    name: string | null;
    matches: number;
    wins: number;
}

/** One hero's row from `/v1/players/hero-stats`; covers only matches the API holds metadata for. */
export interface HeroCombat {
    heroId: number;
    matches: number;
    damage: number | null;
    objDamagePerMin: number | null;
    accuracy: number | null;
    critRate: number | null;
    mvpRankCounts: number[];
    mvpRated: number;
}

export interface GradedCandidate {
    matchId: number;
    letter: MvpLetter | null;
    s10: number | null;
    place: number | null;
}

/** `null` = the call failed or was skipped, so that section is left out; `[]` = answered, nothing found. */
export interface Enrichment {
    mates: Companion[] | null;
    enemies: Companion[] | null;
    heroCombat: HeroCombat[] | null;
    grades: GradedCandidate[] | null;
}

export interface DispatchText {
    key: string;
    /** Set when `key` is the base of an `_one`/`_other` pair. */
    count?: number;
}

export type DispatchParam =
    | { type: "hero"; heroId: number }
    | { type: "player"; accountId: number; name: string | null }
    | { type: "number"; value: number }
    | { type: "duration"; seconds: number }
    | { type: "percent"; value: number }
    | { type: "date"; unixS: number }
    /** A local month, by its first second. */
    | { type: "month"; unixS: number }
    | { type: "grade"; letter: MvpLetter }
    | { type: "rank"; badge: number };

export type DispatchStoryKind =
    | "record"
    | "hours"
    | "top_hero"
    | "new_hero"
    | "best_game"
    | "best_streak"
    | "longest_session"
    | "busiest_day"
    | "longest_match"
    | "rank_move"
    | "played_with"
    | "nemesis"
    | "damage"
    | "mvp_count"
    | "night_owl"
    | "peak_rank"
    | "season_climb"
    | "days_played"
    | "heroes_tried"
    | "busiest_month";

export interface DispatchStory {
    kind: DispatchStoryKind;
    score: number;
    headline: DispatchText;
    deck: DispatchText;
    params: Record<string, DispatchParam>;
    matchId?: number;
}

export interface BestGame {
    matchId: number;
    heroId: number;
    kills: number;
    deaths: number;
    assists: number;
    netWorth: number;
    startTime: number;
    letter: MvpLetter | null;
    place: number | null;
}

export interface EditionStats {
    matches: number;
    wins: number;
    losses: number;
    unscored: number;
    winrate: number | null;
    playtimeS: number;
    kills: number;
    deaths: number;
    assists: number;
    netWorth: number;
    longestMatchS: number;
    longestSession: { matches: number; startS: number; durationS: number } | null;
    busiestDay: { dayStartS: number; matches: number } | null;
    /** Share of matches started 00:00-05:59 local. */
    nightShare: number | null;
    /** Distinct local days with at least one match. */
    daysPlayed: number;
    /** Local month with the most matches; ties go to the earlier month. */
    busiestMonth: { monthStartS: number; matches: number } | null;
}

export interface EditionHero {
    heroId: number;
    games: number;
    wins: number;
    playtimeS: number;
}

export interface EditionRank {
    startBadge: number;
    endBadge: number;
    peakBadge: number;
    delta: number;
}

export interface RankedSeason {
    /** The API's `class_name`, e.g. `season_1`. */
    id: string;
    name: string;
    startS: number;
    endS: number;
}

export interface Edition {
    schema: typeof EDITION_SCHEMA;
    id: string;
    window: EditionWindow;
    accountId: number;
    /** Issue number, assigned at freeze; `null` while live ("This week so far"). */
    number: number | null;
    /** The year of `window.startS` in `window.tz`; for a Year-End Special, the year it ends in. */
    volume: number;
    issuedAt: number | null;
    stats: EditionStats;
    heroes: EditionHero[];
    newHeroes: number[];
    bestGame: BestGame | null;
    longestWin: number;
    rank: EditionRank | null;
    /** Set on a Collector's Copy only. */
    season: RankedSeason | null;
    mates: Companion[];
    nemesis: Companion | null;
    combat: HeroCombat[] | null;
    /** Ranked, `[0]` is the banner. A stat with no data has no story, never a 0. */
    stories: DispatchStory[];
    /**
     * Frozen at issue so a keepsake never changes when the history does. Optional: editions issued before these
     * fields existed lack them, and the view leaves those sections out.
     */
    playerName?: string | null;
    /** Local days of the window, oldest first, including days without a match (monthly calendar). */
    days?: EditionDay[];
    /** Local months of the window, oldest first, including empty ones (Year-End timeline). */
    months?: EditionMonth[];
    /** One point per ranked match with a badge, oldest first (Collector's Copy climb chart). */
    rankSeries?: RankPoint[];
    /** Every match of the window, oldest first; a Collector's Copy holds only its ranked matches. */
    tape?: TapeMatch[];
    /** The graded best-game candidates, best first; `[0]` is `bestGame`. Empty when nothing was gradable. */
    nominees?: BestGame[];
    /** Up to `EDITION_RIVALS` enemies by losses, most first; `[0]` is `nemesis`. */
    rivals?: Companion[];
    /**
     * Enrichment fields the API turned away (rate limit or outage) at issue; their sections stay hidden and the
     * edition is enriched again when opened. Absent once nothing is missing.
     */
    pending?: PendingField[];
}

/** The `Enrichment` fields an edition can wait on. */
export type PendingField = "mates" | "enemies" | "heroCombat";

/** A tuple, not an object, so a 500-match year stays near 30 kB in kv. */
export type TapeMatch = [
    startS: number,
    heroId: number,
    outcome: Outcome,
    kills: number,
    deaths: number,
    assists: number,
    netWorth: number,
    durationS: number,
    /** The player's `ranked_display_badge` after the match; only on matches the rank track counts. */
    badge?: number,
];

export interface EditionDay {
    dayStartS: number;
    matches: number;
    wins: number;
}

export interface EditionMonth {
    monthStartS: number;
    matches: number;
    wins: number;
}

export interface RankPoint {
    startS: number;
    badge: number;
    outcome: "win" | "loss" | "unscored";
}

export interface IssuedEntry {
    id: string;
    kind: EditionKind;
    number: number;
    issuedAt: number;
    startS: number;
    endS: number;
    matches: number;
    /** true when the user printed a past edition from the shelf; false for an automatic issue. */
    onRequest: boolean;
}

/** kv `stats-cache` key `dispatch:<accountId>:index`; each edition at `dispatch:<accountId>:<editionId>`. */
export interface DispatchIndex {
    schema: 1;
    issued: IssuedEntry[];
    /** Closed windows that had fewer than `MIN_EDITION_MATCHES` matches. */
    skipped: string[];
    /** Ids of issued editions the user has opened; automatic issues not in here drive the nav badge. */
    seen: string[];
}

export interface BuildInput {
    window: EditionWindow;
    accountId: number;
    /** All matches; the builder filters to the window itself. */
    history: readonly Match[];
    enrichment: Enrichment;
    /** Required for `collectors` windows. */
    season?: RankedSeason;
    /** The viewer's Steam name at issue time. */
    playerName?: string | null;
    number: number | null;
    issuedAt: number | null;
}
