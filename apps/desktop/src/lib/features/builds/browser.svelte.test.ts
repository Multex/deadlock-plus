import { afterEach, describe, expect, it, vi } from "vitest";
import { DeadlockApiError } from "@deadlock-plus/deadlock-api";
import { flushSync } from "svelte";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), health: { result: null as { level: string } | null } }));

vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), listen: vi.fn(), fileSrc: (p: string) => p }));
vi.mock("$lib/core/i18n.svelte", () => ({ i18n: { locale: "en" }, t: (key: string) => key }));
vi.mock("$lib/core/errors", () => ({ failureText: (_e: unknown, fallback: string) => fallback }));
vi.mock("$lib/core/player-links", () => ({ parseSteamId: vi.fn(() => null), steam64ToSteam32: vi.fn() }));
vi.mock("$lib/features/heroes/heroes", () => ({ onHeroesRefreshed: vi.fn(() => () => {}), loadHeroes: vi.fn() }));
vi.mock("$lib/features/api-health/health.svelte", () => ({ apiHealth: mocks.health }));
vi.mock("$lib/features/live/live.svelte", () => ({ live: { match: null } }));
vi.mock("$lib/features/match-history/names", () => ({ playerNames: { resolve: mocks.resolve } }));
vi.mock("$lib/features/stats/stats.svelte", () => ({ stats: { matches: [] } }));
vi.mock("$lib/features/voice-bans/profiles", () => ({ searchPlayers: vi.fn() }));
vi.mock("./api", () => ({ buildsLocal: vi.fn() }));
vi.mock("./build-detail.svelte", () => ({ BuildDetail: class {} }));
vi.mock("./heroes", () => ({ loadHeroFlags: vi.fn(), loadPlayableHeroes: vi.fn(), playableHeroes: vi.fn() }));

import { BuildBrowser } from "./browser.svelte";
import { buildsLocal } from "./api";
import { loadPlayableHeroes } from "./heroes";
import { DEFAULT_FILTERS, publicBuilds, type PublicBuildsRequest } from "./public-builds";

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

const REQUEST: PublicBuildsRequest = {
    heroId: 1,
    sort: "popular",
    since: null,
    tag: null,
    languages: null,
    author: null,
    name: "",
    minFavorites: 0,
};

describe("BuildBrowser loading never hangs", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        mocks.health.result = null;
    });

    function started(heroes: unknown[]) {
        vi.mocked(loadPlayableHeroes).mockResolvedValue(heroes as never);
        vi.mocked(buildsLocal).mockResolvedValue({ builds: [] } as never);
        const browser = new BuildBrowser();
        browser.start();
        return browser;
    }

    it("ends in an error when no hero list arrives, since no list can be asked for", async () => {
        const browser = started([]);
        await settle();
        expect(browser.status).toBe("error");
        expect(browser.busy.active).toBe(false);
    });

    it("says the API is busy when no hero list arrives while the API is busy", async () => {
        vi.useFakeTimers();
        mocks.health.result = { level: "busy" };
        const browser = started([]);
        await settle();
        expect(browser.status).toBe("error");
        expect(browser.busy.active).toBe(true);
    });

    it("turns busy when the build list answers 429", async () => {
        vi.useFakeTimers();
        vi.spyOn(publicBuilds, "load").mockRejectedValue(new DeadlockApiError(429, 7));
        const browser = new BuildBrowser();
        await browser.load(REQUEST);
        expect(browser.status).toBe("error");
        expect(browser.busy.active).toBe(true);
        expect(browser.busy.remainingS).toBe(7);
    });

    it("gives up on a build list that never answers", async () => {
        vi.useFakeTimers();
        vi.spyOn(publicBuilds, "load").mockReturnValue(new Promise(() => {}));
        const browser = new BuildBrowser();
        void browser.load(REQUEST);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(browser.status).toBe("error");
    });
});
