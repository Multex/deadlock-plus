import { playerBySlot, type MatchDetail } from "@deadlock-plus/match/detail";

export function accountOfSlot(detail: MatchDetail, slot: number): number | null {
    return playerBySlot(detail, slot)?.accountId ?? null;
}
