import { describe, expect, it } from "vitest";
import type { Edition, EditionWindow } from "@deadlock-plus/stats/dispatch/types";
import type { RankTier } from "@deadlock-plus/stats/rank";
import type { ShelfEntry } from "../service";
import {
    miniAria,
    miniCover,
    miniMonth,
    miniText,
    miniYear,
    shelfMini,
    soFarMini,
    type MiniCopy,
    type MiniFormat,
} from "./minis";

const fmt = (key: string, params?: Record<string, string | number>) =>
    params ? `${key}${JSON.stringify(params)}` : key;

const format: MiniFormat = {
    t: fmt,
    tn: (key, count, params) => fmt(`${key}_${count === 1 ? "one" : "other"}`, { count, ...params }),
    date: (s, tz, options) => new Intl.DateTimeFormat("en-US", { ...options, timeZone: tz }).format(s * 1000),
    range: (a, b, tz, options) => `${format.date(a, tz, options)}..${format.date(b, tz, options)}`,
    upper: (s) => s.toUpperCase(),
};

const at = (y: number, m: number, d: number) => Date.UTC(y, m, d) / 1000;
const win = (kind: EditionWindow["kind"], startS: number, endS: number): EditionWindow => ({
    kind,
    id: `${kind}-${startS}`,
    startS,
    endS,
    tz: "UTC",
});

const WEEK = win("weekly", at(2025, 10, 24), at(2025, 11, 1));
const MONTH = win("monthly", at(2025, 9, 1), at(2025, 10, 1));
const SEASON = win("collectors", at(2025, 6, 30), at(2025, 10, 5));
const YEAR = win("year_end", at(2024, 11, 1), at(2025, 11, 1));

const entry = (window: EditionWindow, over: Partial<ShelfEntry> = {}): ShelfEntry => ({
    window,
    status: "issued",
    matches: 12,
    number: 3,
    onRequest: false,
    ...over,
});

const TIERS: RankTier[] = [{ tier: 9, name: "Phantom", color: "#4b3a7a", image: "phantom.png" }];

describe("shelfMini", () => {
    it("maps the shelf status to the mini's state", () => {
        expect(shelfMini("weekly", entry(WEEK), []).state).toBe("issued");
        expect(shelfMini("weekly", entry(WEEK, { status: "printable", number: null }), []).state).toBe("proof");
        expect(shelfMini("weekly", entry(WEEK, { status: "too_few", number: null }), []).state).toBe("too_few");
    });

    it("marks only listed ids as new", () => {
        expect(shelfMini("monthly", entry(MONTH), [MONTH.id]).isNew).toBe(true);
        expect(shelfMini("monthly", entry(MONTH), ["other"]).isNew).toBe(false);
    });

    it("never marks a proof or a thin week as new", () => {
        expect(shelfMini("weekly", entry(WEEK, { status: "printable" }), [WEEK.id]).isNew).toBe(false);
        expect(shelfMini("weekly", entry(WEEK, { status: "too_few" }), [WEEK.id]).isNew).toBe(false);
    });

    it("keeps the window, number and match count", () => {
        expect(shelfMini("collectors", entry(SEASON, { number: 7, matches: 40 }), [])).toEqual({
            id: SEASON.id,
            kind: "collectors",
            state: "issued",
            window: SEASON,
            number: 7,
            matches: 40,
            isNew: false,
        });
    });
});

describe("soFarMini", () => {
    it("is a still-printing sheet with no number", () => {
        expect(soFarMini("live", WEEK, 4)).toEqual({
            id: "live",
            kind: "so_far",
            state: "so_far",
            window: WEEK,
            number: null,
            matches: 4,
            isNew: false,
        });
    });
});

describe("miniMonth and miniYear", () => {
    it("read the window's month and year in its own zone", () => {
        expect(miniMonth(MONTH)).toBe(9);
        expect(miniYear(MONTH)).toBe(2025);
        expect(miniMonth({ ...MONTH, tz: "America/Los_Angeles" })).toBe(8);
    });

    it("names a Year-End Special for the year it closes", () => {
        expect(miniYear(YEAR)).toBe(2025);
    });
});

