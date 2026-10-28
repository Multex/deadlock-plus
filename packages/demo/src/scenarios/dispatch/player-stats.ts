import { seeded } from "../../random";
import type { Identity } from "../../scenario";
import { fakeAccountId } from "../default/identity";
import type { HistoryRow } from "../default/progress";
import { FIRST_MONDAY_S, won } from "./history";

const WEEK_S = 7 * 86_400;
/** Valve's MVP rating exists only for matches from this day on (verified against the live API). */
const MVP_FROM_S = Date.UTC(2026, 0, 6) / 1000;
const MVP_PLACES = 3;
const MATCH_SIZE = 12;

/** Inclusive on both ends, the way the API reads `min_unix_timestamp` and `max_unix_timestamp`. */
export interface StatsWindow {
    minS: number;
    maxS: number;
}

export function windowOf(url: URL): StatsWindow {
    const read = (name: string, fallback: number) => {
        const raw = url.searchParams.get(name);
        return raw === null || raw === "" || !Number.isFinite(Number(raw)) ? fallback : Number(raw);
    };
    return { minS: read("min_unix_timestamp", -Infinity), maxS: read("max_unix_timestamp", Infinity) };
}

export const inWindow = (rows: readonly HistoryRow[], { minS, maxS }: StatsWindow) =>
    rows.filter((row) => row.start_time >= minS && row.start_time <= maxS);

