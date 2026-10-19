import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import type { MvpMetric } from "@deadlock-plus/ipc-types/MvpMetric";
import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";
import { seeded } from "../../random";
import { MATCH_IDS } from "./identity";

/** Matches that show the grade's edge cases: a shared place, a leaver, and a grade from game-captured data. */
export const GRADE_CASES = { tie: MATCH_IDS[0]!, leaver: MATCH_IDS[1]!, provisional: MATCH_IDS[2]! };

/** The score cut-offs (in tenths) the app grades with, best first; anything below the last is an F. */
const LETTERS: readonly (readonly [number, MvpLetter])[] = [
    [966, "S+"],
    [933, "S"],
    [900, "S-"],
    [850, "A+"],
    [800, "A"],
    [750, "A-"],
    [700, "B+"],
    [650, "B"],
    [575, "B-"],
    [500, "C+"],
    [450, "C"],
    [400, "C-"],
    [350, "D+"],
    [300, "D"],
    [250, "D-"],
    [200, "E+"],
    [150, "E"],
    [100, "E-"],
];

export const letterFor = (s10: number): MvpLetter => LETTERS.find(([cut]) => s10 >= cut)?.[1] ?? "F";

/** The parts of the demo's match metadata a grade reads. */
export interface GradedMatch {
    match_info: {
        match_id: number;
        duration_s: number;
        winning_team: number;
        players: readonly {
            account_id: number;
            player_slot: number;
            team: number;
            hero_id: number;
            kills: number;
            deaths: number;
            assists: number;
            net_worth: number;
            stats: readonly { player_damage: number; player_healing: number }[];
        }[];
    };
}

/** Heroes that earn no self healing or no ally healing, as the real model skips stats a hero never uses. */
const NO_SELF_HEALING = new Set([2, 13, 17]);
const NO_SUPPORT = new Set([1, 6, 8, 11, 14, 19, 25, 31, 50]);

const METRICS: readonly MvpMetric[] = [
    "early_damage",
    "late_damage",
    "early_assists",
    "late_assists",
    "prebase_objective",
    "base_objective",
    "damage_absorbed",
    "ally_healing",
    "heal_prevented",
    "barriers",
    "cs",
    "kills",
    "deaths",
    "cc",
];

const CURVE_CENTRE = 55;
const CURVE_SLOPE = 20;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** 1 + the number of strictly larger values; equal values share a rank. */
const competitionRanks = (values: readonly number[]) => values.map((v) => 1 + values.filter((o) => o > v).length);

function zScores(values: readonly number[]): number[] {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    return values.map((v) => (sd > 0 ? (v - mean) / sd : 0));
}

interface Drafted {
    accountId: number;
    playerSlot: number;
    heroId: number;
    team: number;
    points: number[];
    farmBonus: number;
}

const sumPoints = (d: Drafted) => d.points.reduce((a, b) => a + b, 0);
const totalOf = (d: Drafted) => sumPoints(d) + d.farmBonus;

/** A deterministic, realistic-looking grade for a demo match. Not the app's formula: only its shape and rules. */
/** `ownAccountId` is never the leaver, so the demo player always has a grade. */
export function demoGrade(match: GradedMatch, ownAccountId: number): MvpMatchGrade {
    const info = match.match_info;
    const rng = seeded(info.match_id * 977 + 5);
    const minutes = info.duration_s / 60;
    const jitter = (v: number) => Math.round(v * (0.75 + rng() * 0.5));

    let drafted = info.players.map((p): Drafted => {
        const last = p.stats[p.stats.length - 1] ?? { player_damage: 0, player_healing: 0 };
        const damage = last.player_damage / minutes;
        const healing = last.player_healing / minutes;
        const earlyShare = 0.3 + rng() * 0.2;
        const byMetric: Record<MvpMetric, number> = {
            early_damage: jitter(damage * earlyShare * 0.9),
            late_damage: jitter(damage * (1 - earlyShare) * 1.3),
            early_assists: jitter(p.assists * 7),
            late_assists: jitter(p.assists * 9),
            prebase_objective: jitter(rng() * 240),
            base_objective: jitter(rng() * 320),
            damage_absorbed: jitter(rng() * damage * 0.4),
            ally_healing: NO_SUPPORT.has(p.hero_id) ? 0 : jitter(healing * 1.2),
            heal_prevented: NO_SELF_HEALING.has(p.hero_id) ? 0 : jitter(healing * 0.5),
            barriers: jitter(rng() * 90),
            cs: jitter((p.net_worth / minutes) * 0.45),
            kills: jitter(p.kills * 30),
            deaths: 0 - jitter(p.deaths * 28),
            cc: jitter(rng() * 400),
        };
        return {
            accountId: p.account_id,
            playerSlot: p.player_slot,
            heroId: p.hero_id,
            team: p.team,
            points: METRICS.map((m) => byMetric[m] || 0),
            farmBonus: jitter(rng() * 220),
        };
    });

    const leaver = info.match_id === GRADE_CASES.leaver;
    const byTotal = () => [...drafted].sort((a, b) => totalOf(b) - totalOf(a) || a.playerSlot - b.playerSlot);
    if (leaver) {
        const left = byTotal().findLast((d) => d.accountId !== ownAccountId);
        drafted = drafted.filter((d) => d !== left);
    }
    if (info.match_id === GRADE_CASES.tie) {
        const [, second, third] = byTotal();
        third!.farmBonus += totalOf(second!) - totalOf(third!);
    }

    const totals = drafted.map(totalOf);
    const z = zScores(totals);
    const places = competitionRanks(totals);
    const columns = METRICS.map((_, m) => competitionRanks(drafted.map((d) => d.points[m]!)));

    return {
        matchId: info.match_id,
        leaver,
        pathsChecked: info.match_id !== GRADE_CASES.provisional,
        provisional: info.match_id === GRADE_CASES.provisional,
        players: drafted
            .map((d, i): MvpPlayerGrade => {
                const s10 = Math.round(clamp(CURVE_CENTRE + CURVE_SLOPE * z[i]!, 0, 100) * 10);
                return {
                    accountId: d.accountId,
                    playerSlot: d.playerSlot,
                    heroId: d.heroId,
                    team: d.team,
                    s10,
                    letter: letterFor(s10),
                    place: places[i]!,
                    totalPoints: totals[i]!,
                    farmBonus: d.farmBonus,
                    stats: METRICS.map((metric, m) => ({ metric, points: d.points[m]!, rank: columns[m]![i]! })),
                };
            })
            .sort((a, b) => a.place - b.place || a.playerSlot - b.playerSlot),
    };
}
