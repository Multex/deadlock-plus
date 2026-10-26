import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import { badgeParts } from "../rank";
import type { Outcome } from "../stats";
import type { BestGame, Companion, Edition, EditionMonth } from "./types";

export type SignalId =
    | "streak"
    | "one_trick"
    | "explorer"
    | "debut"
    | "duo"
    | "nemesis"
    | "climb"
    | "slide"
    | "bounce_back"
    | "losing_then_winning"
    | "dry_spell"
    | "grinder"
    | "marathon"
    | "night_owl"
    | "weekender"
    | "big_game"
    | "swing_month"
    | "winning"
    | "losing"
    | "vs_last"
    | "mvp";

interface RankMove {
    startBadge: number;
    endBadge: number;
    /** Subranks, six a tier; negative on a slide. */
    steps: number;
}

interface WinLoss {
    wins: number;
    losses: number;
    winrate: number;
}

/** What the copy needs for each signal. Shares are 0-1. */
export interface SignalFacts {
    streak: { wins: number };
    one_trick: { heroId: number; games: number; wins: number; share: number };
    explorer: { heroes: number; newHeroes: number[] };
    debut: { heroId: number; games: number; wins: number };
    duo: { mate: Companion; share: number };
    nemesis: { rival: Companion; losses: number };
    climb: RankMove;
    slide: RankMove;
    bounce_back: { lowBadge: number; lowS: number; endBadge: number; steps: number };
    /** `wins` of the `of` scored matches from `turnS` on; `of - wins` is at most 1. */
    losing_then_winning: { losses: number; lossStartS: number; wins: number; of: number; turnS: number };
    /** `startS` is the first empty day or month; `endS` the first played one after the gap. */
    dry_spell: { unit: "day" | "month"; length: number; startS: number; endS: number };
    grinder: { daysPlayed: number; windowDays: number; share: number };
    marathon: { matches: number; startS: number; durationS: number };
    night_owl: { share: number; matches: number };
    weekender: { matches: number; share: number };
    big_game: { game: BestGame };
    /** `points` = winrate gain in whole percentage points. */
    swing_month: { month: EditionMonth; before: EditionMonth; points: number };
    winning: WinLoss;
    losing: WinLoss;
    /** Changes are relative (0.25 = up 25%); winrate ones are `null` when either side has too few scored. */
    vs_last: {
        previousId: string;
        matches: number;
        prevMatches: number;
        matchesChange: number;
        winrate: number | null;
        prevWinrate: number | null;
        winrateChange: number | null;
    };
    mvp: { placements: number; rated: number };
}

export type Signal = { [K in SignalId]: { id: K; strength: number; facts: SignalFacts[K] } }[SignalId];

// Editorial thresholds, not game facts. A signal at its threshold scores 0.5 and reaches 1 at its `FULL` value.
export const STREAK_MIN = 5;
export const ONE_TRICK_SHARE = 0.5;
export const EXPLORER_HEROES = 8;
export const EXPLORER_NEW = 3;
export const DEBUT_GAMES = 3;
export const DUO_SHARE = 0.4;
export const NEMESIS_LOSSES = 3;
export const RANK_STEPS = 3;
export const BOUNCE_STEPS = 3;
export const BOUNCE_AFTER = 10;
export const LOSS_RUN = 4;
export const TURN_WINDOW = 6;
export const TURN_WINS = 5;
export const DRY_DAYS = 5;
export const DRY_MONTHS = 1;
export const GRINDER_SHARE = 0.6;
export const MARATHON_MATCHES = 6;
export const NIGHT_SHARE = 0.3;
export const WEEKEND_SHARE = 0.6;
export const BIG_GAME_LETTERS: readonly MvpLetter[] = ["S+", "S", "S-"];
export const SWING_POINTS = 20;
export const SWING_MIN_GAMES = 10;
export const WINNING_RATE = 0.6;
export const LOSING_RATE = 0.4;
export const MIN_SCORED = 10;
export const VS_LAST_CHANGE = 0.2;
export const MVP_PLACEMENTS = 3;
/** Shares of a handful of matches say nothing; same floor as the winrate signals. */
export const SHARE_MIN_MATCHES = 10;

