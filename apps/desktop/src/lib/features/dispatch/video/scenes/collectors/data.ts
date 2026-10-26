import type { Edition, RankPoint } from "@deadlock-plus/stats/dispatch/types";
import type { ChartMonth, ChartRow } from "../../../kinds/collectors/model";
import type { CollectorsView } from "../../../kinds/collectors/view";

export interface Pt {
    x: number;
    y: number;
}

export interface SceneStep extends Pt {
    outcome: RankPoint["outcome"];
}

export interface SceneChart {
    width: number;
    height: number;
    pad: { l: number; r: number; t: number; b: number };
    rows: ChartRow[];
    months: ChartMonth[];
    start: Pt;
    /** One per ranked match, oldest first: where the line stands once that match is played. */
    steps: SceneStep[];
    peakIndex: number;
}

/**
 * What the Collector's Copy scene draws beyond the edition view, built on the main thread where i18n and the
 * rank tiers live. `recordValue` and `matchOf` keep their `{holes}` open for the count-ups; `art` maps image
 * keys to sources for the loader.
 */
export interface CollectorsSceneData {
    locale: string;
    tierColor: string;
    serial: string;
    bars: number[];
    record: { wins: number; losses: number };
    winrate: number | null;
    matches: number;
    streak: number;
    chart: SceneChart | null;
    heroes: { id: number; name: string; line: string }[];
    certificate: { before: string; name: string | null; after: string };
    hasClimb: boolean;
    text: Record<SceneText, string>;
    art: Record<string, string | null>;
}

export type SceneText =
    | "brand"
    | "title"
    | "ribbon"
    | "sealed"
    | "stickerTop"
    | "stickerMain"
    | "stickerNote"
    | "tear"
    | "theClimb"
    | "rankedRecord"
    | "startLabel"
    | "endLabel"
    | "climb"
    | "yourCopy"
    | "copyNo"
    | "dates"
    | "teaser"
    | "code"
    | "arc"
    | "peakName"
    | "peakLine"
    | "climbTitle"
    | "kicker"
    | "calloutPeak"
    | "rankedMatches"
    | "matchOf"
    | "recordValue"
    | "won"
    | "bestStreak"
    | "carried"
    | "certTitle"
    | "issuedBy"
    | "signature"
    | "copyNumber"
    | "endCta"
    | "site";

/** The chart's line is `M x y` then, per match, `H x` and a `V y` when the rank moved. */
export function parseSteps(line: string): { start: Pt; steps: Pt[] } {
    const tokens = line.match(/[MHV]|-?\d+(?:\.\d+)?/g) ?? [];
    let start: Pt = { x: 0, y: 0 };
    const steps: Pt[] = [];
    let y = 0;
    for (let i = 0; i < tokens.length; i++) {
        const cmd = tokens[i];
        if (cmd === "M") {
            start = { x: Number(tokens[++i]), y: Number(tokens[++i]) };
            y = start.y;
        } else if (cmd === "H") {
            steps.push({ x: Number(tokens[++i]), y });
        } else if (cmd === "V") {
            y = Number(tokens[++i]);
            steps[steps.length - 1].y = y;
        }
    }
    return { start, steps };
}

/**
 * The line after `drawn` matches: whole steps for the matches played, then a glide along the next match's flat.
 * `matches` counts the whole ones; `ups` and `downs` the rank moves among them.
 */
export function climbAt(start: Pt, steps: Pt[], drawn: number) {
    const whole = Math.max(0, Math.min(steps.length, Math.floor(drawn)));
    const points: Pt[] = [start];
    let ups = 0;
    let downs = 0;
    let prev = start;
    for (let i = 0; i < whole; i++) {
        const s = steps[i];
        if (s.x !== prev.x) points.push({ x: s.x, y: prev.y });
        if (s.y !== prev.y) {
            points.push({ x: s.x, y: s.y });
            if (s.y < prev.y) ups++;
            else downs++;
        }
        prev = s;
    }
    const frac = drawn - whole;
    if (whole < steps.length && frac > 0) {
        const next = steps[whole];
        points.push({ x: prev.x + (next.x - prev.x) * frac, y: prev.y });
    }
    return { points, ups, downs, matches: whole };
}

