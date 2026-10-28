import type { ApiRoute } from "../../fetch";
import type { Module, ScenarioContext } from "../../scenario";
import { RANKED_SEASONS } from "../dispatch/seasons";
import { MATCH_IDS } from "./identity";

/** One row of `GET /v1/players/{account_id}/match-history`. */
export interface HistoryRow {
    account_id: number;
    match_id: number;
    hero_id: number;
    hero_level: number;
    start_time: number;
    game_mode: number;
    match_mode: number;
    player_team: number;
    player_kills: number;
    player_deaths: number;
    player_assists: number;
    denies: number;
    net_worth: number;
    last_hits: number;
    match_duration_s: number;
    match_result: number;
    objectives_mask_team0: number;
    objectives_mask_team1: number;
    player_match_outcome: number;
    ranked_calibration_match: number | null;
    ranked_delta: number | null;
    ranked_display_badge: number | null;
    ranked_used_demotion_protection: boolean | null;
    abandoned_time_s: number | null;
    team_abandoned: boolean | null;
    brawl_score_team0: number | null;
    brawl_score_team1: number | null;
    brawl_avg_round_time_s: number | null;
}

/** `GET /v1/players/{account_id}/rank`. */
interface RankResponse {
    badge: number;
    rank: number;
    subrank: number;
    last_match: {
        match_id: number;
        start_time: number;
        player_rank_initial_display_rank: number;
        player_rank_initial_flat_progress: number;
        player_rank_final_flat_progress: number;
        player_rank_desired_progress_change: number;
        player_rank_initial_win_streak: number;
        player_rank_initial_calibration_games: number;
        player_rank_initial_demotion_protection_games: number;
        player_rank_consumed_demotion_protection: boolean;
    } | null;
}

const MATCH_MODE_RANKED = 4;
const GAME_MODE_NORMAL = 1;
const OUTCOME_WIN = 1;
const OUTCOME_LOSS = 2;

/**
 * Sixty matches over about three weeks of evening sessions, newest first, one per entry of `MATCH_IDS`: 33 wins,
 * mostly ranked, Lash and Infernus played most. The rank columns follow the game's ladder from Oracle 2 up to
 * Oracle 6, so a row's change and badge agree with the rows before it.
 *
 * Columns: hero, hero level, seconds from the match start to the scenario's now, match mode, own team, kills,
 * deaths, assists, denies, net worth, last hits, duration in seconds, winning team, objectives mask of team 0,
 * objectives mask of team 1, and for a ranked match the rank points won or lost, the badge it ended on and
 * whether a demotion protection game was used (all 0 when unranked).
 */
