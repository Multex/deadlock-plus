import { t } from "$lib/core/i18n.svelte";
import { pct } from "./format";
import { bucket, MIN_SAMPLE, scored, type Bucket, type Session } from "@deadlock-plus/stats/sessions";
import type { Match } from "@deadlock-plus/stats/stats";

export type Tone = "better" | "worse" | "same" | "unknown";

export interface Bar {
    label: string;
    games: number;
    winrate: number | null;
    tone: Tone;
    note?: string;
}

export interface Finding {
    id: string;
    title: string;
    headline: string;
    tone: Tone;
    bars: Bar[];
}

const MIN_GAP = 0.08;
const Z = 1.28;
const QUICK_REQUEUE_S = 10 * 60;
const STOP_FROM = 3;
const STOP_TO = 6;

// A gap counts only when it clears both a fixed floor and what chance alone would produce at
// this sample size, so a lucky handful of games never reads as a pattern.
export function judge(b: Bucket, baseline: number | null): Tone {
    if (baseline === null || b.winrate === null || b.games < MIN_SAMPLE) return "unknown";
    const diff = b.winrate - baseline;
    const need = Math.max(MIN_GAP, Z * Math.sqrt((baseline * (1 - baseline)) / b.games));
    if (diff >= need) return "better";
    if (diff <= -need) return "worse";
    return "same";
}

interface Game {
    match: Match;
    index: number;
    lossRun: number;
    prev: Match | null;
}

function gamesOf(sessions: Session[]): Game[] {
    const out: Game[] = [];
    for (const s of sessions) {
        let lossRun = 0;
        let prev: Match | null = null;
        scored(s).forEach((match, i) => {
            out.push({ match, index: i + 1, lossRun, prev });
            lossRun = match.outcome === "loss" ? lossRun + 1 : 0;
            prev = match;
        });
    }
    return out;
}

const bucketOf = (games: Game[]): Bucket => bucket(games.length, games.filter((g) => g.match.outcome === "win").length);

const bar = (label: string, b: Bucket, tone: Tone, note?: string): Bar => ({
    label,
    games: b.games,
    winrate: b.winrate,
    tone,
    note,
});

function afterLosses(games: Game[]): Finding {
    const a = bucketOf(games.filter((g) => g.lossRun >= 2));
    const rest = bucketOf(games.filter((g) => g.lossRun < 2));
    const tone = judge(a, rest.winrate);
    const params = { rate: pct(a.winrate), rest: pct(rest.winrate) };
    const headline = {
        unknown: t("sessions.insights.after_losses.unknown", { games: a.games, min: MIN_SAMPLE }),
        worse: t("sessions.insights.after_losses.worse", params),
        better: t("sessions.insights.after_losses.better", params),
        same: t("sessions.insights.after_losses.same", params),
    }[tone];
    return {
        id: "after-losses",
        title: t("sessions.insights.after_losses.title"),
        headline,
        tone,
        bars: [
            bar(t("sessions.insights.after_losses.bar_after"), a, tone),
            bar(t("sessions.insights.after_losses.bar_rest"), rest, "same"),
        ],
    };
}

