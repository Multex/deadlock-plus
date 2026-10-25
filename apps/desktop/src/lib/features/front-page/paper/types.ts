import type { MatchTeam } from "@deadlock-plus/match/detail";

export interface BoxRow {
    id: string | number;
    hero: string;
    player?: string;
    kills: number;
    deaths: number;
    assists: number;
    netWorth: number;
    grade?: string | null;
    own?: boolean;
}

export interface BoxTeam {
    team: MatchTeam;
    name: string;
    /** Already translated, e.g. "Win". */
    result?: string;
    rows: BoxRow[];
}

export interface TeamTotal {
    team: MatchTeam;
    name: string;
    kills: number;
}

export interface Rating {
    id: string | number;
    letter: string;
    name: string;
    /** 1 is best; the list is sorted by it. */
    place: number;
    /** Already translated, e.g. "1st of 12". */
    placeLabel: string;
    own?: boolean;
}

export type LaneInk = "yellow" | "blue" | "green";

export interface LaneLine {
    id: string | number;
    name: string;
    ink: LaneInk;
    text: string;
}

export interface Brief {
    id: string | number;
    headline: string;
    body: string;
}

export interface ObjectiveMark {
    id: string | number;
    timeS: number;
    /** The team that took it. */
    team: MatchTeam;
    short: string;
    label: string;
}

export interface Weather {
    forecast: string;
    lines: string[];
}
