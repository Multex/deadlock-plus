/** The scenario clock of `dispatch-specials`: a Wednesday evening after November's and the season's issues are due. */
export const SPECIALS_NOW_MS = Date.UTC(2026, 11, 2, 19, 30, 0);

export const SEASON_1_START_S = 1_785_430_800;
export const SEASON_1_END_S = 1_793_916_000;

/** The body of `GET /v1/assets/ranked-seasons`, interval 2 included, as the live API serves it. */
export const RANKED_SEASONS = [
    {
        class_name: "season_1",
        name: "Beta Season 1",
        ranked_type: "normal",
        intervals: [
            { interval: 1, start_timestamp: SEASON_1_START_S, end_timestamp: SEASON_1_END_S, leaderboard_id: 1001 },
            { interval: 2, start_timestamp: SEASON_1_END_S, end_timestamp: 1_830_326_400, leaderboard_id: 1002 },
        ],
    },
];
