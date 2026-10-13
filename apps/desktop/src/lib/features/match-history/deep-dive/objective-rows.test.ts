import { describe, expect, it } from "vitest";
import type { MatchObjective } from "@deadlock-plus/match/detail";
import { objectiveRows } from "@deadlock-plus/match/deep-dive/objective-rows";
import { objectiveNameKey } from "./objective-rows";

function objective(objectiveId: number, extra: Partial<MatchObjective> = {}): MatchObjective {
    return { objectiveId, team: "hidden-king", creepDamage: 0, playerDamage: 0, spiritDamage: 0, ...extra };
}

describe("objectiveNameKey", () => {
    it("maps every objective id to a readable kind name", () => {
        const ids = [0, 1, 4, 5, 8, 9, 10, 11, 12, 15, 99];
        const keys = objectiveRows(ids.map((id) => objective(id))).map((r) => [
            r.objectiveId,
            objectiveNameKey(r.kind),
        ]);
        const byId = Object.fromEntries(keys);
        const p = "match_history.deep_dive.objectives.";
        expect(byId).toMatchObject({
            0: `${p}kind_core`,
            1: `${p}kind_guardian`,
            4: `${p}kind_guardian`,
            5: `${p}kind_walker`,
            8: `${p}kind_walker`,
            9: `${p}kind_patron`,
            10: `${p}kind_shrine`,
            11: `${p}kind_shrine`,
            12: `${p}kind_base_guardian`,
            15: `${p}kind_base_guardian`,
            99: `${p}kind_unknown`,
        });
    });
});
