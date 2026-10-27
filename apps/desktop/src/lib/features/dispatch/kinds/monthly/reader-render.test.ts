import { describe, expect, it } from "vitest";
import { i18n } from "$lib/core/i18n.svelte";
import { render } from "svelte/server";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import { editionView } from "../../edition-view";
import MonthlyEdition from "./monthly-edition.svelte";

await i18n.namespace("dispatch");

const START = Date.UTC(2026, 8, 1) / 1000;
const END = Date.UTC(2026, 9, 1) / 1000;

const edition: Edition = {
    schema: 1,
    id: "monthly-2026-09",
    window: { kind: "monthly", id: "monthly-2026-09", startS: START, endS: END, tz: "UTC" },
    accountId: 42,
    number: 2,
    volume: 2026,
    issuedAt: END + 60,
    stats: {
        matches: 12,
        wins: 7,
        losses: 5,
        unscored: 0,
        winrate: 7 / 12,
        playtimeS: 6 * 3600,
        kills: 90,
        deaths: 60,
        assists: 120,
        netWorth: 500_000,
        longestMatchS: 2400,
        longestSession: null,
        busiestDay: null,
        nightShare: 0,
        daysPlayed: 5,
        busiestMonth: null,
    },
    heroes: [],
    newHeroes: [],
    bestGame: null,
    longestWin: 2,
    rank: null,
    season: null,
    mates: [],
    nemesis: null,
    combat: null,
    stories: [],
    days: [],
} as unknown as Edition;

const view = editionView(edition, {
    t: (k) => k,
    tn: (k) => k,
    number: String,
    hero: () => undefined,
    day: () => "",
    dayRange: () => "",
    month: () => "September 2026",
    percent: String,
    duration: String,
    netWorth: String,
    rank: String,
});

const html = () =>
    render(MonthlyEdition, { props: { edition, view, stage: { width: 1200, height: 900 }, reveal: false } }).body;

describe("monthly reader markup", () => {
    it("is one focusable, labelled magazine", () => {
        const body = html();
        const region = body.match(/<div[^>]*data-reader[^>]*>/)?.[0] ?? "";
        expect(region).toContain('role="region"');
        expect(region).toContain('tabindex="0"');
        expect(region).toMatch(/aria-label="[^"]*September[^"]*"/);
    });

    it("announces the spread in a live region", () => {
        expect(html()).toMatch(/aria-live="polite"[^>]*>\s*Cover\s*</);
    });

    it("opens from the cover itself, not a separate Open button", () => {
        const body = html();
        expect(body).not.toMatch(/>\s*Open\s*</);
        expect(body).toMatch(/aria-label="Next pages"/);
        expect(body).toMatch(
            /<button[^>]*disabled[^>]*aria-label="Previous pages"|aria-label="Previous pages"[^>]*disabled/,
        );
    });

    it("carries the turn affordance on the page edges", () => {
        expect(html()).toContain("data-curl");
    });
});
