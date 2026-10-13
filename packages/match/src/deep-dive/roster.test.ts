import { describe, expect, it } from "vitest";
import { parseApiDetail } from "../api-detail";
import fixture from "../fixtures/api-ranked.json";
import { teamRoster } from "./roster";

describe("teamRoster", () => {
    it("lists each team's players by slot, with their hero", () => {
        const detail = parseApiDetail(fixture)!;
        const roster = teamRoster(detail);
        expect(roster.map((r) => r.team)).toEqual(["hidden-king", "archmother"]);
        for (const r of roster) {
            const slots = r.players.map((p) => p.slot);
            expect(slots).toEqual([...slots].sort((a, b) => a - b));
            expect(r.players.every((p) => p.heroId > 0)).toBe(true);
        }
        expect(roster.flatMap((r) => r.players)).toHaveLength(detail.teams.flatMap((t) => t.players).length);
    });
});