/** A number in [0, 1) that depends only on the match and the salt. */
const unit = (matchId: number, salt: number) =>
    seeded((Math.imul(matchId, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0)();

const SALT = { damage: 1, objective: 2, accuracy: 3, crit: 4, mvp: 5, build: 6 };

/** Damage dealt per minute in a match; the grade of the same match reads this too. */
const damagePerMinute = (row: HistoryRow) => (520 + 520 * unit(row.match_id, SALT.damage)) * (won(row) ? 1.08 : 0.95);

export const damageOf = (row: HistoryRow): number => Math.round((damagePerMinute(row) * row.match_duration_s) / 60);

/** Where Valve's MVP rating put the player among the twelve, 1 to 12. */
function mvpPlace(row: HistoryRow): number {
    const strength = won(row) ? 1.6 : 0.8;
    return 1 + Math.floor(MATCH_SIZE * unit(row.match_id, SALT.mvp) ** strength);
}

const sum = (rows: readonly HistoryRow[], by: (row: HistoryRow) => number) => rows.reduce((t, r) => t + by(r), 0);
const average = (rows: readonly HistoryRow[], by: (row: HistoryRow) => number) => sum(rows, by) / rows.length;

/** The body of `GET /v1/players/hero-stats` for one account: one row per hero played in the window. */
export function heroStatsRows(rows: readonly HistoryRow[], accountId: number, window: StatsWindow) {
    const byHero = new Map<number, HistoryRow[]>();
    for (const row of inWindow(rows, window)) byHero.set(row.hero_id, [...(byHero.get(row.hero_id) ?? []), row]);
    return [...byHero.entries()]
        .map(([heroId, played]) => {
            const minutes = sum(played, (r) => r.match_duration_s) / 60;
            const weighted = (by: (row: HistoryRow) => number) =>
                sum(played, (r) => by(r) * r.match_duration_s) / 60 / minutes;
            const rated = played.filter((r) => r.start_time >= MVP_FROM_S);
            const placed = (place: number) => rated.filter((r) => mvpPlace(r) === place).length;
            return {
                account_id: accountId,
                hero_id: heroId,
                matches_played: played.length,
                last_played: Math.max(...played.map((r) => r.start_time)),
                time_played: sum(played, (r) => r.match_duration_s),
                wins: played.filter(won).length,
                ending_level: Math.round(average(played, (r) => r.hero_level) * 10) / 10,
                kills: sum(played, (r) => r.player_kills),
                deaths: sum(played, (r) => r.player_deaths),
                assists: sum(played, (r) => r.player_assists),
                total_player_damage: sum(played, damageOf),
                obj_damage_per_min: weighted((r) => 60 + 140 * unit(r.match_id, SALT.objective)),
                accuracy: weighted((r) => 0.38 + 0.25 * unit(r.match_id, SALT.accuracy)),
                crit_shot_rate: weighted((r) => 0.08 + 0.18 * unit(r.match_id, SALT.crit)),
                mvp_rank_counts: Array.from({ length: MVP_PLACES }, (_, i) => placed(i + 1)),
                mvp_rated_matches: rated.length,
                matches: played.map((r) => r.match_id).sort((a, b) => a - b),
            };
        })
        .sort((a, b) => b.matches_played - a.matches_played || a.hero_id - b.hero_id);
}

/** A regular who shows up in matches between two weeks of the generated history, with a chance per match. */
interface Regular {
    nameIndex: number;
    fromWeek: number;
    untilWeek: number;
    chance: number;
    /** Chance in matches the player lost; `chance` then applies to the ones won. */
    chanceInLosses?: number;
}

const ALWAYS = Infinity;

/** Friends who queue with the player: one all year, two for a stretch each, one now and then. */
const MATES: readonly Regular[] = [
    { nameIndex: 1, fromWeek: 0, untilWeek: ALWAYS, chance: 0.22 },
    { nameIndex: 4, fromWeek: 6, untilWeek: 36, chance: 0.4 },
    { nameIndex: 8, fromWeek: 40, untilWeek: ALWAYS, chance: 0.42 },
    { nameIndex: 12, fromWeek: 0, untilWeek: ALWAYS, chance: 0.08 },
];

/** The first enemy is the nemesis: far likelier to be across the map in a match the player loses. */
const ENEMIES: readonly Regular[] = [
    { nameIndex: 17, fromWeek: 0, untilWeek: ALWAYS, chance: 0.03, chanceInLosses: 0.3 },
    { nameIndex: 18, fromWeek: 0, untilWeek: ALWAYS, chance: 0.12 },
    { nameIndex: 19, fromWeek: 10, untilWeek: ALWAYS, chance: 0.1 },
    { nameIndex: 20, fromWeek: 0, untilWeek: ALWAYS, chance: 0.09 },
    { nameIndex: 21, fromWeek: 0, untilWeek: 30, chance: 0.08 },
    { nameIndex: 22, fromWeek: 0, untilWeek: ALWAYS, chance: 0.07 },
];

function appears(regular: Regular, row: HistoryRow): boolean {
    const week = (row.start_time - FIRST_MONDAY_S) / WEEK_S;
    if (week < regular.fromWeek || week >= regular.untilWeek) return false;
    const chance = !won(row) && regular.chanceInLosses !== undefined ? regular.chanceInLosses : regular.chance;
    return unit(row.match_id, 100 + regular.nameIndex) < chance;
}

function companionRows(
    identity: Identity,
    rows: readonly HistoryRow[],
    window: StatsWindow,
    regulars: readonly Regular[],
) {
    const inside = inWindow(rows, window);
    return regulars
        .map((regular) => {
            const together = inside.filter((row) => appears(regular, row));
            return {
                id: fakeAccountId(identity, regular.nameIndex),
                wins: together.filter(won).length,
                matches_played: together.length,
                matches: together.map((row) => row.match_id).sort((a, b) => a - b),
            };
        })
        .filter((row) => row.matches_played > 0)
        .sort((a, b) => b.matches_played - a.matches_played || a.id - b.id);
}

/** The body of `GET /v1/players/{id}/mate-stats?same_party=true`. `wins` are the viewer's wins. */
export function mateStatsRows(identity: Identity, rows: readonly HistoryRow[], window: StatsWindow) {
    return companionRows(identity, rows, window, MATES).map(({ id, ...rest }) => ({ mate_id: id, ...rest }));
}

/** The body of `GET /v1/players/{id}/enemy-stats`. `wins` are the viewer's wins. */
export function enemyStatsRows(identity: Identity, rows: readonly HistoryRow[], window: StatsWindow) {
    return companionRows(identity, rows, window, ENEMIES).map(({ id, ...rest }) => ({ enemy_id: id, ...rest }));
}

/** The enemy the demo player loses to most. */
export const NEMESIS_NAME_INDEX = ENEMIES[0]!.nameIndex;
export const MATE_NAME_INDEXES = MATES.map((m) => m.nameIndex);
