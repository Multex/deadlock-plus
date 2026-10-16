import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HeroArt } from "@deadlock-plus/ipc-types/HeroArt";
import type { HeroEntry } from "@deadlock-plus/ipc-types/HeroEntry";
import { mergeHeroes, needsRefresh, parseHeroCache, slimHeroes, type Hero } from "./heroes";

const command = vi.fn();
const events = new Map<string, () => void>();
vi.mock("$lib/core/tauri", () => ({
    command: (...args: unknown[]) => command(...args),
    fileSrc: (path: string) => `asset://${path}`,
    listen: async (event: string, handler: () => void) => {
        events.set(event, handler);
        return () => events.delete(event);
    },
}));

function entry(over: Partial<HeroEntry> & { id: number }): HeroEntry {
    return {
        className: `hero_${over.id}`,
        name: `Hero ${over.id}`,
        localised: true,
        selectable: true,
        inDevelopment: false,
        disabled: false,
        preRelease: false,
        portrait: null,
        card: null,
        ...over,
    };
}

function apiHero(over: Partial<Hero> & { id: number }): Hero {
    return { name: `Api ${over.id}`, icon: null, portrait: null, artIcon: null, hideoutLine: null, ...over };
}

describe("mergeHeroes local art", () => {
    const art = (over: Partial<HeroArt> & { id: number }): HeroArt => ({ sm: null, card: null, mm: null, ...over });

    it("prefers local files over the API URLs", () => {
        const out = mergeHeroes(
            [entry({ id: 1 })],
            { 1: apiHero({ id: 1, icon: "i.webp", artIcon: "a-sm", portrait: "a-card" }) },
            [art({ id: 1, sm: "C:/c/1_sm.png", card: "C:/c/1_card.png" })],
        );
        expect(out[1]).toMatchObject({
            artIcon: "asset://C:/c/1_sm.png",
            portrait: "asset://C:/c/1_card.png",
            icon: "asset://C:/c/1_sm.png",
        });
    });

    it("falls back to the API URL per file when a local file is missing", () => {
        const out = mergeHeroes([entry({ id: 1 })], { 1: apiHero({ id: 1, artIcon: "a-sm", portrait: "a-card" }) }, [
            art({ id: 1, card: "C:/c/1_card.png" }),
        ]);
        expect(out[1]).toMatchObject({ artIcon: "a-sm", portrait: "asset://C:/c/1_card.png" });
    });

    it("keeps the API URLs separately for Discord", () => {
        const out = mergeHeroes([entry({ id: 1 })], { 1: apiHero({ id: 1, artIcon: "a-sm", portrait: "a-card" }) }, [
            art({ id: 1, sm: "C:/c/1_sm.png", card: "C:/c/1_card.png" }),
        ]);
        expect(out[1]).toMatchObject({ apiArtIcon: "a-sm", apiPortrait: "a-card" });
    });

    it("ignores art for heroes that are not in the result", () => {
        const out = mergeHeroes([entry({ id: 1 })], {}, [art({ id: 5, sm: "x" })]);
        expect(out[5]).toBeUndefined();
    });
});

describe("mergeHeroes", () => {
    it("takes names and roster from the game and art extras from the API by id", () => {
        const out = mergeHeroes([entry({ id: 2, name: "Sieben" }), entry({ id: 88, name: "Baba" })], {
            2: apiHero({ id: 2, icon: "i.webp", hideoutLine: "Plotting" }),
        });
        expect(out[2].name).toBe("Sieben");
        expect(out[2].icon).toBe("i.webp");
        expect(out[2].hideoutLine).toBe("Plotting");
        expect(out[88]).toMatchObject({ name: "Baba", icon: null, hideoutLine: null });
    });

    it("prefers art from the game command and falls back to the API's", () => {
        const out = mergeHeroes([entry({ id: 1, portrait: "g-sm", card: "g-card" }), entry({ id: 2 })], {
            1: apiHero({ id: 1, artIcon: "a-sm", portrait: "a-card" }),
            2: apiHero({ id: 2, artIcon: "a-sm2", portrait: "a-card2" }),
        });
        expect(out[1]).toMatchObject({ artIcon: "g-sm", portrait: "g-card" });
        expect(out[2]).toMatchObject({ artIcon: "a-sm2", portrait: "a-card2" });
    });

    it("uses the game's small art as the icon when the API has none", () => {
        const out = mergeHeroes([entry({ id: 88, portrait: "g-sm" })], {});
        expect(out[88].icon).toBe("g-sm");
    });

    it("keeps heroes only the API knows so no id goes blank", () => {
        const out = mergeHeroes([entry({ id: 2 })], { 9: apiHero({ id: 9, name: "Old" }) });
        expect(out[9].name).toBe("Old");
    });

    it("drops game heroes with no localisation unless the API knows them", () => {
        const out = mergeHeroes([entry({ id: 1, localised: false }), entry({ id: 2, localised: false })], {
            2: apiHero({ id: 2 }),
        });
        expect(out[1]).toBeUndefined();
        expect(out[2]).toBeDefined();
    });

    it("carries the game's selectable flag", () => {
        const out = mergeHeroes([entry({ id: 3, selectable: false })], {});
        expect(out[3].selectable).toBe(false);
    });
});