describe("miniCover", () => {
    const edition = {
        window: WEEK,
        heroes: [
            { heroId: 1, games: 3, wins: 1, playtimeS: 100 },
            { heroId: 2, games: 5, wins: 4, playtimeS: 90 },
            { heroId: 3, games: 5, wins: 2, playtimeS: 80 },
        ],
        rank: { startBadge: 91, endBadge: 93, peakBadge: 94, delta: 3 },
        playerName: "Lantern",
    } as unknown as Edition;
    const deps = {
        hero: (id: number) => (id === 2 ? { name: "Lash", portrait: "lash.png", colour: "#4174BB" } : undefined),
        tiers: TIERS,
        t: fmt,
    };

    it("puts the most played hero on the cover, ties broken by time played", () => {
        const cover = miniCover(edition, {}, deps);
        expect(cover.hero).toBe("Lash");
        expect(cover.portrait).toBe("lash.png");
    });

    it("carries the cover hero and its colour, so the mini can colour itself like the issued cover", () => {
        const cover = miniCover(edition, {}, deps);
        expect(cover.heroId).toBe(2);
        expect(cover.colour).toBe("#4174BB");
    });

    it("breaks a full tie on the lower hero id, as the Monthly's cover does", () => {
        const tied = {
            ...edition,
            heroes: [
                { heroId: 9, games: 5, wins: 1, playtimeS: 90 },
                { heroId: 2, games: 5, wins: 1, playtimeS: 90 },
            ],
        } as unknown as Edition;
        expect(miniCover(tied, {}, deps).heroId).toBe(2);
    });

    it("takes the headline and photo from the edition's view", () => {
        const cover = miniCover(
            edition,
            {
                banner: { id: "a", kind: "record", headline: "Winning ways", deck: "" },
                photo: { src: "p.png", alt: "", caption: "" },
            },
            deps,
        );
        expect(cover.headline).toBe("Winning ways");
        expect(cover.photo).toBe("p.png");
        expect(cover.player).toBe("Lantern");
    });

    it("labels the peak badge with its tier", () => {
        expect(miniCover(edition, {}, deps).badge).toEqual({
            image: "phantom.png",
            color: "#4b3a7a",
            label: "Phantom 4",
        });
    });

    it("falls back to a numbered tier and a stock colour", () => {
        const odd = { ...edition, rank: { ...edition.rank!, peakBadge: 112 } } as Edition;
        expect(miniCover(odd, {}, deps).badge).toEqual({
            image: null,
            color: "#8a6aa8",
            label: 'rank.tier_fallback{"tier":11} 2',
        });
    });

    it("has no badge, hero or player when the edition lacks them", () => {
        const bare = { ...edition, heroes: [], rank: null, playerName: undefined } as unknown as Edition;
        expect(miniCover(bare, {}, deps)).toEqual({
            heroId: null,
            colour: null,
            portrait: null,
            hero: null,
            headline: null,
            photo: null,
            player: null,
            badge: null,
        });
    });
});

const copy = (over: Partial<MiniCopy>): MiniCopy => ({
    id: "x",
    kind: "weekly",
    state: "issued",
    window: WEEK,
    number: 3,
    matches: 12,
    isNew: false,
    ...over,
});

const PAIR = "dispatch.mini.pair";

