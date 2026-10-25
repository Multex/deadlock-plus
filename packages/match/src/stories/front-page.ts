import type { MatchPingSeries } from "@deadlock-plus/ipc-types/MatchPingSeries";
import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import { playerLine, valueAt } from "../deep-dive/chart";
import { laneForPlayerLane, type LaneColor } from "../deep-dive/lanes";
import { objectiveNames, type ObjectiveKind } from "../deep-dive/names";
import {
    allPlayers,
    findPlayer,
    MATCH_TEAMS,
    type MatchDetail,
    type MatchPlayer,
    type MatchTeam,
    type PlayerOutcome,
} from "../detail";
import { rowMode, type RowMode } from "../list";
import { matchPingFromSeries } from "../ping";
import { buildTimeline } from "../timeline";
import { detectStories, type GradeInput, type Story, type StoryInput } from "./stories";

export interface FrontPageInput extends StoryInput {
    ping?: MatchPingSeries | null;
    /** How many of the best grades the ratings list. Defaults to 3. */
    ratingsLimit?: number;
}

export interface Dateline {
    mode: RowMode;
    durationS: number;
    /** Unix seconds. Absent when the source has no start time. */
    startTime?: number;
    winner?: MatchTeam;
    /** Absent when the viewer did not play. */
    result?: PlayerOutcome;
}

export interface BoxRow {
    slot: number;
    accountId: number;
    heroId: number;
    name?: string;
    viewer: boolean;
    kills: number;
    deaths: number;
    assists: number;
    netWorth: number;
    lastHits: number;
    /** Absent for every row when the match recorded no player damage. */
    damage?: number;
    /** Absent for every row when the match recorded no healing. */
    healing?: number;
    grade?: { letter: MvpLetter; place: number };
}

export interface TeamBox {
    team: MatchTeam;
    kills: number;
    netWorth: number;
    won: boolean;
    /** Highest net worth first. */
    rows: BoxRow[];
}

export interface Rating {
    slot: number;
    heroId: number;
    name?: string;
    letter: MvpLetter;
    place: number;
    s10: number;
    viewer: boolean;
}

export interface LaneReport {
    /** The lane id players carry. */
    laneId: number;
    color: LaneColor;
    slots: Record<MatchTeam, number[]>;
    /**
     * The Hidden King's net worth minus The Archmother's among this lane's players at 10:00, read between
     * samples. Absent when the match ended before 10:00 or a lane player has no samples.
     */
    leadAt10?: number;
}

export interface ObjectiveMark {
    timeS: number;
    kind: ObjectiveKind | "mid_boss";
    /** 1-based among the lanes this match has; lane objectives only. */
    lane?: number;
    /** Team that lost the objective; absent for the Mid Boss. */
    owner?: MatchTeam;
    /** Team that took it: the other side for an objective, the claiming team for the Mid Boss. */
    by?: MatchTeam;
    killedBy?: MatchTeam;
}

export type Forecast = "clear" | "fair" | "overcast" | "storm";

export interface Weather {
    /** Milliseconds, rounded. */
    avg: number;
    worst: number;
    /** Mean change between consecutive direct pings. Absent with no two in a row. */
    jitter?: number;
    samples: number;
    /** The recording began after the match had started. */
    partial: boolean;
    forecast: Forecast;
}

export interface FrontPage {
    matchId: number;
    dateline: Dateline;
    /** Absent when the viewer did not play. */
    viewerSlot?: number;
    /** The top story. Absent only when no detector fired. */
    banner?: Story;
    /** Two stories when there are enough, up to four when the extra ones score `COLUMN_MIN_SCORE` or more. */
    columns: Story[];
    /** Up to `BRIEF_LIMIT` of the rest. */
    briefs: Story[];
    /** The viewer's team first; The Hidden King first when the viewer did not play. */
    teams: [TeamBox, TeamBox];
    /** The best places, then the viewer when graded below them. Empty without grades. */
    ratings: Rating[];
    /** Graded players: the N in "3rd of N". */
    gradedCount: number;
    /** Lanes in the game's lane order; lanes nobody was assigned to are left out. */
    lanes: LaneReport[];
    objectives: ObjectiveMark[];
    /** Absent without a ping series holding a direct ping. */
    weather?: Weather;
}