describe("loadHeroes", () => {
    const store = new Map<string, string>();
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.resetModules();
        store.clear();
        command.mockReset();
        fetchMock.mockReset();
        vi.stubGlobal("localStorage", {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
        });
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => vi.unstubAllGlobals());

    async function modules() {
        const { i18n } = await import("$lib/core/i18n.svelte");
        i18n.reset({ en: {} }, "de");
        const heroes = await import("./heroes");
        const { gameArt } = await import("$lib/features/gamedata/art-refresh");
        return { i18n, gameArt, ...heroes };
    }

    function apiResponse() {
        return { ok: true, json: async () => [{ id: 2, name: "Seven", hideout_rich_presence: "Plotting" }] };
    }

    it("asks the game for names in the app's locale", async () => {
        command.mockResolvedValue([entry({ id: 2, name: "Sieben" })]);
        fetchMock.mockResolvedValue(apiResponse());
        const { loadHeroes } = await modules();
        const out = await loadHeroes();
        expect(command).toHaveBeenCalledWith("game_heroes", { locale: "de" });
        expect(out[2].name).toBe("Sieben");
    });

    it("answers from the game without waiting for the API", async () => {
        command.mockResolvedValue([entry({ id: 2, name: "Sieben" })]);
        fetchMock.mockReturnValue(new Promise(() => {}));
        const { loadHeroes } = await modules();
        expect((await loadHeroes())[2].name).toBe("Sieben");
    });

    it("merges the API's hideout line in the background and tells listeners", async () => {
        command.mockResolvedValue([entry({ id: 2, name: "Sieben" })]);
        fetchMock.mockResolvedValue(apiResponse());
        const { loadHeroes, onHeroesRefreshed } = await modules();
        const seen: Record<number, Hero>[] = [];
        onHeroesRefreshed((h) => seen.push(h));
        await loadHeroes();
        await vi.waitFor(() => expect(seen).toHaveLength(1));
        expect(seen[0][2]).toMatchObject({ name: "Sieben", hideoutLine: "Plotting" });
    });

    it("falls back to the API roster when the game command fails", async () => {
        command.mockRejectedValue(new Error("boom"));
        fetchMock.mockResolvedValue(apiResponse());
        const { loadHeroes } = await modules();
        expect((await loadHeroes())[2].name).toBe("Seven");
    });

    it("falls back to the API roster when the game returns nothing", async () => {
        command.mockResolvedValue([]);
        fetchMock.mockResolvedValue(apiResponse());
        const { loadHeroes } = await modules();
        expect((await loadHeroes())[2].name).toBe("Seven");
    });

    it("returns stale cached API heroes when the game command and the network both fail", async () => {
        const cached = { at: 0, heroes: { 2: apiHero({ id: 2, name: "Cached" }) } };
        store.set("deadlock-plus:heroes", JSON.stringify(cached));
        command.mockRejectedValue(new Error("boom"));
        fetchMock.mockRejectedValue(new Error("offline"));
        const { loadHeroes } = await modules();
        expect((await loadHeroes())[2].name).toBe("Cached");
    });

    it("reloads names and notifies when the locale changes", async () => {
        command.mockImplementation(async (_: string, args: { locale: string }) => [
            entry({ id: 2, name: args.locale === "fr" ? "Sept" : "Sieben" }),
        ]);
        fetchMock.mockResolvedValue(apiResponse());
        const { i18n, loadHeroes, onHeroesRefreshed } = await modules();
        await loadHeroes();
        const seen: Record<number, Hero>[] = [];
        onHeroesRefreshed((h) => seen.push(h));
        i18n.setLocale("fr");
        await vi.waitFor(() => expect(seen.at(-1)?.[2].name).toBe("Sept"));
    });

    it("reuses the loaded heroes while every wanted id is known", async () => {
        command.mockResolvedValue([entry({ id: 2 })]);
        fetchMock.mockResolvedValue(apiResponse());
        const { loadHeroes } = await modules();
        const a = await loadHeroes();
        const b = await loadHeroes([2]);
        expect(b).toBe(a);
        expect(command).toHaveBeenCalledTimes(2);
    });

    function route(art: unknown) {
        command.mockImplementation((name: string) =>
            name === "game_hero_art" ? art : Promise.resolve([entry({ id: 2, name: "Sieben" })]),
        );
    }

    it("layers local art over the API without persisting local paths", async () => {
        route(Promise.resolve([{ id: 2, sm: "C:/c/2_sm.png", card: null }]));
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => [
                { id: 2, name: "Seven", images: { icon_image_small: "a-sm", icon_hero_card: "a-card" } },
            ],
        });
        const { loadHeroes } = await modules();
        const out = await loadHeroes();
        expect(out[2]).toMatchObject({ artIcon: "asset://C:/c/2_sm.png", apiArtIcon: null });
        await vi.waitFor(() => expect(store.get("deadlock-plus:heroes")).toBeDefined());
        const cached = store.get("deadlock-plus:heroes")!;
        expect(cached).not.toContain("2_sm.png");
        expect(cached).not.toContain("asset://");
    });

    it("reloads local art from the new build folder when the game art changes", async () => {
        let folder = "old";
        const seen: (string | null)[] = [];
        let shownAtRelease: string | null | undefined;
        command.mockImplementation(async (name: string) => {
            if (name === "game_hero_art")
                return [{ id: 2, sm: `C:/game-art/${folder}/2_sm.png`, card: null, mm: null }];
            if (name === "release_old_game_art") return void (shownAtRelease = seen.at(-1));
            return [entry({ id: 2, name: "Sieben" })];
        });
        fetchMock.mockResolvedValue(apiResponse());
        const { loadHeroes, onHeroesRefreshed, gameArt } = await modules();
        expect((await loadHeroes())[2].icon).toBe("asset://C:/game-art/old/2_sm.png");
        await vi.waitFor(() => expect(store.get("deadlock-plus:heroes")).toBeDefined());
        onHeroesRefreshed((h) => seen.push(h[2].icon));
        const stop = gameArt.start();
        await vi.waitFor(() => expect(events.has("game-art-changed")).toBe(true));

        folder = "new";
        events.get("game-art-changed")!();
        await vi.waitFor(() => expect(command).toHaveBeenCalledWith("release_old_game_art"));
        expect(shownAtRelease).toBe("asset://C:/game-art/new/2_sm.png");
        expect((await loadHeroes())[2].icon).toBe("asset://C:/game-art/new/2_sm.png");
        stop();
    });

    it("still loads heroes when the art command fails", async () => {
        route(Promise.reject(new Error("boom")));
        fetchMock.mockResolvedValue(apiResponse());
        const { loadHeroes } = await modules();
        expect((await loadHeroes())[2].name).toBe("Sieben");
    });
});

