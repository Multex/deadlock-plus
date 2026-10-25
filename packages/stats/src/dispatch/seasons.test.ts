import { describe, expect, it } from "vitest";
import { KNOWN_SEASONS, mergeSeasons, parseRankedSeasons, seasonAt } from "./seasons";
import type { RankedSeason } from "./types";

const utc = (y: number, m: number, d: number, h = 0) => Date.UTC(y, m - 1, d, h) / 1000;

const SEASON_1_START = 1785430800;
const SEASON_1_END = 1793916000;

const apiBody = [
    {
        class_name: "season_1",
        name: "Beta Season 1",
        ranked_type: "standard",
        intervals: [
            { interval: 1, start_timestamp: SEASON_1_START, end_timestamp: SEASON_1_END },
            { interval: 2, start_timestamp: SEASON_1_END, end_timestamp: utc(2028, 1, 1) },
        ],
    },
    {
        class_name: "season_2",
        name: "Season 2",
        intervals: [
            { interval: 2, start_timestamp: utc(2027, 3, 1), end_timestamp: utc(2027, 5, 1) },
            { interval: 1, start_timestamp: utc(2027, 1, 10), end_timestamp: utc(2027, 3, 1) },
        ],
    },
];

describe("KNOWN_SEASONS", () => {
    it("pins Beta Season 1 to its first interval", () => {
        expect(KNOWN_SEASONS).toContainEqual({
            id: "season_1",
            name: "Beta Season 1",
            startS: SEASON_1_START,
            endS: SEASON_1_END,
        });
    });
});

describe("parseRankedSeasons", () => {
    it("spans each season from its first interval start to its last interval end", () => {
        expect(parseRankedSeasons(apiBody)).toEqual([
            { id: "season_1", name: "Beta Season 1", startS: SEASON_1_START, endS: utc(2028, 1, 1) },
            { id: "season_2", name: "Season 2", startS: utc(2027, 1, 10), endS: utc(2027, 5, 1) },
        ]);
    });

    it("drops rows and intervals it cannot read", () => {
        const body = [
            null,
            "season_x",
            { name: "No id", intervals: [{ start_timestamp: 1, end_timestamp: 2 }] },
            { class_name: "season_3", name: "Empty", intervals: [] },
            { class_name: "season_4", name: "No intervals" },
            {
                class_name: "season_5",
                intervals: [
                    { start_timestamp: "100", end_timestamp: 200 },
                    { start_timestamp: 300, end_timestamp: 250 },
                    { start_timestamp: 400, end_timestamp: 500 },
                ],
            },
        ];
        expect(parseRankedSeasons(body)).toEqual([{ id: "season_5", name: "season_5", startS: 400, endS: 500 }]);
    });

    it("is empty for a body that is not a list", () => {
        expect(parseRankedSeasons(null)).toEqual([]);
        expect(parseRankedSeasons({ seasons: apiBody })).toEqual([]);
    });
});

describe("mergeSeasons", () => {
    it("keeps the pinned dates over the API's and adds seasons only the API knows, by start", () => {
        const merged = mergeSeasons(KNOWN_SEASONS, parseRankedSeasons(apiBody).reverse());
        expect(merged.map((s) => [s.id, s.startS, s.endS])).toEqual([
            ["season_1", SEASON_1_START, SEASON_1_END],
            ["season_2", utc(2027, 1, 10), utc(2027, 5, 1)],
        ]);
    });

    it("returns the pinned table when the API gave nothing", () => {
        expect(mergeSeasons(KNOWN_SEASONS, [])).toEqual([...KNOWN_SEASONS]);
    });
});

describe("seasonAt", () => {
    const seasons: RankedSeason[] = [
        { id: "season_1", name: "Beta Season 1", startS: SEASON_1_START, endS: SEASON_1_END },
        { id: "season_2", name: "Season 2", startS: utc(2027, 1, 10), endS: utc(2027, 5, 1) },
    ];

    it("is the season running at that instant, start inclusive, end exclusive", () => {
        expect(seasonAt(seasons, SEASON_1_START)?.id).toBe("season_1");
        expect(seasonAt(seasons, SEASON_1_END - 1)?.id).toBe("season_1");
        expect(seasonAt(seasons, utc(2027, 2, 1))?.id).toBe("season_2");
    });

    it("is null between and outside seasons", () => {
        expect(seasonAt(seasons, SEASON_1_START - 1)).toBeNull();
        expect(seasonAt(seasons, SEASON_1_END)).toBeNull();
        expect(seasonAt(seasons, utc(2027, 5, 1))).toBeNull();
    });
});
