import { describe, expect, it } from "vitest";
import { parseApiDetail } from "./api-detail";
import { allPlayers, playerBySlot } from "./detail";
import fixture from "./fixtures/api-ranked.json";

type Json = Record<string, any>;

function raw(edit?: (info: Json, root: Json) => void): Json {
    const root = structuredClone(fixture) as Json;
    edit?.(root.match_info, root);
    return root;
}

function parsed(edit?: (info: Json, root: Json) => void) {
    const detail = parseApiDetail(raw(edit));
    if (!detail) throw new Error("fixture did not parse");
    return detail;
}

const source = (slot: number) => fixture.match_info.players.find((p) => p.player_slot === slot)!;

describe("header", () => {
    it("maps identity, mode, duration and date", () => {
        const d = parsed();
        expect(d.source).toBe("api");
        expect(d.matchId).toBe(113906168);
        expect(d.startTime).toBe(1791622051);
        expect(d.durationS).toBe(1570);
        expect(d.matchMode).toBe(4);
        expect(d.gameMode).toBe(1);
        expect(d.notScored).toBe(false);
    });

    it("maps the winning team to an id, not a display string", () => {
        expect(parsed().winningTeam).toBe("archmother");
        expect(parsed((i) => (i.winning_team = 0)).winningTeam).toBe("hidden-king");
    });

    it("carries bans", () => {
        expect(parsed().bans).toEqual([15, 60, 18]);
    });

    it("leaves the team average badge unset when the API reports zero", () => {
        expect(parsed().teams.map((t) => t.averageBadge)).toEqual([undefined, undefined]);
        const withBadge = parsed((i) => {
            i.average_badge_team0 = 64;
            i.average_badge_team1 = 70;
        });
        expect(withBadge.teams.map((t) => t.averageBadge)).toEqual([64, 70]);
    });

    it("sums team kills into the team score", () => {
        const d = parsed();
        expect(d.teams[0].score).toBe(6 + 0);
        expect(d.teams[1].score).toBe(3 + 6);
    });
});

describe("team assignment", () => {
    it("places team 0 under hidden-king and team 1 under archmother", () => {
        const d = parsed();
        expect(d.teams.map((t) => t.team)).toEqual(["hidden-king", "archmother"]);
        expect(d.teams[0].players.map((p) => p.slot)).toEqual([2, 4]);
        expect(d.teams[1].players.map((p) => p.slot)).toEqual([8, 11]);
        expect(allPlayers(d).every((p) => p.team === (p.slot < 7 ? "hidden-king" : "archmother"))).toBe(true);
    });

    it("derives each player outcome from the winning team", () => {
        const d = parsed();
        expect(playerBySlot(d, 2)?.outcome).toBe("loss");
        expect(playerBySlot(d, 8)?.outcome).toBe("win");
    });

    it("marks every player unscored when the match was not scored", () => {
        const d = parsed((i) => (i.not_scored = true));
        expect(d.notScored).toBe(true);
        expect(allPlayers(d).every((p) => p.outcome === "unscored")).toBe(true);
    });

    it("skips players with an unknown team", () => {
        const d = parsed((i) => (i.players[0].team = 7));
        expect(allPlayers(d)).toHaveLength(3);
    });
});

describe("players", () => {
    it("maps the scoreboard columns", () => {
        const p = playerBySlot(parsed(), 2)!;
        expect(p.accountId).toBe(source(2).account_id);
        expect(p.name).toBeUndefined();
        expect(p).toMatchObject({
            heroId: 16,
            level: 29,
            kills: 6,
            deaths: 8,
            assists: 10,
            souls: 29528,
            lastHits: 114,
            denies: 0,
            playerDamage: 22588,
            healing: 7938,
        });
    });

    it("maps the rank badge and progress", () => {
        const p = playerBySlot(parsed(), 2)!;
        expect(p.rank).toMatchObject({
            displayRank: 105,
            progressBefore: 67000,
            progressAfter: 67000,
            progressChange: -300,
            demotionProtectionGamesLeft: 2,
            consumedDemotionProtection: true,
            winStreak: 0,
        });
    });

    it("maps accolades and abilities", () => {
        const p = playerBySlot(parsed(), 2)!;
        const s = source(2);
        expect(p.accolades).toHaveLength(s.accolades.length);
        expect(p.accolades[0]).toEqual({
            accoladeId: s.accolades[0].accolade_id,
            value: s.accolades[0].accolade_stat_value,
            tier: s.accolades[0].accolade_threshold_achieved,
        });
        expect(p.abilities).toHaveLength(s.ability_stats.length);
        expect(p.abilities[0]).toEqual({
            abilityId: s.ability_stats[0].ability_id,
            value: s.ability_stats[0].ability_value,
        });
    });
});

describe("items", () => {
    it("keeps purchase and sell times", () => {
        const sold = playerBySlot(parsed(), 2)!.items.find((i) => i.itemId === 1437614329)!;
        expect(sold.boughtS).toBe(51);
        expect(sold.soldS).toBe(1443);
        expect(sold.upgradeId).toBe(1);
    });

    it("leaves soldS unset for items held to the end", () => {
        const held = playerBySlot(parsed(), 2)!.items.find((i) => i.itemId === 4131517918)!;
        expect(held.soldS).toBeUndefined();
    });

    it("keeps the upgrade bits of each row", () => {
        const rows = playerBySlot(parsed(), 2)!.items.filter((i) => i.itemId === 1426567660);
        expect(rows.map((i) => i.upgradeBits)).toEqual([1, 3]);
    });

    it("leaves the upgrade bits unset when the row has none", () => {
        const d = parsed((i) => {
            delete i.players[0].items[0].upgrade_info;
            i.players[0].items[1].upgrade_info = 0;
        });
        const slot = fixture.match_info.players[0].player_slot;
        const ids = fixture.match_info.players[0].items.slice(0, 2).map((r) => r.item_id);
        const items = playerBySlot(d, slot)!.items;
        for (const id of ids) {
            expect(items.find((i) => i.itemId === id)!.upgradeBits).toBeUndefined();
        }
    });

    it("orders items by purchase time", () => {
        for (const p of allPlayers(parsed((i) => i.players[0].items.reverse()))) {
            const times = p.items.map((i) => i.boughtS);
            expect(times).toEqual([...times].sort((a, b) => a - b));
        }
    });
});

