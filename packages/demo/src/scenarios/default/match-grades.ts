import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import type { MvpPlayerGrade } from "@deadlock-plus/ipc-types/MvpPlayerGrade";
import { seeded } from "../../random";
import { MATCH_IDS } from "./identity";

/** Matches that show the grade's edge cases: a shared place, a leaver, and a grade from game-captured data. */
export const GRADE_CASES = { tie: MATCH_IDS[0]!, leaver: MATCH_IDS[1]!, provisional: MATCH_IDS[2]! };

/** The s10 cut-offs the app grades with, best first; anything below the last is an F. */
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

/** Heroes graded without self healing or without support, as the real model skips stats a hero never uses. */
const NO_SELF_HEALING = new Set([2, 13, 17]);
const NO_SUPPORT = new Set([1, 6, 8, 11, 14, 19, 25, 31, 50]);
const STAT_WEIGHTS = [1.1, 1, 1, 1.3, 1.3, 0.7, 0.4, 0.6];
const DEATHS = 1;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Lobby rank of each value as a percentile, nudged by noise so the shares do not repeat across matches. */
function percentiles(values: readonly number[], rng: () => number): number[] {
    return values.map((v) => {
        const below = values.filter((o) => o < v).length + values.filter((o) => o === v).length / 2;
        const share = (below / values.length) * 100;
        return Math.round(clamp(share + (rng() - 0.5) * 24, 1, 99) * 10) / 10;
    });
}

/** A deterministic, realistic-looking grade for a demo match. Not the app's model: only its shape and rules. */
/** `ownAccountId` is never the leaver, so the demo player always has a grade. */
export function demoGrade(match: GradedMatch, builtAt: number, ownAccountId: number): MvpMatchGrade {
    const info = match.match_info;
    const rng = seeded(info.match_id * 977 + 5);
    const minutes = info.duration_s / 60;
    const rows = info.players.map((p) => {
        const last = p.stats[p.stats.length - 1] ?? { player_damage: 0, player_healing: 0 };
        return [
            p.kills,
            p.deaths,
            p.assists,
            p.net_worth,
            last.player_damage,
            rng() * p.net_worth,
            last.player_healing * (0.4 + rng() * 0.5),
            last.player_healing * rng(),
        ].map((v) => v / minutes);
    });
    const byStat = STAT_WEIGHTS.map((_, s) =>
        percentiles(
            rows.map((r) => r[s]!),
            rng,
        ),
    );

    let graded = info.players.map((p, i): Omit<MvpPlayerGrade, "letter" | "place"> => {
        const shares: (number | null)[] = byStat.map((column) => column[i]!);
        if (NO_SELF_HEALING.has(p.hero_id)) shares[6] = null;
        if (NO_SUPPORT.has(p.hero_id)) shares[7] = null;
        let sum = 0;
        let weight = 0;
        shares.forEach((share, s) => {
            if (share === null) return;
            sum += (s === DEATHS ? 100 - share : share) * STAT_WEIGHTS[s]!;
            weight += STAT_WEIGHTS[s]!;
        });
        const won = p.team === info.winning_team ? 4 : -4;
        const score = clamp(50 + (sum / weight - 50) * 1.45 + won, 6, 98.8);
        return {
            accountId: p.account_id,
            playerSlot: p.player_slot,
            heroId: p.hero_id,
            s10: Math.round(score * 10),
            percentiles: shares,
        };
    });

    const leaver = info.match_id === GRADE_CASES.leaver;
    const ranked = [...graded].sort((a, b) => b.s10 - a.s10 || a.playerSlot - b.playerSlot);
    if (info.match_id === GRADE_CASES.tie) ranked[2]!.s10 = ranked[1]!.s10;
    if (leaver) {
        const left = ranked.findLast((g) => g.accountId !== ownAccountId);
        graded = graded.filter((g) => g !== left);
    }

    const players = graded
        .map((g) => ({
            ...g,
            letter: letterFor(g.s10),
            place: 1 + graded.filter((o) => o.s10 > g.s10).length,
        }))
        .sort((a, b) => a.place - b.place || a.playerSlot - b.playerSlot);

    return {
        matchId: info.match_id,
        builtAt,
        leaver,
        pathsChecked: info.match_id !== GRADE_CASES.provisional,
        players,
    };
}
