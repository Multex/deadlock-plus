import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), listen: vi.fn(), fileSrc: (p: string) => p }));
vi.mock("$lib/core/i18n.svelte", () => ({ i18n: { locale: "en" }, t: (key: string) => key }));
vi.mock("$lib/core/errors", () => ({ failureText: (_e: unknown, fallback: string) => fallback }));
vi.mock("$lib/core/player-links", () => ({ parseSteamId: vi.fn(() => null), steam64ToSteam32: vi.fn() }));
vi.mock("$lib/features/heroes/heroes", () => ({ onHeroesRefreshed: vi.fn(() => () => {}), loadHeroes: vi.fn() }));
vi.mock("$lib/features/live/live.svelte", () => ({ live: { match: null } }));
vi.mock("$lib/features/match-history/names", () => ({ playerNames: { resolve: mocks.resolve } }));
vi.mock("$lib/features/stats/stats.svelte", () => ({ stats: { matches: [] } }));
vi.mock("$lib/features/voice-bans/profiles", () => ({ searchPlayers: vi.fn() }));
vi.mock("./api", () => ({ buildsLocal: vi.fn() }));
vi.mock("./build-detail.svelte", () => ({ BuildDetail: class {} }));
vi.mock("./heroes", () => ({ loadHeroFlags: vi.fn(), loadPlayableHeroes: vi.fn(), playableHeroes: vi.fn() }));

import { BuildBrowser } from "./browser.svelte";
import { DEFAULT_FILTERS } from "./public-builds";

const AUTHOR = 29715818;
const FILTERS = { ...DEFAULT_FILTERS, author: AUTHOR };
const ROUNDS = 20;

async function settle() {
    for (let i = 0; i < 10; i++) {
        flushSync();
        await Promise.resolve();
    }
}

/**
 * Vitest compiles Svelte for the server here, where `$effect` never runs, so the page's
 * `readFilters` effect is driven by hand: it runs again whenever `authors` is reassigned, as it
 * does in the app while it reads `authors`.
 */
async function readLikeThePage(browser: BuildBrowser) {
    let seen = browser.authors;
    browser.readFilters(FILTERS);
    for (let i = 0; i < ROUNDS; i++) {
        await settle();
        if (browser.authors === seen) return;
        seen = browser.authors;
        browser.readFilters(FILTERS);
    }
}

describe("BuildBrowser.readFilters", () => {
    afterEach(() => mocks.resolve.mockReset());

    it("looks up an author with no known name once, not in a loop", async () => {
        mocks.resolve.mockResolvedValue(new Map());
        const browser = new BuildBrowser();
        const before = browser.authors;
        await readLikeThePage(browser);
        expect(mocks.resolve).toHaveBeenCalledTimes(1);
        expect(browser.authors).toBe(before);
    });

    it("stores a resolved author name after one lookup", async () => {
        mocks.resolve.mockResolvedValue(new Map([[AUTHOR, "Pocket"]]));
        const browser = new BuildBrowser();
        await readLikeThePage(browser);
        expect(mocks.resolve).toHaveBeenCalledTimes(1);
        expect(browser.authors.get(AUTHOR)).toBe("Pocket");
    });
});