describe("needsRefresh", () => {
    const minute = 60 * 1000;
    const known = { 2: { id: 2, name: "Seven", icon: null, portrait: null, artIcon: null, hideoutLine: null } };

    it("reloads when a wanted hero is missing from the loaded heroes", () => {
        expect(needsRefresh(known, [2, 88], null, 5000)).toBe(true);
    });

    it("leaves the heroes alone when every wanted hero is present", () => {
        expect(needsRefresh(known, [2], null, 5000)).toBe(false);
        expect(needsRefresh(known, [], null, 5000)).toBe(false);
    });

    it("waits a minute after the last attempt before trying again", () => {
        expect(needsRefresh(known, [88], 1000, 1000 + minute - 1)).toBe(false);
        expect(needsRefresh(known, [88], 1000, 1000 + minute)).toBe(true);
    });
});

describe("slimHeroes", () => {
    it("keeps id, name, the small webp icon and the png art for Discord", () => {
        const out = slimHeroes([
            {
                id: 65,
                name: "Venator",
                images: { icon_image_small_webp: "u.webp", icon_hero_card: "card.png", icon_image_small: "sm.png" },
                hideout_rich_presence: "Plotting in the Hideout",
            },
            { id: 2, name: "Seven" },
        ]);
        expect(out[65]).toEqual({
            id: 65,
            name: "Venator",
            icon: "u.webp",
            portrait: "card.png",
            artIcon: "sm.png",
            hideoutLine: "Plotting in the Hideout",
        });
        expect(out[2]).toEqual({
            id: 2,
            name: "Seven",
            icon: null,
            portrait: null,
            artIcon: null,
            hideoutLine: null,
        });
    });
});

describe("parseHeroCache", () => {
    const raw = JSON.stringify({
        at: 1000,
        heroes: { 2: { id: 2, name: "Seven", icon: null, portrait: null, artIcon: null, hideoutLine: null } },
    });
    const week = 7 * 24 * 60 * 60 * 1000;

    it("returns a fresh cache", () => {
        expect(parseHeroCache(raw, 1000 + week - 1, false)?.[2].name).toBe("Seven");
    });

    it("drops an expired cache unless stale data is acceptable", () => {
        expect(parseHeroCache(raw, 1000 + week, false)).toBeNull();
        expect(parseHeroCache(raw, 1000 + week, true)?.[2].name).toBe("Seven");
    });

    it("treats a cache saved before the hideout line existed as expired", () => {
        const old = JSON.stringify({
            at: 1000,
            heroes: { 2: { id: 2, name: "Seven", icon: null, portrait: null, artIcon: null } },
        });
        expect(parseHeroCache(old, 1001, false)).toBeNull();
        expect(parseHeroCache(old, 1001, true)?.[2].name).toBe("Seven");
    });

    it("treats a cache saved before the art fields existed as expired", () => {
        const old = JSON.stringify({ at: 1000, heroes: { 2: { id: 2, name: "Seven", icon: null } } });
        expect(parseHeroCache(old, 1001, false)).toBeNull();
        expect(parseHeroCache(old, 1001, true)?.[2].name).toBe("Seven");
    });

    it("rejects garbage", () => {
        expect(parseHeroCache("{", 0, true)).toBeNull();
        expect(parseHeroCache(null, 0, true)).toBeNull();
    });
});