const FULL = {
    streak: 12,
    one_trick: 0.9,
    explorer_heroes: 16,
    explorer_new: 8,
    debut: 15,
    duo: 0.8,
    nemesis: 10,
    rank: 12,
    bounce: 10,
    loss_run: 10,
    dry_days: 14,
    dry_months: 3,
    grinder: 0.95,
    marathon: 12,
    night: 0.6,
    weekend: 0.9,
    swing: 50,
    winning: 0.8,
    losing: 0.2,
    vs_last: 1,
    mvp: 15,
} as const;

/** Breaks equal strengths, most telling first. */
const ORDER: readonly SignalId[] = [
    "climb",
    "slide",
    "big_game",
    "streak",
    "losing_then_winning",
    "bounce_back",
    "one_trick",
    "duo",
    "explorer",
    "debut",
    "swing_month",
    "nemesis",
    "marathon",
    "mvp",
    "winning",
    "losing",
    "grinder",
    "night_owl",
    "weekender",
    "dry_spell",
    "vs_last",
];

const EPS = 1e-9;
const atLeast = (x: number, min: number) => x >= min - EPS;
const SUBRANKS = 6;
const DAY_S = 86400;

const ramp = (x: number, at: number, full: number) =>
    Math.round((0.5 + 0.5 * Math.min(1, Math.max(0, (x - at) / (full - at)))) * 1000) / 1000;

function rankStep(badge: number): number {
    const p = badgeParts(badge);
    return p ? p.tier * SUBRANKS + (p.sub - 1) : 0;
}

type Detector = (e: Edition, previous: Edition | null) => Signal[];

const streak: Detector = ({ longestWin }) =>
    longestWin >= STREAK_MIN
        ? [{ id: "streak", strength: ramp(longestWin, STREAK_MIN, FULL.streak), facts: { wins: longestWin } }]
        : [];

const oneTrick: Detector = ({ heroes, stats }) => {
    const top = heroes[0];
    if (!top || stats.matches < SHARE_MIN_MATCHES) return [];
    const share = top.games / stats.matches;
    if (!atLeast(share, ONE_TRICK_SHARE)) return [];
    return [
        {
            id: "one_trick",
            strength: ramp(share, ONE_TRICK_SHARE, FULL.one_trick),
            facts: { heroId: top.heroId, games: top.games, wins: top.wins, share },
        },
    ];
};

const explorer: Detector = ({ heroes, newHeroes }) => {
    if (heroes.length < EXPLORER_HEROES && newHeroes.length < EXPLORER_NEW) return [];
    const strength = Math.max(
        heroes.length >= EXPLORER_HEROES ? ramp(heroes.length, EXPLORER_HEROES, FULL.explorer_heroes) : 0,
        newHeroes.length >= EXPLORER_NEW ? ramp(newHeroes.length, EXPLORER_NEW, FULL.explorer_new) : 0,
    );
    return [{ id: "explorer", strength, facts: { heroes: heroes.length, newHeroes: [...newHeroes] } }];
};

const debut: Detector = ({ heroes, newHeroes }) => {
    const fresh = new Set(newHeroes);
    const best = heroes.filter((h) => fresh.has(h.heroId)).sort((a, b) => b.games - a.games)[0];
    if (!best || best.games < DEBUT_GAMES) return [];
    return [
        {
            id: "debut",
            strength: ramp(best.games, DEBUT_GAMES, FULL.debut),
            facts: { heroId: best.heroId, games: best.games, wins: best.wins },
        },
    ];
};