const MIN_COLUMNS = 2;
const MAX_COLUMNS = 4;
export const COLUMN_MIN_SCORE = 40;
export const BRIEF_LIMIT = 4;
const DEFAULT_RATINGS_LIMIT = 3;
const LANE_REPORT_S = 600;
const LANE_IDS = [1, 4, 6];

/** Upper bounds of average ping per forecast, in ms; anything above the last is a storm. */
const FORECAST_MAX_MS: readonly [Forecast, number][] = [
    ["clear", 50],
    ["fair", 100],
    ["overcast", 150],
];

function place(stories: Story[]): Pick<FrontPage, "banner" | "columns" | "briefs"> {
    const [banner, ...rest] = stories;
    let n = Math.min(MIN_COLUMNS, rest.length);
    while (n < MAX_COLUMNS && n < rest.length && rest[n].score >= COLUMN_MIN_SCORE) n++;
    const out: Pick<FrontPage, "banner" | "columns" | "briefs"> = {
        columns: rest.slice(0, n),
        briefs: rest.slice(n, n + BRIEF_LIMIT),
    };
    if (banner) out.banner = banner;
    return out;
}

function dateline(detail: MatchDetail, viewer: MatchPlayer | undefined): Dateline {
    const out: Dateline = { mode: rowMode(detail), durationS: detail.durationS };
    if (detail.startTime > 0) out.startTime = detail.startTime;
    if (detail.winningTeam) out.winner = detail.winningTeam;
    if (viewer) out.result = viewer.outcome;
    return out;
}

function teams(detail: MatchDetail, viewer: MatchPlayer | undefined, grades: GradeInput[]): [TeamBox, TeamBox] {
    const players = allPlayers(detail);
    const sampled = players.filter((p) => p.series.length > 0);
    const hasDamage = sampled.some((p) => p.playerDamage > 0);
    const hasHealing = sampled.some((p) => p.healing > 0);
    const gradeBySlot = new Map(grades.map((g) => [g.playerSlot, g]));

    const row = (p: MatchPlayer): BoxRow => {
        const r: BoxRow = {
            slot: p.slot,
            accountId: p.accountId,
            heroId: p.heroId,
            viewer: p.slot === viewer?.slot,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            netWorth: p.souls,
            lastHits: p.lastHits,
        };
        if (p.name !== undefined) r.name = p.name;
        if (hasDamage && p.series.length > 0) r.damage = p.playerDamage;
        if (hasHealing && p.series.length > 0) r.healing = p.healing;
        const g = gradeBySlot.get(p.slot);
        if (g) r.grade = { letter: g.letter, place: g.place };
        return r;
    };

    const first = viewer?.team ?? "hidden-king";
    const order = [first, MATCH_TEAMS.find((t) => t !== first) as MatchTeam] as const;
    return order.map((team): TeamBox => {
        const side = detail.teams.find((t) => t.team === team);
        const members = side?.players ?? [];
        return {
            team,
            kills: side?.score ?? 0,
            netWorth: members.reduce((sum, p) => sum + p.souls, 0),
            won: detail.winningTeam === team,
            rows: members.map(row).sort((a, b) => b.netWorth - a.netWorth || a.slot - b.slot),
        };
    }) as [TeamBox, TeamBox];
}

function ratings(detail: MatchDetail, viewer: MatchPlayer | undefined, grades: GradeInput[], limit: number): Rating[] {
    const players = new Map(allPlayers(detail).map((p) => [p.slot, p]));
    const rated = grades
        .filter((g) => players.has(g.playerSlot))
        .sort((a, b) => a.place - b.place || b.s10 - a.s10 || a.playerSlot - b.playerSlot)
        .map((g): Rating => {
            const p = players.get(g.playerSlot) as MatchPlayer;
            const r: Rating = {
                slot: g.playerSlot,
                heroId: p.heroId,
                letter: g.letter,
                place: g.place,
                s10: g.s10,
                viewer: g.playerSlot === viewer?.slot,
            };
            if (p.name !== undefined) r.name = p.name;
            return r;
        });
    const top = rated.slice(0, limit);
    const own = rated.find((r) => r.viewer);
    return own && !top.includes(own) ? [...top, own] : top;
}

