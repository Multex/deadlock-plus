import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import { i18n, t, tn } from "$lib/core/i18n.svelte";
import { editionView } from "../../edition-view";
import type { CollectorsDeps } from "./view";
import CollectorsEdition from "./collectors-edition.svelte";

await i18n.namespace("dispatch");

const START = Date.UTC(2026, 6, 30) / 1000;
const END = Date.UTC(2026, 10, 5) / 1000;

vi.mock("./assets.svelte", () => ({
    collectorsAssets: () => ({
        ready: true,
        deps: {
            t,
            tn,
            number: String,
            percent: (v: number) => `${Math.round(v * 100)}%`,
            dayRange: () => "Jul 30 to Nov 5, 2026",
            day: () => "Mon, Aug 3",
            month: () => "Aug",
            tiers: [],
            hero: () => undefined,
        } satisfies CollectorsDeps,
    }),
}));

const edition = {
    schema: 1,
    id: "collectors-season_1",
    window: { kind: "collectors", id: "collectors-season_1", startS: START, endS: END, tz: "UTC" },
    accountId: 42,
    number: 1,
    volume: 2026,
    issuedAt: END + 60,
    stats: {
        matches: 40,
        wins: 22,
        losses: 18,
        unscored: 0,
        winrate: 0.55,
        playtimeS: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        netWorth: 0,
        longestMatchS: 0,
        longestSession: null,
        busiestDay: null,
        nightShare: null,
        daysPlayed: 12,
        busiestMonth: null,
    },
    heroes: [],
    newHeroes: [],
    bestGame: null,
    longestWin: 3,
    rank: { startBadge: 64, endBadge: 86, peakBadge: 93, delta: 0 },
    season: { id: "season_1", name: "Beta Season 1", startS: START, endS: END },
    mates: [],
    nemesis: null,
    combat: null,
    stories: [],
    rankSeries: [],
} as unknown as Edition;

const view = editionView(edition, {
    t: (k) => k,
    tn: (k) => k,
    number: String,
    hero: () => undefined,
    day: () => "",
    dayRange: () => "",
    month: () => "",
    percent: String,
    duration: String,
    netWorth: String,
    rank: String,
});

const html = () =>
    render(CollectorsEdition, { props: { edition, view, stage: { width: 1400, height: 860 }, reveal: false } }).body;

describe("collector's copy reader markup", () => {
    it("is one focusable, labelled copy that the room focuses", () => {
        const region = html().match(/<div[^>]*data-reader[^>]*>/)?.[0] ?? "";
        expect(region).toContain('role="region"');
        expect(region).toContain('tabindex="0"');
        expect(region).toContain("data-object-focus");
        expect(region).toMatch(/aria-label="[^"]*Beta Season 1[^"]*"/);
    });

    it("announces where the reader is in a live region", () => {
        expect(html()).toMatch(/aria-live="polite"[^>]*>\s*Cover\s*</);
    });

    it("opens from the cover itself and the pager, not a separate Open button", () => {
        const body = html();
        expect(body).not.toContain("Open the issue");
        expect(body).toMatch(/aria-label="Next page"/);
        expect(body).toMatch(
            /<button[^>]*disabled[^>]*aria-label="Previous page"|aria-label="Previous page"[^>]*disabled/,
        );
    });

    it("sets its controls on a backed pill, not straight on the room", () => {
        const bar = html().match(/<div[^>]*data-reader-bar[^>]*>[\s\S]*?<div class="pill[^"]*"/)?.[0];
        expect(bar).toBeTruthy();
    });
});
