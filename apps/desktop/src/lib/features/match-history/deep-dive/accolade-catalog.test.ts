import { beforeEach, describe, expect, it, vi } from "vitest";
import { command } from "$lib/core/tauri";
import { resolveAccoladeInfo } from "./accolade-catalog";

vi.mock("$lib/core/tauri", () => ({ command: vi.fn() }));

const invoke = vi.mocked(command);

describe("resolveAccoladeInfo", () => {
    beforeEach(() => {
        invoke.mockReset();
    });

    it("returns name, description and stat for the ids asked for", async () => {
        invoke.mockResolvedValue([
            { id: 24, name: "The Zapper", description: "{stat_value} ability damage", trackedStat: "ability_damage" },
            { id: 1, name: "Killer Instinct", description: null, trackedStat: "kills" },
        ]);
        const out = await resolveAccoladeInfo([24, 77], "en");
        expect(out.size).toBe(1);
        expect(out.get(24)).toEqual({
            name: "The Zapper",
            description: "{stat_value} ability damage",
            trackedStat: "ability_damage",
        });
        expect(invoke).toHaveBeenCalledWith("game_accolades", { locale: "en" });
    });

    it("is empty without asking the game when there are no ids", async () => {
        expect((await resolveAccoladeInfo([], "en")).size).toBe(0);
        expect(invoke).not.toHaveBeenCalled();
    });

    it("is empty when the game is not available", async () => {
        invoke.mockRejectedValue(new Error("no game"));
        expect((await resolveAccoladeInfo([1], "en")).size).toBe(0);
    });
});

describe("resolveAccoladeInfo with bad game_accolades answers", () => {
    beforeEach(() => {
        invoke.mockReset();
    });

    for (const bad of [null, "nope", {}, [null], [{ id: "24", name: 5 }]]) {
        it(`is empty when game_accolades answers ${JSON.stringify(bad)}`, async () => {
            invoke.mockResolvedValue(bad);
            expect((await resolveAccoladeInfo([24], "en")).size).toBe(0);
        });
    }

    it("keeps the well-formed entries next to a malformed one", async () => {
        invoke.mockResolvedValue([null, { id: 24, name: "The Zapper", description: null, trackedStat: null }]);
        expect((await resolveAccoladeInfo([24], "en")).get(24)?.name).toBe("The Zapper");
    });
});
