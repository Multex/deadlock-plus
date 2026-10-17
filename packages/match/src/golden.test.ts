import { describe, expect, it } from "vitest";
import { parseApiDetail } from "./api-detail";
import { allPlayers } from "./detail";
import leaver from "./fixtures/golden/leaver-118343128.json";
import ranked from "./fixtures/golden/ranked-118339116.json";
import unranked from "./fixtures/golden/unranked-118340050.json";

function parse(fixture: unknown) {
    const detail = parseApiDetail(fixture);
    if (!detail) throw new Error("fixture did not parse");
    return detail;
}

describe("golden matches", () => {
    it("parses the ranked match header", () => {
        const d = parse(ranked);
        expect(d.matchId).toBe(118339116);
        expect(d.matchMode).toBe(4);
        expect(d.gameMode).toBe(1);
        expect(d.matchOutcome).toBe(0);
        expect(d.lowPriPool).toBe(false);
        expect(d.notScored).toBe(false);
        expect(allPlayers(d)).toHaveLength(12);
    });

    it("parses the unranked match header", () => {
        const d = parse(unranked);
        expect(d.matchId).toBe(118340050);
        expect(d.matchMode).toBe(1);
        expect(d.matchOutcome).toBe(0);
        expect(d.lowPriPool).toBe(false);
        expect(allPlayers(d)).toHaveLength(12);
    });

    it("reads the last stats sample into the per-stat totals", () => {
        const p = allPlayers(parse(ranked)).find((x) => x.slot === 8)!;
        const last = ranked.match_info.players.find((x) => x.player_slot === 8)!.stats.at(-1)!;
        expect(p.bossDamage).toBe(last.boss_damage);
        expect(p.teammateHealing).toBe(last.teammate_healing);
        expect(p.teammateBarriering).toBe(last.teammate_barriering);
        expect(p.bossDamage).toBeGreaterThanOrEqual(0);
    });

    it("keeps every clean player at abandon 0 and a win or loss outcome", () => {
        for (const p of allPlayers(parse(ranked))) {
            expect(p.abandonMatchTimeS).toBe(0);
            expect([1, 2]).toContain(p.playerMatchOutcome);
        }
    });

    it("measures path length in seconds per player", () => {
        const d = parse(ranked);
        const p = allPlayers(d).find((x) => x.slot === 5)!;
        expect(p.pathS).toBe(1474);
        expect(allPlayers(d).every((x) => (x.pathS ?? 0) >= 0.9 * d.durationS)).toBe(true);
    });

    it("exposes the leaver, the penalised outcome and the short path", () => {
        const d = parse(leaver);
        const quitter = allPlayers(d).find((x) => x.abandonMatchTimeS)!;
        expect(quitter.abandonMatchTimeS).toBe(1106);
        expect(quitter.playerMatchOutcome).toBe(3);
        expect(quitter.pathS).toBeLessThan(0.9 * d.durationS);
        expect(allPlayers(d).filter((x) => x.abandonMatchTimeS)).toHaveLength(1);
        expect(allPlayers(d).filter((x) => x.playerMatchOutcome === 5)).toHaveLength(5);
    });

    it("leaves the new fields unset when the source omits them", () => {
        const d = parse({
            match_info: { match_id: 1, players: [{ player_slot: 1, account_id: 2, hero_id: 3, team: 0 }] },
        });
        const p = allPlayers(d)[0];
        expect(d.matchOutcome).toBeUndefined();
        expect(d.lowPriPool).toBeUndefined();
        expect(p.bossDamage).toBeUndefined();
        expect(p.abandonMatchTimeS).toBeUndefined();
        expect(p.playerMatchOutcome).toBeUndefined();
        expect(p.pathS).toBeUndefined();
    });
});