const MATCHES: readonly (readonly number[])[] = [
    [12, 28, 3416, 4, 1, 15, 4, 13, 14, 38341, 198, 1916, 1, 57342, 22446, 300, 86, 0],
    [11, 29, 6773, 4, 0, 2, 7, 9, 4, 38739, 262, 2457, 1, 51428, 29867, -300, 86, 0],
    [1, 27, 9027, 4, 1, 8, 3, 6, 13, 37207, 168, 2014, 1, 23542, 27819, 370, 86, 0],
    [7, 28, 91278, 4, 0, 6, 2, 12, 11, 36812, 199, 1638, 0, 9536, 20059, 300, 86, 0],
    [6, 36, 94538, 4, 0, 15, 7, 15, 11, 51932, 211, 2480, 0, 34915, 19968, 300, 86, 0],
    [12, 25, 263560, 1, 0, 8, 6, 15, 2, 34484, 228, 1780, 0, 6078, 31075, 0, 0, 0],
    [6, 30, 266359, 4, 0, 9, 6, 10, 7, 42426, 202, 2379, 1, 7981, 17126, -70, 86, 1],
    [31, 21, 268537, 4, 0, 7, 6, 8, 9, 27126, 137, 1398, 0, 62410, 45610, 300, 86, 0],
    [1, 26, 342270, 4, 0, 4, 11, 8, 2, 39095, 188, 2010, 1, 39720, 28158, -300, 85, 0],
    [11, 25, 344957, 4, 0, 11, 11, 13, 4, 32610, 222, 1907, 1, 40159, 26007, -300, 86, 0],
    [31, 28, 436090, 4, 1, 2, 10, 5, 7, 40836, 298, 2590, 0, 14569, 8461, -300, 86, 0],
    [1, 18, 437853, 4, 1, 7, 9, 18, 7, 25394, 119, 1403, 0, 7882, 62923, -300, 86, 0],
    [1, 22, 439870, 4, 0, 11, 6, 8, 12, 30124, 160, 1477, 0, 34705, 32019, 300, 86, 0],
    [31, 20, 442066, 1, 1, 11, 6, 19, 15, 25818, 179, 1416, 0, 12442, 49239, 0, 0, 0],
    [3, 34, 516146, 4, 0, 15, 2, 17, 13, 49623, 315, 2426, 0, 36327, 37637, 300, 86, 0],
    [31, 16, 517951, 4, 1, 8, 5, 5, 12, 24292, 110, 1325, 0, 62435, 53486, -300, 86, 0],
    [31, 23, 520301, 4, 0, 17, 3, 12, 3, 32760, 184, 1510, 0, 48140, 16537, 300, 86, 0],
    [11, 36, 523471, 1, 1, 9, 4, 16, 13, 53299, 310, 2450, 1, 55231, 2090, 0, 0, 0],
    [31, 21, 603051, 4, 0, 4, 11, 7, 14, 27905, 148, 1431, 1, 31618, 43290, -300, 86, 0],
    [7, 26, 605687, 4, 0, 10, 5, 9, 4, 34584, 175, 2096, 1, 29407, 40024, -300, 86, 0],
    [6, 19, 608037, 4, 0, 9, 2, 7, 5, 28385, 178, 1390, 0, 64402, 61429, 300, 86, 0],
    [1, 30, 610972, 4, 1, 4, 6, 10, 2, 43003, 284, 2335, 0, 44500, 40902, -300, 86, 0],
    [1, 31, 613820, 4, 1, 11, 3, 14, 14, 43747, 245, 2368, 1, 25172, 10335, 370, 86, 0],
    [1, 32, 777656, 4, 1, 17, 4, 5, 11, 47553, 254, 2456, 1, 55666, 18420, 300, 86, 0],
    [31, 23, 779392, 4, 0, 13, 5, 17, 2, 30926, 180, 1436, 0, 51212, 46823, 300, 86, 0],
    [6, 32, 782137, 4, 1, 5, 5, 10, 14, 44988, 253, 2445, 0, 39015, 36623, 0, 86, 1],
    [1, 18, 784523, 4, 1, 2, 5, 8, 2, 27318, 188, 1486, 0, 41547, 6517, -300, 86, 0],
    [31, 21, 787010, 4, 1, 11, 7, 8, 9, 30074, 177, 1587, 0, 54622, 40942, -300, 86, 0],
    [3, 32, 864764, 4, 1, 13, 4, 9, 12, 47546, 309, 2504, 1, 61142, 44856, 300, 86, 0],
    [31, 27, 867568, 4, 0, 10, 6, 11, 14, 38391, 181, 1844, 0, 2195, 44450, 300, 86, 0],
    [1, 29, 870687, 4, 0, 5, 11, 15, 9, 38286, 230, 2159, 1, 51550, 60890, -60, 86, 1],
    [31, 23, 945578, 4, 0, 8, 1, 6, 9, 29508, 200, 1538, 0, 13067, 18353, 390, 86, 0],
    [6, 23, 948043, 4, 1, 8, 4, 14, 3, 30494, 186, 1505, 1, 10540, 44627, 370, 85, 0],
    [31, 24, 950510, 4, 0, 15, 6, 7, 2, 35707, 213, 1747, 0, 34659, 54558, 300, 85, 0],
    [6, 26, 1042611, 4, 0, 9, 4, 6, 5, 38461, 240, 2031, 0, 8875, 64648, 300, 85, 0],
    [6, 27, 1045700, 4, 0, 11, 10, 9, 6, 36016, 202, 2129, 1, 22814, 37214, -300, 84, 0],
    [11, 29, 1048229, 4, 1, 10, 12, 11, 6, 42006, 224, 2169, 0, 37771, 17174, -300, 85, 0],
    [6, 23, 1050784, 4, 1, 14, 7, 6, 5, 31122, 200, 1715, 1, 10005, 4002, 300, 85, 0],
    [31, 30, 1053902, 4, 1, 2, 7, 10, 4, 42189, 270, 2158, 0, 33823, 2429, 0, 85, 1],
    [3, 19, 1128898, 4, 1, 9, 9, 6, 13, 28416, 223, 1738, 0, 57695, 30144, -140, 85, 1],
    [31, 36, 1132245, 4, 1, 7, 2, 6, 4, 50145, 334, 2567, 1, 62018, 35694, 410, 85, 0],
    [31, 21, 1134135, 1, 1, 5, 5, 10, 4, 27636, 139, 1410, 0, 28308, 59791, 0, 0, 0],
    [1, 33, 1291705, 1, 0, 8, 11, 6, 11, 48627, 226, 2605, 1, 59790, 30993, 0, 0, 0],
    [31, 19, 1294017, 1, 1, 3, 8, 14, 3, 26079, 162, 1472, 0, 39141, 48524, 0, 0, 0],
    [1, 25, 1383687, 4, 0, 7, 5, 8, 4, 36307, 183, 1767, 0, 40052, 37678, 390, 84, 0],
    [31, 31, 1386476, 4, 0, 11, 3, 13, 2, 41366, 201, 1949, 0, 45257, 47302, 370, 84, 0],
    [31, 31, 1389575, 4, 0, 12, 6, 19, 12, 44544, 303, 2559, 0, 56194, 50368, 300, 83, 0],
    [1, 24, 1391974, 4, 0, 15, 6, 7, 14, 33719, 140, 1499, 0, 13273, 44251, 300, 83, 0],
    [6, 22, 1394571, 1, 0, 12, 5, 6, 5, 33449, 164, 1757, 0, 34227, 41171, 0, 0, 0],
    [12, 30, 1473196, 4, 0, 4, 12, 12, 10, 42876, 322, 2476, 1, 27813, 50074, -300, 83, 0],
    [31, 21, 1475675, 4, 1, 11, 11, 5, 14, 28464, 156, 1639, 0, 46685, 49062, -300, 83, 0],
    [6, 27, 1552019, 4, 1, 11, 3, 11, 9, 35363, 171, 1559, 1, 12232, 5797, 370, 83, 0],
    [31, 23, 1553791, 4, 0, 13, 4, 15, 3, 31476, 136, 1412, 0, 37182, 21733, 300, 83, 0],
    [31, 25, 1555729, 4, 0, 11, 4, 5, 14, 35379, 158, 1698, 0, 57782, 27895, 300, 83, 0],
    [1, 30, 1641305, 4, 1, 10, 6, 7, 13, 43226, 305, 2345, 0, 38374, 31547, 0, 83, 1],
    [1, 32, 1644902, 4, 0, 9, 7, 6, 7, 45579, 301, 2697, 1, 2935, 22439, -300, 83, 0],
    [31, 33, 1648234, 4, 1, 13, 4, 8, 7, 46299, 324, 2492, 1, 9734, 4872, 300, 83, 0],
    [31, 27, 1650564, 4, 0, 7, 8, 19, 14, 40372, 226, 2090, 1, 60799, 34726, 0, 83, 1],
    [3, 32, 1725298, 4, 1, 16, 2, 7, 4, 44594, 265, 2338, 1, 42848, 33493, 300, 83, 0],
    [6, 33, 1728345, 4, 1, 13, 7, 14, 12, 47416, 260, 2687, 1, 29940, 64900, 300, 82, 0],
];

