import { describe, expect, it } from "vitest";
import { interpolate } from "$lib/core/i18n.svelte";
import type { Edition, EditionDay } from "@deadlock-plus/stats/dispatch/types";
import { editionView, type DispatchViewDeps } from "../../edition-view";
import { buildMagazine, type MagazineDeps } from "./magazine";

const CATALOG: Record<string, string> = {
    "dispatch.monthly.fact.days_played": "Days played",
    "dispatch.monthly.fact.days_played_note_other": "of {count} in the month",
};
const t = (key: string, params?: Record<string, string | number>) => interpolate(CATALOG[key] ?? key, params);
const tn = (key: string, count: number, params?: Record<string, string | number>) => {
    const full = `${key}_${count === 1 ? "one" : "other"}`;
    return interpolate(CATALOG[full] ?? full, { count, ...params });
};
const number = (n: number) => new Intl.NumberFormat("en").format(n);
const percent = (v: number) => `${Math.round(v * 100)}%`;

const viewDeps: DispatchViewDeps = {
    t,
    tn,
    number,
    hero: () => ({ name: "Lash", art: "card/4.png" }),
    day: (s) => new Date(s * 1000).toISOString().slice(0, 10),
    dayRange: () => "",
    month: (s, tz) => new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: tz }).format(s * 1000),
    percent,
    duration: (s) => `${Math.floor(s / 3600)}h`,
    netWorth: (n) => `${Math.round(n / 1000)}K`,
    rank: (b) => `Badge ${b}`,
};

const deps: MagazineDeps = {
    t,
    tn,
    number,
    percent,
    percentParts: (v) => [
        { value: String(Math.round(v * 100)), sign: false },
        { value: "%", sign: true },
    ],
    duration: viewDeps.duration,
    date: (s, tz, options) => new Intl.DateTimeFormat("en", { ...options, timeZone: tz }).format(s * 1000),
    hero: () => ({ name: "Lash", icon: "icon/4.png", art: "card/4.png" }),
    rank: (b) => ({ name: `Badge ${b}`, image: `rank/${Math.floor(b / 10)}.png` }),
};

const TZ = "Europe/Berlin";
const START = Date.UTC(2026, 7, 31, 22) / 1000;
const END = Date.UTC(2026, 8, 30, 22) / 1000;
const DAYS: EditionDay[] = Array.from({ length: 30 }, (_, i) => ({
    dayStartS: START + i * 86400,
    matches: i % 3 === 0 ? 2 : 0,
    wins: i % 3 === 0 ? 1 : 0,
}));

/** A Monthly frozen before `stats.daysPlayed` existed: the field is absent from its stored JSON. */
function frozen(days: EditionDay[] | undefined): Edition {
    return {
        schema: 1,
        id: "monthly-2026-09",
        window: { kind: "monthly", id: "monthly-2026-09", startS: START, endS: END, tz: TZ },
        accountId: 42,
        number: 2,
        volume: 2026,
        issuedAt: END + 60,
        stats: {
            matches: 20,
            wins: 10,
            losses: 10,
            unscored: 0,
            winrate: 0.5,
            playtimeS: 10 * 3600,
            kills: 100,
            deaths: 80,
            assists: 120,
            netWorth: 500_000,
            longestMatchS: 2700,
            longestSession: null,
            busiestDay: null,
            nightShare: null,
        } as Edition["stats"],
        heroes: [{ heroId: 4, games: 20, wins: 10, playtimeS: 10 * 3600 }],
        newHeroes: [],
        bestGame: null,
        longestWin: 2,
        rank: null,
        season: null,
        mates: [],
        nemesis: null,
        combat: null,
        stories: [],
        days,
    };
}

const daysPlayed = (e: Edition) =>
    buildMagazine(e, editionView(e, viewDeps), deps).facts.find((f) => f.id === "days_played");

describe("buildMagazine on a Monthly frozen without days played", () => {
    it("counts the calendar's days with a match", () => {
        expect(daysPlayed(frozen(DAYS))).toEqual({
            id: "days_played",
            label: "Days played",
            value: "10",
            note: "of 30 in the month",
        });
    });

    it("leaves the cell out when there is no calendar to count either", () => {
        expect(daysPlayed(frozen(undefined))).toBeUndefined();
    });

    it("never prints NaN in any fact", () => {
        for (const days of [DAYS, undefined]) {
            const e = frozen(days);
            for (const f of buildMagazine(e, editionView(e, viewDeps), deps).facts) {
                expect(f.value).not.toContain("NaN");
                expect(f.note).not.toContain("NaN");
            }
        }
    });
});