const duo: Detector = ({ mates, stats }) => {
    const top = mates[0];
    if (!top || stats.matches < SHARE_MIN_MATCHES) return [];
    const share = top.matches / stats.matches;
    if (!atLeast(share, DUO_SHARE)) return [];
    return [{ id: "duo", strength: ramp(share, DUO_SHARE, FULL.duo), facts: { mate: top, share } }];
};

const nemesis: Detector = ({ nemesis: rival }) => {
    if (!rival) return [];
    const losses = rival.matches - rival.wins;
    if (losses < NEMESIS_LOSSES) return [];
    return [{ id: "nemesis", strength: ramp(losses, NEMESIS_LOSSES, FULL.nemesis), facts: { rival, losses } }];
};

const rankMove: Detector = ({ rank }) => {
    if (!rank) return [];
    const steps = rankStep(rank.endBadge) - rankStep(rank.startBadge);
    const facts = { startBadge: rank.startBadge, endBadge: rank.endBadge, steps };
    const strength = ramp(Math.abs(steps), RANK_STEPS, FULL.rank);
    if (steps >= RANK_STEPS) return [{ id: "climb", strength, facts }];
    if (steps <= -RANK_STEPS) return [{ id: "slide", strength, facts }];
    return [];
};

const bounceBack: Detector = ({ rankSeries }) => {
    if (!rankSeries || rankSeries.length <= BOUNCE_AFTER) return [];
    const end = rankSeries[rankSeries.length - 1];
    const low = rankSeries.slice(BOUNCE_AFTER).reduce((lo, p) => (rankStep(p.badge) < rankStep(lo.badge) ? p : lo));
    const steps = rankStep(end.badge) - rankStep(low.badge);
    if (steps < BOUNCE_STEPS) return [];
    return [
        {
            id: "bounce_back",
            strength: ramp(steps, BOUNCE_STEPS, FULL.bounce),
            facts: { lowBadge: low.badge, lowS: low.startS, endBadge: end.badge, steps },
        },
    ];
};

/** The longest loss run followed by at least 5 wins in the next 6; the window then grows while it holds one loss. */
const losingThenWinning: Detector = ({ tape }) => {
    if (!tape) return [];
    const scored = tape.filter((t) => t[2] !== "unscored").map((t) => ({ startS: t[0], outcome: t[2] as Outcome }));
    let best: SignalFacts["losing_then_winning"] | null = null;
    for (let i = 0; i < scored.length;) {
        if (scored[i].outcome !== "loss") {
            i++;
            continue;
        }
        let j = i;
        while (j < scored.length && scored[j].outcome === "loss") j++;
        const run = j - i;
        const after = scored.slice(j);
        if (run >= LOSS_RUN && after.length >= TURN_WINDOW) {
            const firstWins = after.slice(0, TURN_WINDOW).filter((m) => m.outcome === "win").length;
            if (firstWins >= TURN_WINS) {
                const allowed = TURN_WINDOW - TURN_WINS;
                let of = 0;
                let lost = 0;
                for (const m of after) {
                    if (m.outcome === "loss") {
                        if (lost === allowed) break;
                        lost++;
                    }
                    of++;
                }
                if (!best || run > best.losses) {
                    best = { losses: run, lossStartS: scored[i].startS, wins: of - lost, of, turnS: after[0].startS };
                }
            }
        }
        i = j;
    }
    return best
        ? [{ id: "losing_then_winning", strength: ramp(best.losses, LOSS_RUN, FULL.loss_run), facts: best }]
        : [];
};

function longestGap<T extends { matches: number }>(
    buckets: readonly T[],
    startOf: (b: T) => number,
): { length: number; startS: number; endS: number } | null {
    let best: { length: number; startS: number; endS: number } | null = null;
    let lastPlayed = -1;
    buckets.forEach((b, i) => {
        if (b.matches === 0) return;
        const length = i - lastPlayed - 1;
        if (lastPlayed >= 0 && length > 0 && (!best || length > best.length)) {
            best = { length, startS: startOf(buckets[lastPlayed + 1]), endS: startOf(b) };
        }
        lastPlayed = i;
    });
    return best;
}