function sessionLength(games: Game[], baseline: number | null): Finding {
    const bars: Bar[] = [];
    for (let n = 1; n <= STOP_TO; n++) {
        const at = games.filter((g) => (n === STOP_TO ? g.index >= n : g.index === n));
        const b = bucketOf(at);
        const deltas = at.map((g) => g.match.rankDelta).filter((d): d is number => d !== null);
        const avg = deltas.length ? Math.round(deltas.reduce((x, y) => x + y, 0) / deltas.length) : null;
        const note =
            avg === null
                ? undefined
                : t("sessions.insights.session_length.points", { amount: `${avg > 0 ? "+" : ""}${avg}` });
        const label =
            n === STOP_TO
                ? t("sessions.insights.session_length.bar_plus", { n })
                : t("sessions.insights.session_length.bar", { n });
        bars.push(bar(label, b, judge(b, baseline), note));
    }

    let best: { k: number; head: Bucket; tail: Bucket; gap: number } | null = null;
    for (let k = STOP_FROM; k <= STOP_TO; k++) {
        const head = bucketOf(games.filter((g) => g.index < k));
        const tail = bucketOf(games.filter((g) => g.index >= k));
        if (head.games < MIN_SAMPLE || judge(tail, head.winrate) !== "worse") continue;
        const gap = head.winrate! - tail.winrate!;
        if (!best || gap > best.gap) best = { k, head, tail, gap };
    }
    if (best) {
        return {
            id: "session-length",
            title: t("sessions.insights.session_length.title"),
            headline: t("sessions.insights.session_length.drop", {
                last: best.k - 1,
                head: pct(best.head.winrate),
                tail: pct(best.tail.winrate),
                from: best.k,
            }),
            tone: "worse",
            bars,
        };
    }
    const longGames = games.filter((g) => g.index >= 4).length;
    const enough = longGames >= MIN_SAMPLE;
    return {
        id: "session-length",
        title: t("sessions.insights.session_length.title"),
        headline: enough
            ? t("sessions.insights.session_length.hold")
            : t("sessions.insights.session_length.unknown", { games: longGames, min: MIN_SAMPLE }),
        tone: enough ? "same" : "unknown",
        bars,
    };
}

function afterLossSplit(
    games: Game[],
    id: string,
    title: string,
    split: (g: Game) => boolean,
    labels: [string, string],
    text: (tone: "better" | "worse" | "same", yes: string, no: string) => string,
): Finding {
    const after = games.filter((g) => g.lossRun >= 1 && g.prev);
    const yes = bucketOf(after.filter(split));
    const no = bucketOf(after.filter((g) => !split(g)));
    const tone = no.games < MIN_SAMPLE ? "unknown" : judge(yes, no.winrate);
    const headline =
        tone === "unknown"
            ? t("sessions.insights.unknown_after_loss", { yes: yes.games, no: no.games, min: MIN_SAMPLE })
            : text(tone, pct(yes.winrate), pct(no.winrate));
    return { id, title, headline, tone, bars: [bar(labels[0], yes, tone), bar(labels[1], no, "same")] };
}

const blocks = (): { label: string; phrase: string; from: number; to: number }[] => [
    {
        label: t("sessions.insights.time_of_day.morning"),
        phrase: t("sessions.insights.time_of_day.phrase_morning"),
        from: 6,
        to: 11,
    },
    {
        label: t("sessions.insights.time_of_day.afternoon"),
        phrase: t("sessions.insights.time_of_day.phrase_afternoon"),
        from: 12,
        to: 17,
    },
    {
        label: t("sessions.insights.time_of_day.evening"),
        phrase: t("sessions.insights.time_of_day.phrase_evening"),
        from: 18,
        to: 23,
    },
    {
        label: t("sessions.insights.time_of_day.late_night"),
        phrase: t("sessions.insights.time_of_day.phrase_late_night"),
        from: 0,
        to: 5,
    },
];

const localOf = (m: Match, tzOffsetMin: number) => m.startTime + tzOffsetMin * 60;
const mod = (n: number, d: number) => ((n % d) + d) % d;

function timeOfDay(games: Game[], baseline: Bucket, tzOffsetMin: number): Finding {
    const rows = blocks().map((blk) => {
        const b = bucketOf(
            games.filter((g) => {
                const hour = Math.floor(mod(localOf(g.match, tzOffsetMin), 86_400) / 3600);
                return hour >= blk.from && hour <= blk.to;
            }),
        );
        return { blk, b, tone: judge(b, baseline.winrate) };
    });
    const gapOf = (r: (typeof rows)[number]) => Math.abs((r.b.winrate ?? 0) - (baseline.winrate ?? 0));
    const best = rows.filter((r) => r.tone === "better").sort((a, b) => gapOf(b) - gapOf(a))[0];
    const worst = rows.filter((r) => r.tone === "worse").sort((a, b) => gapOf(b) - gapOf(a))[0];
    const known = rows.some((r) => r.tone !== "unknown");

    let headline: string;
    if (best && worst) {
        headline = t("sessions.insights.time_of_day.best_worst", {
            best: best.blk.phrase,
            best_rate: pct(best.b.winrate),
            worst: worst.blk.phrase,
            worst_rate: pct(worst.b.winrate),
            overall: pct(baseline.winrate),
        });
    } else if (best) {
        headline = t("sessions.insights.time_of_day.best", {
            best: best.blk.phrase,
            best_rate: pct(best.b.winrate),
            overall: pct(baseline.winrate),
        });
    } else if (worst) {
        headline = t("sessions.insights.time_of_day.worst", {
            worst: worst.blk.phrase,
            worst_rate: pct(worst.b.winrate),
            overall: pct(baseline.winrate),
        });
    } else {
        headline = known
            ? t("sessions.insights.time_of_day.none")
            : t("sessions.insights.time_of_day.unknown", { min: MIN_SAMPLE });
    }
    return {
        id: "time-of-day",
        title: t("sessions.insights.time_of_day.title"),
        headline,
        tone: best && worst ? "same" : worst ? "worse" : best ? "better" : known ? "same" : "unknown",
        bars: rows.map((r) => bar(r.blk.label, r.b, r.tone)),
    };
}