/** The player's match history, newest first, one row per entry of `MATCH_IDS`. */
export function historyRows({ identity, now }: ScenarioContext): HistoryRow[] {
    const nowS = Math.floor(now / 1000);
    return MATCHES.map((cells, i): HistoryRow => {
        const [hero, level, ago, mode, team, kills, deaths, assists, denies, netWorth, lastHits] = cells;
        const [duration, winner, objectives0, objectives1, delta, badge, protection] = cells.slice(11);
        const ranked = mode === MATCH_MODE_RANKED;
        return {
            account_id: identity.accountId,
            match_id: MATCH_IDS[i]!,
            hero_id: hero!,
            hero_level: level!,
            start_time: nowS - ago!,
            game_mode: GAME_MODE_NORMAL,
            match_mode: mode!,
            player_team: team!,
            player_kills: kills!,
            player_deaths: deaths!,
            player_assists: assists!,
            denies: denies!,
            net_worth: netWorth!,
            last_hits: lastHits!,
            match_duration_s: duration!,
            match_result: winner!,
            objectives_mask_team0: objectives0!,
            objectives_mask_team1: objectives1!,
            // Only ranked rows carry a scored outcome; unranked ones are read from the winning team.
            player_match_outcome: ranked ? (winner === team ? OUTCOME_WIN : OUTCOME_LOSS) : 0,
            ranked_calibration_match: ranked ? 0 : null,
            ranked_delta: ranked ? delta! : null,
            ranked_display_badge: ranked ? badge! : null,
            ranked_used_demotion_protection: ranked ? protection === 1 : null,
            abandoned_time_s: null,
            team_abandoned: null,
            brawl_score_team0: null,
            brawl_score_team1: null,
            brawl_avg_round_time_s: null,
        };
    });
}

const UNRANKED: RankResponse = { badge: 0, rank: 0, subrank: 0, last_match: null };

/** Where the newest ranked match, the first row, left the player: Oracle 6. */
function currentRank(newest: HistoryRow): RankResponse {
    return {
        badge: 86,
        rank: 8,
        subrank: 6,
        last_match: {
            match_id: newest.match_id,
            start_time: newest.start_time,
            player_rank_initial_display_rank: 86,
            player_rank_initial_flat_progress: 54670,
            player_rank_final_flat_progress: 54970,
            player_rank_desired_progress_change: 300,
            player_rank_initial_win_streak: 0,
            player_rank_initial_calibration_games: 0,
            player_rank_initial_demotion_protection_games: 1,
            player_rank_consumed_demotion_protection: false,
        },
    };
}

const accountOf = (url: URL) => Number(url.pathname.split("/")[3]);

export const progressModule: Module = {
    name: "progress",
    create(context) {
        const { accountId } = context.identity;
        const rows = historyRows(context);
        const rank = currentRank(rows[0]!);
        const routes: ApiRoute[] = [
            [/^\/v1\/players\/\d+\/match-history$/, (url) => (accountOf(url) === accountId ? rows : [])],
            [/^\/v1\/players\/\d+\/rank$/, (url) => (accountOf(url) === accountId ? rank : UNRANKED)],
            [/^\/v1\/players\/hero-stats$/, () => []],
            [/^\/v1\/players\/\d+\/mate-stats$/, () => []],
            [/^\/v1\/players\/\d+\/enemy-stats$/, () => []],
            [/^\/v1\/assets\/ranked-seasons$/, () => RANKED_SEASONS],
        ];
        return { routes };
    },
};