const drySpell: Detector = ({ days, months }) => {
    if (days) {
        const gap = longestGap(days, (d) => d.dayStartS);
        if (!gap || gap.length < DRY_DAYS) return [];
        return [
            { id: "dry_spell", strength: ramp(gap.length, DRY_DAYS, FULL.dry_days), facts: { unit: "day", ...gap } },
        ];
    }
    if (months) {
        const gap = longestGap(months, (m) => m.monthStartS);
        if (!gap || gap.length < DRY_MONTHS) return [];
        return [
            {
                id: "dry_spell",
                strength: ramp(gap.length, DRY_MONTHS, FULL.dry_months),
                facts: { unit: "month", ...gap },
            },
        ];
    }
    return [];
};

const grinder: Detector = ({ stats, days, window }) => {
    const windowDays = days?.length ?? Math.round((window.endS - window.startS) / DAY_S);
    if (windowDays <= 0) return [];
    const share = stats.daysPlayed / windowDays;
    if (!atLeast(share, GRINDER_SHARE)) return [];
    return [
        {
            id: "grinder",
            strength: ramp(share, GRINDER_SHARE, FULL.grinder),
            facts: { daysPlayed: stats.daysPlayed, windowDays, share },
        },
    ];
};

const marathon: Detector = ({ stats: { longestSession } }) =>
    longestSession && longestSession.matches >= MARATHON_MATCHES
        ? [
              {
                  id: "marathon",
                  strength: ramp(longestSession.matches, MARATHON_MATCHES, FULL.marathon),
                  facts: { ...longestSession },
              },
          ]
        : [];

const nightOwl: Detector = ({ stats: { nightShare, matches } }) =>
    nightShare !== null && matches >= SHARE_MIN_MATCHES && atLeast(nightShare, NIGHT_SHARE)
        ? [
              {
                  id: "night_owl",
                  strength: ramp(nightShare, NIGHT_SHARE, FULL.night),
                  facts: { share: nightShare, matches },
              },
          ]
        : [];

const weekdayFormat = new Map<string, Intl.DateTimeFormat>();
function isWeekend(unixS: number, tz: string): boolean {
    let f = weekdayFormat.get(tz);
    if (!f) {
        f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
        weekdayFormat.set(tz, f);
    }
    const day = f.format(unixS * 1000);
    return day === "Sat" || day === "Sun";
}

const weekender: Detector = ({ stats, days, tape, window: { tz } }) => {
    if (stats.matches < SHARE_MIN_MATCHES) return [];
    let total = 0;
    let weekend = 0;
    if (days) {
        for (const d of days) {
            total += d.matches;
            if (d.matches && isWeekend(d.dayStartS, tz)) weekend += d.matches;
        }
    } else if (tape) {
        total = tape.length;
        weekend = tape.filter((t) => isWeekend(t[0], tz)).length;
    }
    if (!total) return [];
    const share = weekend / total;
    if (!atLeast(share, WEEKEND_SHARE)) return [];
    return [
        { id: "weekender", strength: ramp(share, WEEKEND_SHARE, FULL.weekend), facts: { matches: weekend, share } },
    ];
};

const bigGame: Detector = ({ bestGame }) => {
    const rank = bestGame?.letter ? BIG_GAME_LETTERS.indexOf(bestGame.letter) : -1;
    if (!bestGame || rank < 0) return [];
    // S- scores 0.5, S+ scores 1.
    const above = BIG_GAME_LETTERS.length - 1 - rank;
    return [{ id: "big_game", strength: ramp(above, 0, BIG_GAME_LETTERS.length - 1), facts: { game: bestGame } }];
};

