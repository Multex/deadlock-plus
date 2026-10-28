import type { Edition, EditionKind, EditionWindow } from "@deadlock-plus/stats/dispatch/types";
import { badgeParts, type RankTier } from "@deadlock-plus/stats/rank";
import { i18n, t, tn } from "$lib/core/i18n.svelte";
import type { EditionView } from "../edition-view";
import type { PaperKind } from "../page-state";
import type { ShelfEntry } from "../service";
import { dateRange } from "../date-range";

type Params = Record<string, string | number>;

export type MiniKind = PaperKind;
/** `proof`: a closed window with enough matches that nobody printed yet. */
export type MiniState = "issued" | "proof" | "too_few" | "so_far";

/** Each look's drawing size; a mini scales it to the height it is given. */
export const MINI_SIZE: Record<MiniKind, { w: number; h: number }> = {
    so_far: { w: 240, h: 360 },
    weekly: { w: 240, h: 176 },
    monthly: { w: 240, h: 312 },
    collectors: { w: 240, h: 363 },
    year_end: { w: 240, h: 360 },
};

export interface MiniCopy {
    id: string;
    kind: MiniKind;
    state: MiniState;
    window: EditionWindow;
    number: number | null;
    matches: number;
    isNew: boolean;
}

export interface MiniBadge {
    image: string | null;
    color: string;
    label: string;
}

/** What an issued copy's cover shows, read from its frozen edition. */
export interface MiniCover {
    /** The cover star; a Monthly mini takes its colour from this hero's backdrop art, as the issued cover does. */
    heroId: number | null;
    /** The cover star's own colour, for when its art gives none. */
    colour: string | null;
    portrait: string | null;
    hero: string | null;
    headline: string | null;
    photo: string | null;
    player: string | null;
    badge: MiniBadge | null;
}

export interface MiniFormat {
    t: (key: string, params?: Params) => string;
    tn: (key: string, count: number, params?: Params) => string;
    date: (unixS: number, tz: string, options: Intl.DateTimeFormatOptions) => string;
    range: (fromS: number, toS: number, tz: string, options: Intl.DateTimeFormatOptions) => string;
    upper: (text: string) => string;
}

