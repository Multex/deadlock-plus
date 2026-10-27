import { beforeEach, describe, expect, it, vi } from "vitest";
import { command } from "$lib/core/tauri";
import { resolveItemListVisuals, resolveVisuals } from "./catalog";

vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(),
    fileSrc: (path: string) => `asset://${path}`,
}));

const invoke = vi.mocked(command);

const RAT_SWARM = 3681399397;
const BREW_THROW = 1169498311;
const CLIP_SIZE = 1548066885;

function answer(table: Record<string, unknown>) {
    invoke.mockImplementation(async (name) => {
        if (!(name in table)) throw new Error(`unexpected ${name}`);
        return table[name] as never;
    });
}

const entries = [
    { id: RAT_SWARM, className: "ability_ratking_ratnibble", name: "Rat Swarm", localised: true, kind: "ability" },
    {
        id: BREW_THROW,
        className: "ability_baba_hexing_brew_throw",
        name: "ability_baba_hexing_brew_throw",
        localised: false,
        kind: "ability",
    },
    { id: CLIP_SIZE, className: "upgrade_clip_size", name: "Basic Magazine", localised: true, kind: "upgrade" },
];

beforeEach(() => {
    invoke.mockReset();
});

describe("resolveVisuals", () => {
    it("names and draws the ability of a hero released after the snapshot", async () => {
        answer({
            game_items: entries,
            game_ability_art: [{ className: "ability_ratking_ratnibble", path: "C:/a/rat.png" }],
        });
        const out = await resolveVisuals([RAT_SWARM], "en", "ability");
        expect(invoke).toHaveBeenCalledWith("game_ability_art", { names: ["ability_ratking_ratnibble"] });
        expect(out.get(RAT_SWARM)).toEqual({ name: "Rat Swarm", src: "asset://C:/a/rat.png", kind: "ability" });
    });

    it("asks for shop art, not the legacy icon, for items", async () => {
        answer({ game_items: entries, game_item_art: [] });
        await resolveVisuals([CLIP_SIZE], "en", "item");
        expect(invoke).toHaveBeenCalledWith("game_item_art", { names: ["upgrade_clip_size"], kind: "shop" });
    });

    it("words an entry the game has no display name for instead of showing its class name", async () => {
        answer({ game_items: entries, game_ability_art: [] });
        const out = await resolveVisuals([BREW_THROW], "en", "ability");
        expect(out.get(BREW_THROW)?.name).toBe("Baba Hexing Brew Throw");
    });

    it("leaves ids the game does not list out of the result", async () => {
        answer({ game_items: entries, game_ability_art: [] });
        const out = await resolveVisuals([42], "en", "ability");
        expect(out.size).toBe(0);
    });
});

describe("resolveItemListVisuals", () => {
    it("draws abilities among a player's items with ability art and items with shop art", async () => {
        answer({
            game_items: entries,
            game_ability_art: [{ className: "ability_ratking_ratnibble", path: "C:/a/rat.png" }],
            game_item_art: [{ className: "upgrade_clip_size", path: "C:/i/clip.png" }],
        });
        const out = await resolveItemListVisuals([RAT_SWARM, CLIP_SIZE], "en");
        expect(out.get(RAT_SWARM)).toEqual({ name: "Rat Swarm", src: "asset://C:/a/rat.png", kind: "ability" });
        expect(out.get(CLIP_SIZE)).toEqual({ name: "Basic Magazine", src: "asset://C:/i/clip.png", kind: "item" });
    });

    it("keeps the name of an entry that has no art at all", async () => {
        answer({ game_items: entries, game_ability_art: [], game_item_art: [] });
        const out = await resolveItemListVisuals([BREW_THROW], "en");
        expect(out.get(BREW_THROW)).toEqual({ name: "Baba Hexing Brew Throw", src: undefined, kind: "ability" });
    });
});

describe("resolveItemListVisuals with bad game_items answers", () => {
    for (const bad of [null, "nope", {}, [null], [{ id: "1", className: 3 }]]) {
        it(`resolves nothing when game_items answers ${JSON.stringify(bad)}`, async () => {
            answer({ game_items: bad, game_ability_art: [], game_item_art: [] });
            expect((await resolveItemListVisuals([RAT_SWARM], "en")).size).toBe(0);
        });
    }

    it("keeps the well-formed entries next to a malformed one", async () => {
        answer({ game_items: [null, ...entries], game_ability_art: [], game_item_art: [] });
        const out = await resolveItemListVisuals([CLIP_SIZE], "en");
        expect(out.get(CLIP_SIZE)?.name).toBe("Basic Magazine");
    });
});

describe("visual kind", () => {
    // Ids and kinds as the installed game reports them for real matches.
    const real = [
        { id: 3681399397, className: "ability_ratking_ratnibble", kind: "ability" },
        { id: 1627989937, className: "ability_ratking_standard_bearer", kind: "ability" },
        { id: 2003165630, className: "ability_baba_hexing_brew", kind: "ability" },
        { id: 1389230689, className: "ability_chessmaster_queen", kind: "ability" },
        { id: 3284310919, className: "ability_chessmaster_movechesspiece", kind: "weapon" },
        { id: 1928108461, className: "citadel_ability_hook", kind: "ability" },
        { id: 1998374645, className: "upgrade_magic_burst", kind: "upgrade" },
        { id: CLIP_SIZE, className: "upgrade_clip_size", kind: "weapon" },
        { id: 10546756, className: "weapon_upgrade_t1", kind: "weapon" },
    ].map((e) => ({ ...e, name: e.className, localised: false }));

    it("tells abilities of new and old heroes from shop items", async () => {
        answer({ game_items: real, game_ability_art: [], game_item_art: [] });
        const out = await resolveItemListVisuals(
            real.map((e) => e.id),
            "en",
        );
        const kinds = Object.fromEntries(real.map((e) => [e.className, out.get(e.id)?.kind]));
        expect(kinds).toEqual({
            ability_ratking_ratnibble: "ability",
            ability_ratking_standard_bearer: "ability",
            ability_baba_hexing_brew: "ability",
            ability_chessmaster_queen: "ability",
            ability_chessmaster_movechesspiece: "ability",
            citadel_ability_hook: "ability",
            upgrade_magic_burst: "item",
            upgrade_clip_size: "item",
            weapon_upgrade_t1: "unknown",
        });
    });

    it("keeps ability art for an ability the game files as a weapon", async () => {
        answer({
            game_items: real,
            game_ability_art: [{ className: "ability_chessmaster_movechesspiece", path: "C:/a/move.png" }],
            game_item_art: [],
        });
        const out = await resolveItemListVisuals([3284310919], "en");
        expect(out.get(3284310919)).toMatchObject({ kind: "ability", src: "asset://C:/a/move.png" });
    });
});
