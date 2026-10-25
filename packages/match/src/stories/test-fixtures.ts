import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import { parseApiDetail } from "../api-detail";
import type { MatchDetail } from "../detail";
import ranked from "../fixtures/api-ranked.json";
import comebackGrades from "../../../../crates/ring1/dp-mvp/fixtures/lobby-118862917.expected.json";
import comeback from "../../../../crates/ring1/dp-mvp/fixtures/lobby-118862917.json";
import swing from "../../../../crates/ring1/dp-mvp/fixtures/lobby-118807747.json";
import stompGrades from "../../../../crates/ring1/dp-mvp/fixtures/lobby-119006587.expected.json";
import stomp from "../../../../crates/ring1/dp-mvp/fixtures/lobby-119006587.json";
import type { GradeInput } from "./stories";

type Json = Record<string, any>;

function parse(fixture: unknown, edit?: (info: Json) => void): MatchDetail {
    const root = structuredClone(fixture) as Json;
    edit?.(root.match_info);
    const detail = parseApiDetail(root);
    if (!detail) throw new Error("fixture did not parse");
    return detail;
}

function grades(expected: { players: Json[] }): GradeInput[] {
    return expected.players.map((p) => ({
        playerSlot: p.player_slot,
        letter: p.letter as MvpLetter,
        place: p.place,
        s10: p.s10,
    }));
}

/** 12 players, The Archmother wins while 42,212 net worth behind at the end; no healing recorded. */
export const comebackMatch = (edit?: (info: Json) => void) => parse(comeback, edit);
export const comebackGrading = () => grades(comebackGrades);

/** 12 players, The Archmother wins after trailing by 6,977 net worth at 35:00. */
export const swingMatch = (edit?: (info: Json) => void) => parse(swing, edit);

/** 12 players, The Archmother leads from the first sample to the end. */
export const stompMatch = (edit?: (info: Json) => void) => parse(stomp, edit);
export const stompGrading = () => grades(stompGrades);

/** 4 of 12 players with lanes, healing and a start time. */
export const rankedMatch = (edit?: (info: Json) => void) => parse(ranked, edit);