export function fill(template: string, params: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (hole, name: string) => params[name] ?? hole);
}

type T = (key: string, params?: Record<string, string | number>) => string;

export function collectorsSceneData(
    edition: Edition,
    v: CollectorsView,
    deps: { t: T; locale: string; site: string },
): CollectorsSceneData {
    const { t } = deps;
    const series = edition.rankSeries ?? [];
    let chart: SceneChart | null = null;
    if (v.chart) {
        const { start, steps } = parseSteps(v.chart.line);
        chart = {
            width: v.chart.width,
            height: v.chart.height,
            pad: v.chart.pad,
            rows: v.chart.rows,
            months: v.chart.months,
            start,
            steps: steps.map((s, i) => ({ ...s, outcome: series[i]?.outcome ?? "unscored" })),
            peakIndex: v.chart.peak.index,
        };
    }
    const art: Record<string, string | null> = {
        "badge:peak": v.peak?.image ?? null,
        "badge:start": v.start?.image ?? null,
        "badge:end": v.end?.image ?? null,
    };
    for (const [tier, src] of Object.entries(v.tierArt)) art[`tier:${tier}`] = src;

    return {
        locale: deps.locale,
        tierColor: v.peak?.color ?? "#8a6aa8",
        serial: v.serial,
        bars: v.bars,
        record: { wins: edition.stats.wins, losses: edition.stats.losses },
        winrate: edition.stats.winrate,
        matches: edition.stats.matches,
        streak: edition.longestWin,
        chart,
        heroes: v.heroes.map(({ id, name, line }) => ({ id, name, line })),
        certificate: v.certificate,
        hasClimb: v.start !== null && v.end !== null,
        art,
        text: {
            brand: "Deadlock+",
            title: t("dispatch.collectors.title"),
            ribbon: `${t("dispatch.stamp.collectors")} · ${v.season}`,
            sealed: t("dispatch.collectors.sealed"),
            stickerTop: t("dispatch.collectors.sticker_top"),
            stickerMain: t("dispatch.collectors.sticker_main"),
            stickerNote: t("dispatch.collectors.sticker_note"),
            tear: t("dispatch.collectors.tear"),
            theClimb: t("dispatch.collectors.the_climb"),
            rankedRecord: t("dispatch.collectors.ranked_record"),
            startLabel: v.start?.label ?? "",
            endLabel: v.end?.label ?? "",
            climb: v.climb ?? "",
            yourCopy: t("dispatch.collectors.your_copy"),
            copyNo: t("dispatch.collectors.copy_no"),
            dates: v.dates,
            teaser: t("dispatch.collectors.teaser"),
            code: v.code,
            arc: v.arc,
            peakName: v.peakName,
            peakLine: v.peakLine,
            climbTitle: t("dispatch.collectors.climb_title"),
            kicker: `${v.season} · ${v.dates}`,
            calloutPeak: t("dispatch.collectors.callout_peak"),
            rankedMatches: t("dispatch.collectors.ranked_matches"),
            matchOf: t("dispatch.collectors.match_of", { n: "{n}", total: "{total}" }),
            recordValue: t("dispatch.collectors.record_value", { wins: "{wins}", losses: "{losses}" }),
            won: t("dispatch.collectors.won"),
            bestStreak: t("dispatch.collectors.best_streak"),
            carried: t("dispatch.collectors.carried"),
            certTitle: t("dispatch.collectors.cert_title"),
            issuedBy: t("dispatch.collectors.issued_by"),
            signature: t("dispatch.masthead.name"),
            copyNumber: t("dispatch.collectors.copy_number"),
            endCta: t("dispatch.video.collectors.end_cta"),
            site: deps.site,
        },
    };
}