function lanes(detail: MatchDetail): LaneReport[] {
    const players = allPlayers(detail);
    return LANE_IDS.flatMap((laneId): LaneReport[] => {
        const lane = laneForPlayerLane(laneId);
        const members = players.filter((p) => p.lane === laneId);
        if (!lane || members.length === 0) return [];
        const report: LaneReport = {
            laneId,
            color: lane.color,
            slots: {
                "hidden-king": members.filter((p) => p.team === "hidden-king").map((p) => p.slot),
                archmother: members.filter((p) => p.team === "archmother").map((p) => p.slot),
            },
        };
        if (detail.durationS >= LANE_REPORT_S && members.every((p) => p.series.length > 0)) {
            const lead = members.reduce(
                (sum, p) => sum + (p.team === "hidden-king" ? 1 : -1) * valueAt(playerLine(p, "souls"), LANE_REPORT_S),
                0,
            );
            report.leadAt10 = Math.round(lead);
        }
        return [report];
    });
}

function objectives(detail: MatchDetail): ObjectiveMark[] {
    const names = objectiveNames(detail.objectives);
    const nameOf = new Map(detail.objectives.map((o, i) => [`${o.team}:${o.objectiveId}`, names[i]]));
    return buildTimeline(detail).flatMap((e): ObjectiveMark[] => {
        if (e.kind === "mid-boss") {
            const mark: ObjectiveMark = { timeS: e.timeS, kind: "mid_boss" };
            if (e.claimedBy) mark.by = e.claimedBy;
            if (e.killedBy) mark.killedBy = e.killedBy;
            return [mark];
        }
        if (e.kind !== "objective") return [];
        const name = nameOf.get(`${e.team}:${e.objectiveId}`);
        const mark: ObjectiveMark = { timeS: e.timeS, kind: name?.kind ?? "unknown" };
        if (name?.lane !== undefined) mark.lane = name.lane;
        mark.owner = e.team;
        mark.by = MATCH_TEAMS.find((t) => t !== e.team);
        return [mark];
    });
}

function weather(detail: MatchDetail, series: MatchPingSeries): Weather | undefined {
    const ping = matchPingFromSeries(series, detail);
    if (!ping) return undefined;
    const avg = Math.round(ping.summary.avg);
    const steps = ping.segments.flatMap((run) => run.slice(1).map((p, i) => Math.abs(p.v - run[i].v)));
    const out: Weather = {
        avg,
        worst: ping.summary.worst,
        samples: ping.summary.samples,
        partial: ping.partial,
        forecast: FORECAST_MAX_MS.find(([, max]) => avg < max)?.[0] ?? "storm",
    };
    if (steps.length > 0) out.jitter = Math.round(steps.reduce((a, b) => a + b, 0) / steps.length);
    return out;
}

export function buildFrontPage(input: FrontPageInput): FrontPage {
    const { detail } = input;
    const viewer =
        input.viewerAccountId === null || input.viewerAccountId === undefined
            ? undefined
            : findPlayer(detail, [input.viewerAccountId]);
    const grades = [...(input.grades ?? [])];
    const graded = grades.filter((g) => allPlayers(detail).some((p) => p.slot === g.playerSlot));

    const page: FrontPage = {
        matchId: detail.matchId,
        dateline: dateline(detail, viewer),
        ...place(detectStories(input)),
        teams: teams(detail, viewer, graded),
        ratings: ratings(detail, viewer, graded, input.ratingsLimit ?? DEFAULT_RATINGS_LIMIT),
        gradedCount: graded.length,
        lanes: lanes(detail),
        objectives: objectives(detail),
    };
    if (viewer) page.viewerSlot = viewer.slot;
    const w = input.ping ? weather(detail, input.ping) : undefined;
    if (w) page.weather = w;
    return page;
}