const swingMonth: Detector = ({ months }) => {
    if (!months) return [];
    let best: SignalFacts["swing_month"] | null = null;
    for (let i = 1; i < months.length; i++) {
        const [before, month] = [months[i - 1], months[i]];
        if (before.matches < SWING_MIN_GAMES || month.matches < SWING_MIN_GAMES) continue;
        // Cross-multiplied so an exact 20-point swing is not lost to float error.
        const gain = 100 * (month.wins * before.matches - before.wins * month.matches);
        if (gain < SWING_POINTS * month.matches * before.matches) continue;
        const points = Math.round(gain / (month.matches * before.matches));
        if (!best || points > best.points) best = { month, before, points };
    }
    return best ? [{ id: "swing_month", strength: ramp(best.points, SWING_POINTS, FULL.swing), facts: best }] : [];
};

const record: Detector = ({ stats: { wins, losses } }) => {
    const scored = wins + losses;
    if (scored < MIN_SCORED) return [];
    const winrate = wins / scored;
    const facts = { wins, losses, winrate };
    if (atLeast(winrate, WINNING_RATE))
        return [{ id: "winning", strength: ramp(winrate, WINNING_RATE, FULL.winning), facts }];
    if (winrate <= LOSING_RATE + EPS)
        return [{ id: "losing", strength: ramp(LOSING_RATE - winrate, 0, LOSING_RATE - FULL.losing), facts }];
    return [];
};

const scoredRate = ({ wins, losses }: Edition["stats"]) =>
    wins + losses >= MIN_SCORED ? wins / (wins + losses) : null;

const vsLast: Detector = (e, previous) => {
    if (!previous || previous.window.kind !== e.window.kind || previous.id === e.id || !previous.stats.matches)
        return [];
    const matchesChange = e.stats.matches / previous.stats.matches - 1;
    const winrate = scoredRate(e.stats);
    const prevWinrate = scoredRate(previous.stats);
    const winrateChange = winrate !== null && prevWinrate ? winrate / prevWinrate - 1 : null;
    const moved = Math.max(Math.abs(matchesChange), Math.abs(winrateChange ?? 0));
    if (!atLeast(moved, VS_LAST_CHANGE)) return [];
    return [
        {
            id: "vs_last",
            strength: ramp(moved, VS_LAST_CHANGE, FULL.vs_last),
            facts: {
                previousId: previous.id,
                matches: e.stats.matches,
                prevMatches: previous.stats.matches,
                matchesChange,
                winrate,
                prevWinrate,
                winrateChange,
            },
        },
    ];
};

const mvp: Detector = ({ combat }) => {
    if (!combat) return [];
    const placements = combat.reduce((sum, row) => sum + row.mvpRankCounts.reduce((a, b) => a + b, 0), 0);
    if (placements < MVP_PLACEMENTS) return [];
    const rated = combat.reduce((sum, row) => sum + row.mvpRated, 0);
    return [{ id: "mvp", strength: ramp(placements, MVP_PLACEMENTS, FULL.mvp), facts: { placements, rated } }];
};

const DETECTORS: readonly Detector[] = [
    streak,
    oneTrick,
    explorer,
    debut,
    duo,
    nemesis,
    rankMove,
    bounceBack,
    losingThenWinning,
    drySpell,
    grinder,
    marathon,
    nightOwl,
    weekender,
    bigGame,
    swingMonth,
    record,
    vsLast,
    mvp,
];

/**
 * What is notable about the player in this edition, strongest first (strength 0-1, ties in `ORDER`).
 * `previous` is the same kind's last edition, for `vs_last`. Editions frozen before `tape` existed get every
 * signal but `losing_then_winning`; `weekender` reads `days` and only falls back to the tape without them.
 */
export function editionSignals(edition: Edition, previous?: Edition | null): Signal[] {
    return DETECTORS.flatMap((d) => d(edition, previous ?? null)).sort(
        (a, b) => b.strength - a.strength || ORDER.indexOf(a.id) - ORDER.indexOf(b.id),
    );
}
