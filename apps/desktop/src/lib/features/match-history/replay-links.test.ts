import { describe, expect, it } from "vitest";
import { parseApiDetail } from "@deadlock-plus/match/api-detail";
import { allPlayers, type MatchDetail } from "@deadlock-plus/match/detail";
import fixture from "@deadlock-plus/match/fixtures/api-ranked.json";
import { accountOfSlot } from "./replay-links";

function detail(): MatchDetail {
    const d = parseApiDetail(fixture);
    if (!d) throw new Error("fixture did not parse");
    return d;
}

describe("accountOfSlot", () => {
    it("resolves a slot to that player's account id", () => {
        const d = detail();
        const player = allPlayers(d)[3];
        expect(accountOfSlot(d, player.slot)).toBe(player.accountId);
    });

    it("has no account for a slot nobody played", () => {
        expect(accountOfSlot(detail(), 999)).toBeNull();
    });
});
