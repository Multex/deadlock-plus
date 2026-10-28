import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import { seeded } from "../../random";
import type { Identity } from "../../scenario";
import { fakeAccountId } from "../default/identity";
import { demoGrade, type GradedMatch } from "../default/match-grades";
import type { HistoryRow } from "../default/progress";
import { damageOf } from "./player-stats";

const TEAM_SIZE = 6;
const HERO_IDS = [1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 25, 27, 31, 35, 50, 52, 58];

const int = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

function shuffled<T>(rng: () => number, list: readonly T[]): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
}

/** The twelve players of a generated match: the demo player's line is the row's, the others are invented around it. */
function gradedMatchOf(identity: Identity, row: HistoryRow): GradedMatch {
    const rng = seeded(row.match_id * 31 + 7);
    const minutes = row.match_duration_s / 60;
    const own = row.player_team * TEAM_SIZE + int(rng, 0, TEAM_SIZE - 1);
    const heroes = shuffled(
        rng,
        HERO_IDS.filter((id) => id !== row.hero_id),
    );
    const names = shuffled(
        rng,
        identity.names.map((_, i) => i),
    );
    let next = 0;
    const players = Array.from({ length: TEAM_SIZE * 2 }, (_, slot) => {
        const isOwn = slot === own;
        const damage = isOwn ? damageOf(row) : Math.round(minutes * (450 + rng() * 650));
        const index = isOwn ? 0 : next++;
        return {
            account_id: isOwn ? identity.accountId : fakeAccountId(identity, names[index]!),
            player_slot: slot + 1,
            team: slot < TEAM_SIZE ? 0 : 1,
            hero_id: isOwn ? row.hero_id : heroes[index]!,
            kills: isOwn ? row.player_kills : int(rng, 1, 14),
            deaths: isOwn ? row.player_deaths : int(rng, 1, 11),
            assists: isOwn ? row.player_assists : int(rng, 2, 20),
            net_worth: isOwn ? row.net_worth : Math.round(row.match_duration_s * (15 + rng() * 6)),
            stats: [{ player_damage: damage, player_healing: Math.round(minutes * rng() * 400) }],
        };
    });
    return {
        match_info: {
            match_id: row.match_id,
            duration_s: row.match_duration_s,
            winning_team: row.match_result,
            players,
        },
    };
}

/** Grades of the generated matches, worked out when first asked for. */
export function gradeBook(identity: Identity, rows: readonly HistoryRow[]) {
    const byId = new Map(rows.map((row) => [row.match_id, row]));
    const grades = new Map<number, MvpMatchGrade>();
    return (matchId: number): MvpMatchGrade | undefined => {
        const row = byId.get(matchId);
        if (!row) return undefined;
        let grade = grades.get(matchId);
        if (!grade) {
            grade = demoGrade(gradedMatchOf(identity, row), identity.accountId);
            grades.set(matchId, grade);
        }
        return grade;
    };
}