describe("miniText", () => {
    it("dates an issued weekly with its number", () => {
        const text = miniText(copy({}), { headline: "Winning ways" }, format);
        expect(text).toMatchObject({
            kind: "weekly",
            band: "DISPATCH.MASTHEAD.NAME",
            headline: "Winning ways",
        });
        if (text.kind !== "weekly") throw new Error();
        expect(text.when).toBe(
            `${PAIR}{"first":"NOV 24..NOV 30","second":"dispatch.shelf.number{\\"number\\":3}"}`.toUpperCase(),
        );
    });

    it("counts a thin week's matches through the plural keys", () => {
        const one = miniText(copy({ state: "too_few", number: null, matches: 1 }), undefined, format);
        if (one.kind !== "weekly") throw new Error();
        expect(one.headline).toBe('dispatch.shelf.matches_one{"count":1}');
        expect(one.when).toBe("NOV 24..NOV 30");
    });

    it("offers Print on a proof", () => {
        const proof = miniText(copy({ state: "proof", number: null }), undefined, format);
        expect(proof).toMatchObject({ print: "dispatch.shelf.print_short" });
    });

    it("dates a week across two months with both", () => {
        const text = miniText(copy({ window: win("weekly", at(2025, 11, 29), at(2026, 0, 5)) }), undefined, format);
        if (text.kind !== "weekly") throw new Error();
        expect(text.when).toContain("DEC 29..JAN 4");
    });

    it("tells the so-far sheet's match count and when it comes out", () => {
        const text = miniText(soFarMini("live", WEEK, 1), undefined, format);
        expect(text).toMatchObject({
            kind: "so_far",
            band: "DISPATCH.MONTHLY.MASTHEAD",
            kicker: "DISPATCH.MASTHEAD.EDITION_LIVE",
            date: "NOV 24..NOV 30",
            stamp: "dispatch.mini.still_printing",
            foot: 'dispatch.mini.so_far_foot_one{"count":1,"day":"Monday"}',
        });
    });

    it("names the month on a Monthly and its cover star", () => {
        const text = miniText(copy({ kind: "monthly", window: MONTH }), { hero: "Lash", headline: "Big" }, format);
        expect(text).toMatchObject({
            kind: "monthly",
            month: "OCTOBER",
            mast: "DISPATCH.MONTHLY.MASTHEAD",
            line: "Big",
        });
        if (text.kind !== "monthly") throw new Error();
        expect(text.top).toBe(
            `${PAIR}{"first":"dispatch.mini.the_monthly","second":"dispatch.shelf.number{\\"number\\":3}"}`.toUpperCase(),
        );
        expect(text.year).toBe(`${PAIR}{"first":"2025","second":"Lash"}`.toUpperCase());
    });

    it("marks a Monthly proof and leaves the hero off", () => {
        const text = miniText(
            copy({ kind: "monthly", window: MONTH, state: "proof", number: null }),
            undefined,
            format,
        );
        expect(text).toMatchObject({ year: "2025", line: null, coverStar: "DISPATCH.MONTHLY.KICKER.TOP_HERO" });
        if (text.kind !== "monthly") throw new Error();
        expect(text.top).toBe(
            `${PAIR}{"first":"dispatch.mini.the_monthly","second":"dispatch.mini.proof"}`.toUpperCase(),
        );
    });

    it("shows the season peak on a Collector's Copy, Proof before it is printed", () => {
        const badge = { image: null, color: "#000", label: "Phantom 4" };
        const issued = miniText(copy({ kind: "collectors", window: SEASON }), { badge }, format);
        expect(issued).toMatchObject({ kind: "collectors", peak: "PHANTOM 4", strip: "DISPATCH.STAMP.COLLECTORS" });
        const proof = miniText(copy({ kind: "collectors", window: SEASON, state: "proof" }), { badge }, format);
        expect(proof).toMatchObject({ peak: "DISPATCH.MINI.PROOF" });
    });

    it("carries the sealed bag's sticker", () => {
        const text = miniText(copy({ kind: "collectors", window: SEASON }), undefined, format);
        expect(text).toMatchObject({
            sticker: {
                top: "DISPATCH.COLLECTORS.STICKER_TOP",
                main: "DISPATCH.COLLECTORS.STICKER_MAIN",
                note: "DISPATCH.COLLECTORS.STICKER_NOTE",
            },
        });
    });

    it("titles a Year-End Special with the year it closes and the player", () => {
        const text = miniText(copy({ kind: "year_end", window: YEAR }), { player: "Lantern" }, format);
        expect(text).toMatchObject({
            kind: "year_end",
            year: "2025",
            title: "dispatch.year_end.player_of_the_year",
            name: "LANTERN",
        });
    });

    it("says a Year-End proof is not printed yet", () => {
        const text = miniText(
            copy({ kind: "year_end", window: YEAR, state: "proof", number: null }),
            undefined,
            format,
        );
        expect(text).toMatchObject({
            title: "dispatch.mini.not_printed",
            name: "",
            sub: "DISPATCH.MASTHEAD.EDITION_YEAR_END",
        });
    });
});

describe("miniAria", () => {
    it("reads kind, date and state", () => {
        expect(miniAria(copy({ state: "proof", number: null }), format)).toBe(
            'dispatch.mini.aria{"kind":"dispatch.shelf.kind_weekly","date":"Nov 24..Nov 30","detail":"dispatch.shelf.print"}',
        );
        expect(miniAria(copy({ state: "too_few", matches: 1 }), format)).toContain(
            '"detail":"dispatch.shelf.too_few_one{\\"count\\":1}"',
        );
        expect(miniAria(copy({ kind: "monthly", window: MONTH }), format)).toContain('"date":"October 2025"');
        expect(miniAria(copy({ kind: "year_end", window: YEAR }), format)).toContain('"date":"2025"');
        expect(miniAria(soFarMini("live", WEEK, 4), format)).toContain('"detail":"dispatch.mini.still_printing"');
    });

    it("says New on an unopened issue", () => {
        expect(miniAria(copy({ isNew: true }), format)).toContain(
            '"detail":"dispatch.shelf.entry{\\"date\\":\\"dispatch.shelf.number{\\\\\\"number\\\\\\":3}\\",\\"detail\\":\\"dispatch.shelf.new\\"}"',
        );
    });
});