describe("deep dive", () => {
    it("maps the over-time series", () => {
        const p = playerBySlot(parsed(), 2)!;
        expect(p.series).toHaveLength(3);
        const last = p.series.at(-1)!;
        expect(last.souls).toBe(29528);
        expect(last.playerDamage).toBe(22588);
        const times = p.series.map((s) => s.timeS);
        expect(times).toEqual([...times].sort((a, b) => a - b));
    });

    it("maps deaths with killer and position", () => {
        const p = playerBySlot(parsed(), 2)!;
        const src = source(2).death_details[0];
        expect(p.deathLog).toHaveLength(2);
        expect(p.deathLog[0]).toMatchObject({
            timeS: src.game_time_s,
            killerSlot: src.killer_player_slot,
            position: src.death_pos,
            killerPosition: src.killer_pos,
            respawnS: src.death_duration_s,
        });
    });

    it("maps objectives, treating a zero destroy time as not destroyed", () => {
        const d = parsed((i) => (i.objectives[0].destroyed_time_s = 0));
        expect(d.objectives).toHaveLength(6);
        expect(d.objectives[0].destroyedS).toBeUndefined();
        expect(d.objectives[1]).toMatchObject({ objectiveId: 4, team: "hidden-king", destroyedS: 736 });
    });

    it("maps the mid boss", () => {
        expect(parsed().midBoss).toEqual([{ killedBy: "archmother", claimedBy: "archmother", destroyedS: 1210 }]);
    });

    it("flattens the damage matrix with cumulative series per source", () => {
        const dm = parsed().damageMatrix;
        expect(dm.sampleTimesS).toEqual([180, 360, 540, 720]);
        expect(dm.sources).toHaveLength(3);
        expect(dm.sources[0]).toEqual({ name: expect.any(String), statType: expect.any(Number) });
        const dealer = fixture.match_info.damage_matrix.damage_dealers[0];
        const first = dealer.damage_sources[0].damage_to_players[0];
        const entry = dm.entries.find(
            (e) =>
                e.dealerSlot === dealer.dealer_player_slot &&
                e.targetSlot === first.target_player_slot &&
                e.sourceIndex === dealer.damage_sources[0].source_details_index,
        )!;
        expect(entry.cumulative).toEqual(first.damage);
    });
});

describe("tolerance", () => {
    it("returns null for input that is not a match", () => {
        expect(parseApiDetail(null)).toBeNull();
        expect(parseApiDetail("nope")).toBeNull();
        expect(parseApiDetail({})).toBeNull();
        expect(parseApiDetail({ match_info: { match_id: 1 } })).toBeNull();
    });

    it("accepts the match info without its wrapper", () => {
        expect(parseApiDetail(raw().match_info)?.matchId).toBe(113906168);
    });

    it("survives missing death details", () => {
        const d = parsed((i) => i.players.forEach((p: Json) => delete p.death_details));
        expect(allPlayers(d).every((p) => p.deathLog.length === 0)).toBe(true);
    });

    it("survives missing rank data", () => {
        const d = parsed((i) =>
            i.players.forEach((p: Json, n: number) =>
                n % 2 ? delete p.player_rank_data : (p.player_rank_data = null),
            ),
        );
        expect(allPlayers(d).every((p) => p.rank === undefined)).toBe(true);
    });

    it("survives missing stats, items, damage matrix, objectives and bans", () => {
        const d = parsed((i, root) => {
            i.players.forEach((p: Json) => {
                delete p.stats;
                delete p.items;
                delete p.ability_stats;
                delete p.accolades;
            });
            delete i.damage_matrix;
            delete i.objectives;
            delete i.mid_boss;
            delete root.banned_hero_ids;
        });
        const p = playerBySlot(d, 2)!;
        expect(p.series).toEqual([]);
        expect(p.items).toEqual([]);
        expect(p.abilities).toEqual([]);
        expect(p.accolades).toEqual([]);
        expect(p.playerDamage).toBe(0);
        expect(p.healing).toBe(0);
        expect(d.damageMatrix).toEqual({ sampleTimesS: [], sources: [], entries: [] });
        expect(d.objectives).toEqual([]);
        expect(d.midBoss).toEqual([]);
        expect(d.bans).toEqual([]);
    });

    it("treats null numeric fields as zero", () => {
        const d = parsed((i) => (i.objectives[0].player_damage = null));
        expect(d.objectives[0].playerDamage).toBe(0);
    });
});

describe("provisional source", () => {
    it("matches the api parse apart from the source label", () => {
        const api = parseApiDetail(raw());
        const provisional = parseApiDetail(raw(), { source: "provisional" });
        expect(provisional?.source).toBe("provisional");
        expect({ ...provisional, source: "api" }).toEqual(api);
    });

    it("defaults to the api source", () => {
        expect(parseApiDetail(raw(), {})?.source).toBe("api");
    });

    it("keeps a player whose team is an explicit 0", () => {
        const d = parseApiDetail(
            raw((i) => {
                i.players[0].team = 0;
            }),
            { source: "provisional" },
        );
        expect(d?.teams[0].players.map((p) => p.slot)).toContain(fixture.match_info.players[0].player_slot);
    });
});