export function miniFormat(): MiniFormat {
    const dates = (tz: string, options: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(i18n.locale, { ...options, timeZone: tz });
    return {
        t,
        tn,
        date: (s, tz, options) => dates(tz, options).format(s * 1000),
        range: (a, b, tz, options) => dateRange(dates(tz, options), a * 1000, b * 1000, t("dispatch.range_join")),
        upper: (text) => text.toLocaleUpperCase(i18n.locale),
    };
}

const STATE: Record<ShelfEntry["status"], MiniState> = { issued: "issued", printable: "proof", too_few: "too_few" };

export function shelfMini(kind: EditionKind, entry: ShelfEntry, newIds: readonly string[]): MiniCopy {
    const state = STATE[entry.status];
    return {
        id: entry.window.id,
        kind,
        state,
        window: entry.window,
        number: entry.number,
        matches: entry.matches,
        isNew: state === "issued" && newIds.includes(entry.window.id),
    };
}

export function soFarMini(id: string, window: EditionWindow, matches: number): MiniCopy {
    return { id, kind: "so_far", state: "so_far", window, number: null, matches, isNew: false };
}

// Calendar parts, not display text, so the digits are always Latin.
const part = (s: number, tz: string, options: Intl.DateTimeFormatOptions) =>
    Number(new Intl.DateTimeFormat("en-US", { ...options, timeZone: tz }).format(s * 1000));

/** 0-11, the month the window starts in. */
export const miniMonth = (w: EditionWindow) => part(w.startS, w.tz, { month: "numeric" }) - 1;

/** A Year-End window runs Dec 1 to Dec 1 and is named for the year it closes. */
export const miniYear = (w: EditionWindow) =>
    part(w.kind === "year_end" ? w.endS - 1 : w.startS, w.tz, { year: "numeric" });

const FALLBACK_TIER_COLOR = "#8a6aa8";

/**
 * The Year-End mini's name: the one frozen into the edition, else the account's name today. Editions frozen before
 * the name was stored would otherwise print "Player of the Year" over nothing.
 */
export function miniPlayer(frozen: string | null | undefined, current: string | null | undefined): string | null {
    return frozen?.trim() || current?.trim() || null;
}

/**
 * The largest whole font size from `max` down to `min` at which a line `widthAt(size)` px wide fits `room`; at the
 * floor the line may still overflow and ends in an ellipsis.
 */
export function fitFontSize(widthAt: (size: number) => number, room: number, max: number, min: number): number {
    let size = max;
    while (size > min && widthAt(size) > room) size -= 1;
    return size;
}

export interface MiniCoverDeps {
    hero: (id: number) => { name: string; portrait: string | null; colour?: string | null } | undefined;
    tiers: readonly RankTier[];
    t: MiniFormat["t"];
}

export function miniCover(
    edition: Edition,
    view: Pick<EditionView, "banner" | "photo">,
    deps: MiniCoverDeps,
): MiniCover {
    const top = [...edition.heroes].sort(
        (a, b) => b.games - a.games || b.playtimeS - a.playtimeS || a.heroId - b.heroId,
    )[0];
    const hero = top ? deps.hero(top.heroId) : undefined;
    const peak = badgeParts(edition.rank?.peakBadge ?? null);
    const tier = peak ? deps.tiers.find((x) => x.tier === peak.tier) : undefined;
    return {
        heroId: top?.heroId ?? null,
        colour: hero?.colour ?? null,
        portrait: hero?.portrait ?? null,
        hero: hero?.name ?? null,
        headline: view.banner?.headline ?? null,
        photo: view.photo?.src ?? null,
        player: edition.playerName ?? null,
        badge: peak
            ? {
                  image: tier?.image ?? null,
                  color: tier?.color ?? FALLBACK_TIER_COLOR,
                  label: `${tier?.name ?? deps.t("rank.tier_fallback", { tier: peak.tier })} ${peak.sub}`,
              }
            : null,
    };
}

export interface WeeklyMiniText {
    kind: "weekly";
    band: string;
    when: string;
    /** The range prints both years, which needs tighter letter-spacing to fit the mini. */
    spansYears: boolean;
    headline: string;
    print: string;
}

export interface SoFarMiniText {
    kind: "so_far";
    band: string;
    kicker: string;
    date: string;
    stamp: string;
    foot: string;
}

export interface MonthlyMiniText {
    kind: "monthly";
    top: string;
    mast: string;
    month: string;
    year: string;
    line: string | null;
    coverStar: string;
    print: string;
}

export interface CollectorsMiniText {
    kind: "collectors";
    top: string;
    mast: string;
    strip: string;
    peak: string;
    date: string;
    print: string;
    sticker: { top: string; main: string; note: string };
}

export interface YearEndMiniText {
    kind: "year_end";
    top: string;
    sub: string;
    year: string;
    title: string;
    /** `null`: no name to print, so the title stands alone. */
    name: string | null;
    flap: string;
    print: string;
}

export type MiniText = WeeklyMiniText | SoFarMiniText | MonthlyMiniText | CollectorsMiniText | YearEndMiniText;

const DAY_RANGE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

const dayRange = (w: EditionWindow, fmt: MiniFormat) => fmt.range(w.startS, w.endS - 1, w.tz, DAY_RANGE);

function dateLabel(copy: MiniCopy, fmt: MiniFormat): string {
    const w = copy.window;
    if (copy.kind === "monthly") return fmt.date(w.startS, w.tz, { month: "long", year: "numeric" });
    if (copy.kind === "year_end") return String(miniYear(w));
    return dayRange(w, fmt);
}

export function miniText(copy: MiniCopy, cover: Partial<MiniCover> | undefined, fmt: MiniFormat): MiniText {
    const { t, tn, upper } = fmt;
    const w = copy.window;
    const proof = copy.state === "proof";
    const pair = (first: string, second: string) => t("dispatch.mini.pair", { first, second });
    const numbered = (label: string) =>
        copy.number === null ? label : pair(label, t("dispatch.shelf.number", { number: copy.number }));
    const print = t("dispatch.shelf.print_short");
    const year = String(miniYear(w));

    switch (copy.kind) {
        case "so_far":
            return {
                kind: "so_far",
                band: upper(t("dispatch.monthly.masthead")),
                kicker: upper(t("dispatch.masthead.edition_live")),
                date: upper(dayRange(w, fmt)),
                stamp: t("dispatch.mini.still_printing"),
                foot: tn("dispatch.mini.so_far_foot", copy.matches, {
                    day: fmt.date(w.endS, w.tz, { weekday: "long" }),
                }),
            };
        case "weekly":
            return {
                kind: "weekly",
                band: upper(t("dispatch.masthead.name")),
                when: upper(numbered(dayRange(w, fmt))),
                spansYears: part(w.startS, w.tz, { year: "numeric" }) !== part(w.endS - 1, w.tz, { year: "numeric" }),
                headline:
                    cover?.headline ?? (copy.state === "too_few" ? tn("dispatch.shelf.matches", copy.matches) : ""),
                print,
            };
        case "monthly":
            return {
                kind: "monthly",
                top: upper(
                    proof
                        ? pair(t("dispatch.mini.the_monthly"), t("dispatch.mini.proof"))
                        : numbered(t("dispatch.mini.the_monthly")),
                ),
                mast: upper(t("dispatch.monthly.masthead")),
                month: upper(fmt.date(w.startS, w.tz, { month: "long" })),
                year: upper(!proof && cover?.hero ? pair(year, cover.hero) : year),
                line: proof ? null : (cover?.headline ?? null),
                coverStar: upper(t("dispatch.monthly.kicker.top_hero")),
                print,
            };
        case "collectors":
            return {
                kind: "collectors",
                top: upper(t("dispatch.monthly.brand")),
                mast: upper(t("dispatch.monthly.masthead")),
                strip: upper(t("dispatch.stamp.collectors")),
                peak: upper(proof ? t("dispatch.mini.proof") : (cover?.badge?.label ?? "")),
                date: upper(dayRange(w, fmt)),
                print,
                sticker: {
                    top: upper(t("dispatch.collectors.sticker_top")),
                    main: upper(t("dispatch.collectors.sticker_main")),
                    note: upper(t("dispatch.collectors.sticker_note")),
                },
            };
        case "year_end":
            return {
                kind: "year_end",
                top: upper(t("dispatch.masthead.name")),
                sub: upper(numbered(t("dispatch.masthead.edition_year_end"))),
                year,
                title: proof ? t("dispatch.mini.not_printed") : t("dispatch.year_end.player_of_the_year"),
                name: proof || !cover?.player?.trim() ? null : upper(cover.player.trim()),
                flap: upper(t("dispatch.mini.fold_out")),
                print,
            };
    }
}

/** The copy's accessible name: kind, date, then what clicking it does or why it is dimmed. */
export function miniAria(copy: MiniCopy, fmt: MiniFormat): string {
    const { t, tn } = fmt;
    const detail = (() => {
        switch (copy.state) {
            case "so_far":
                return t("dispatch.mini.still_printing");
            case "proof":
                return t("dispatch.shelf.print");
            case "too_few":
                return tn("dispatch.shelf.too_few", copy.matches);
            case "issued": {
                const number = copy.number === null ? "" : t("dispatch.shelf.number", { number: copy.number });
                return copy.isNew
                    ? t("dispatch.shelf.entry", { date: number, detail: t("dispatch.shelf.new") })
                    : number;
            }
        }
    })();
    return t("dispatch.mini.aria", { kind: t(`dispatch.shelf.kind_${copy.kind}`), date: dateLabel(copy, fmt), detail });
}
