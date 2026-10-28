import { describe, expect, it } from "vitest";
import { i18n } from "$lib/core/i18n.svelte";
import { render } from "svelte/server";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import { editionView } from "../../edition-view";
import YearEndEdition from "./year-end-edition.svelte";

await i18n.namespace("dispatch");

const monthStart = (m: number) => Date.UTC(2025, 11 + m, 1) / 1000;

const edition = {
    schema: 1,
    id: "year_end-2026",
    window: { kind: "year_end", id: "year_end-2026", startS: monthStart(0), endS: monthStart(12), tz: "UTC" },
    accountId: 1,
    number: 1,
    volume: 2026,
    issuedAt: monthStart(12),
    stats: {
        matches: 120,
        wins: 64,
        losses: 56,
        unscored: 0,
        winrate: 0.53,
        playtimeS: 90 * 3600,
        kills: 900,
        deaths: 700,
        assists: 1200,
        netWorth: 0,
        longestMatchS: 2400,
        longestSession: null,
        busiestDay: null,
        nightShare: null,
        daysPlayed: 60,
        busiestMonth: null,
    },
    heroes: [],
    newHeroes: [],
    bestGame: null,
    longestWin: 4,
    rank: null,
    season: null,
    mates: [],
    nemesis: null,
    combat: null,
    stories: [],
    playerName: "Lantern",
    months: Array.from({ length: 12 }, (_, m) => ({ monthStartS: monthStart(m), matches: 10, wins: 5 })),
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
    render(YearEndEdition, { props: { edition, view, stage: { width: 1400, height: 860 }, reveal: false } }).body;

describe("year-end fold markup", () => {
    it("hands the room its unfold control to focus", () => {
        const unfold = html().match(/<button[^>]*aria-label="Unfold the Year-End Special"[^>]*>/)?.[0] ?? "";
        expect(unfold).toContain("data-object-focus");
    });

    it("keeps a polite live region for the fold, silent before the first unfold", () => {
        expect(html()).toMatch(/<span[^>]*aria-live="polite"[^>]*>\s*<\/span>/);
    });

    it("shows no Fold up control on the folded copy", () => {
        expect(html()).not.toContain("Fold up");
    });
});
