import { describe, expect, it } from "vitest";
import { parseApiDetail } from "@deadlock-plus/match/api-detail";
import { allPlayers, type MatchDetail, type MatchTeam } from "@deadlock-plus/match/detail";
import fixture from "@deadlock-plus/match/fixtures/api-ranked.json";
import {
    deathScopeItems,
    groupTeam,
    parseDeathScope,
    playerMenuItems,
    roleItems,
    speedOptions,
    type PlayerMenuText,
} from "./player-menu";

function detail(): MatchDetail {
    const d = parseApiDetail(fixture);
    if (!d) throw new Error("fixture did not parse");
    return d;
}

const text: PlayerMenuText = {
    teamName: (team: MatchTeam) => (team === "hidden-king" ? "The Hidden King" : "The Archmother"),
    fallbackName: (slot) => `Player ${slot}`,
    heroName: (heroId) => `Hero ${heroId}`,
    you: "You",
};

describe("playerMenuItems", () => {
    it("lists every player once, in match order, keyed by slot", () => {
        const d = detail();
        const items = playerMenuItems(d, null, text);
        expect(items.map((i) => i.value)).toEqual(allPlayers(d).map((p) => String(p.slot)));
        expect(items.map((i) => i.slot)).toEqual(allPlayers(d).map((p) => p.slot));
        expect(new Set(items.map((i) => i.value)).size).toBe(items.length);
    });

    it("groups players under their team name, Hidden King first", () => {
        const d = detail();
        const items = playerMenuItems(d, null, text);
        expect([...new Set(items.map((i) => i.group))]).toEqual(["The Hidden King", "The Archmother"]);
        for (const item of items) {
            const player = allPlayers(d).find((p) => p.slot === item.slot)!;
            expect(item.group).toBe(text.teamName(player.team));
            expect(item.team).toBe(player.team);
            expect(item.heroId).toBe(player.heroId);
        }
    });

    it("labels a player by name with the hero as meta", () => {
        const d = detail();
        const first = allPlayers(d)[0];
        first.name = "Lash Main";
        const item = playerMenuItems(d, null, text)[0];
        expect(item.label).toBe("Lash Main");
        expect(item.meta).toBe(`Hero ${first.heroId}`);
    });

    it("falls back to the slot for a nameless player", () => {
        const d = detail();
        const first = allPlayers(d)[0];
        first.name = undefined;
        expect(playerMenuItems(d, null, text)[0].label).toBe(`Player ${first.slot}`);
    });

    it("marks the own player and nobody else", () => {
        const d = detail();
        const own = allPlayers(d)[3];
        const items = playerMenuItems(d, own.slot, text);
        expect(items.filter((i) => i.own).map((i) => i.slot)).toEqual([own.slot]);
        expect(items[3].meta).toBe(`Hero ${own.heroId} · You`);
        expect(items[0].meta).toBe(`Hero ${allPlayers(d)[0].heroId}`);
    });

    it("leaves the hero out of meta when its name is unknown", () => {
        const d = detail();
        const own = allPlayers(d)[0];
        const items = playerMenuItems(d, own.slot, { ...text, heroName: () => undefined });
        expect(items[0].meta).toBe("You");
        expect(items[1].meta).toBeUndefined();
    });
});

describe("deathScopeItems", () => {
    const scopeText = { ...text, mine: "My deaths", all: "All players" };

    it("puts the ungrouped choices before the players", () => {
        const d = detail();
        const own = allPlayers(d)[0];
        const items = deathScopeItems(d, own.slot, scopeText);
        expect(items.slice(0, 2).map((i) => [i.value, i.label, i.kind, i.group])).toEqual([
            ["mine", "My deaths", "mine", undefined],
            ["all", "All players", "all", undefined],
        ]);
        expect(items.slice(2).map((i) => i.value)).toEqual(allPlayers(d).map((p) => String(p.slot)));
        expect(items.slice(2).every((i) => i.kind === "player")).toBe(true);
    });

    it("has no own choice when the viewer is not in the match", () => {
        const items = deathScopeItems(detail(), null, scopeText);
        expect(items[0].value).toBe("all");
        expect(items.some((i) => i.value === "mine")).toBe(false);
    });
});

describe("groupTeam", () => {
    const scopeText = { ...text, mine: "My deaths", all: "All players" };

    it("maps each team heading back to its team", () => {
        const items = deathScopeItems(detail(), null, scopeText);
        expect(groupTeam(items, "The Hidden King")).toBe("hidden-king");
        expect(groupTeam(items, "The Archmother")).toBe("archmother");
    });

    it("follows the items, not the wording of the heading", () => {
        const items = playerMenuItems(detail(), null, { ...text, teamName: (team) => `<${team}>` });
        expect(groupTeam(items, "<archmother>")).toBe("archmother");
    });

    it("has no team for a heading no player sits under", () => {
        const items = deathScopeItems(detail(), null, scopeText);
        expect(groupTeam(items, "Spectators")).toBeUndefined();
        expect(
            groupTeam([{ kind: "all", value: "all", label: "All", group: "The Hidden King" }], "The Hidden King"),
        ).toBeUndefined();
    });
});

describe("parseDeathScope", () => {
    it("keeps the named scopes and reads a slot as a number", () => {
        expect(parseDeathScope("mine")).toBe("mine");
        expect(parseDeathScope("all")).toBe("all");
        expect(parseDeathScope("7")).toBe(7);
    });

    it("round-trips every scope item", () => {
        const d = detail();
        const items = deathScopeItems(d, allPlayers(d)[0].slot, { ...text, mine: "m", all: "a" });
        for (const item of items) expect(String(parseDeathScope(item.value))).toBe(item.value);
    });
});

describe("roleItems", () => {
    it("offers victim then killer", () => {
        expect(roleItems({ victim: "Deaths", killer: "Kills" })).toEqual([
            { value: "victim", label: "Deaths" },
            { value: "killer", label: "Kills" },
        ]);
    });
});

describe("speedOptions", () => {
    it("has one string-valued option per speed and reads it back", () => {
        const { options, parse } = speedOptions((speed) => `${speed}x`);
        expect(options).toEqual([
            { value: "1", label: "1x" },
            { value: "2", label: "2x" },
            { value: "4", label: "4x" },
        ]);
        expect(options.map((o) => parse(o.value))).toEqual([1, 2, 4]);
    });

    it("falls back to normal speed for an unknown value", () => {
        expect(speedOptions(String).parse("3")).toBe(1);
    });
});