function dayType(games: Game[], tzOffsetMin: number): Finding {
    // 1970-01-01 was a Thursday, so day 0 maps to weekday index 4 (Sunday = 0).
    const isWeekend = (g: Game) => {
        const dow = mod(Math.floor(localOf(g.match, tzOffsetMin) / 86_400) + 4, 7);
        return dow === 0 || dow === 6;
    };
    const weekend = bucketOf(games.filter(isWeekend));
    const weekday = bucketOf(games.filter((g) => !isWeekend(g)));
    const tone = weekday.games < MIN_SAMPLE ? "unknown" : judge(weekend, weekday.winrate);
    const rates = { weekday_rate: pct(weekday.winrate), weekend_rate: pct(weekend.winrate) };
    const headline = {
        unknown: t("sessions.insights.day_type.unknown", {
            weekday: weekday.games,
            weekend: weekend.games,
            min: MIN_SAMPLE,
        }),
        better: t("sessions.insights.day_type.better", rates),
        worse: t("sessions.insights.day_type.worse", rates),
        same: t("sessions.insights.day_type.same", rates),
    }[tone];
    return {
        id: "day-type",
        title: t("sessions.insights.day_type.title"),
        headline,
        tone,
        bars: [
            bar(t("sessions.insights.day_type.weekdays"), weekday, "same"),
            bar(t("sessions.insights.day_type.weekends"), weekend, tone),
        ],
    };
}

export function buildFindings(sessions: Session[], tzOffsetMin: number): { baseline: Bucket; findings: Finding[] } {
    const games = gamesOf(sessions);
    const baseline = bucketOf(games);
    return {
        baseline,
        findings: [
            afterLosses(games),
            sessionLength(games, baseline.winrate),
            afterLossSplit(
                games,
                "swap-hero",
                t("sessions.insights.swap_hero.title"),
                (g) => g.prev!.heroId !== g.match.heroId,
                [t("sessions.insights.swap_hero.bar_switched"), t("sessions.insights.swap_hero.bar_same")],
                (tone, yes, no) =>
                    tone === "better"
                        ? t("sessions.insights.swap_hero.better", { yes, no })
                        : tone === "worse"
                          ? t("sessions.insights.swap_hero.worse", { yes, no })
                          : t("sessions.insights.swap_hero.same", { yes, no }),
            ),
            afterLossSplit(
                games,
                "requeue",
                t("sessions.insights.requeue.title"),
                (g) => g.match.startTime - (g.prev!.startTime + g.prev!.durationS) < QUICK_REQUEUE_S,
                [t("sessions.insights.requeue.bar_quick"), t("sessions.insights.requeue.bar_slow")],
                (tone, yes, no) =>
                    tone === "better"
                        ? t("sessions.insights.requeue.better", { yes, no })
                        : tone === "worse"
                          ? t("sessions.insights.requeue.worse", { yes, no })
                          : t("sessions.insights.requeue.same", { yes, no }),
            ),
            timeOfDay(games, baseline, tzOffsetMin),
            dayType(games, tzOffsetMin),
        ],
    };
}
