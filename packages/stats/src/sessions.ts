import type { Match } from "./stats";

export const MIN_SAMPLE = 10;
export const SESSION_GAP_S = 90 * 60;

export interface Session {
    matches: Match[];
}

const endOf = (m: Match) => m.startTime + m.durationS;

export function groupSessions(matches: Match[], gapS: number = SESSION_GAP_S): Session[] {
    const sorted = [...matches].sort((a, b) => a.startTime - b.startTime);
    const sessions: Session[] = [];
    for (const m of sorted) {
        const cur = sessions.at(-1);
        const prev = cur?.matches.at(-1);
        if (cur && prev && m.startTime - endOf(prev) <= gapS) cur.matches.push(m);
        else sessions.push({ matches: [m] });
    }
    return sessions;
}

export interface SessionSummary {
    startTime: number;
    durationS: number;
    games: number;
    wins: number;
    losses: number;
    unscored: number;
    netDelta: number | null;
}

export function summarizeSession(s: Session): SessionSummary {
    const first = s.matches[0];
    const end = Math.max(...s.matches.map(endOf));
    const deltas = s.matches.map((m) => m.rankDelta).filter((d): d is number => d !== null);
    const wins = s.matches.filter((m) => m.outcome === "win").length;
    const losses = s.matches.filter((m) => m.outcome === "loss").length;
    return {
        startTime: first.startTime,
        durationS: end - first.startTime,
        games: wins + losses,
        wins,
        losses,
        unscored: s.matches.length - wins - losses,
        netDelta: deltas.length ? deltas.reduce((a, b) => a + b, 0) : null,
    };
}

export type Verdict = "excellent" | "good" | "neutral" | "bad";

const VERDICT_MIN_GAMES = 2;
const VERDICT_MIN_DELTA = 300;
const VERDICT_WINRATE = 0.6;
const EXCELLENT_MIN_GAMES_RANKED = 3;
const EXCELLENT_MIN_DELTA = 900;
const EXCELLENT_WINRATE_RANKED = 0.7;
const EXCELLENT_MIN_GAMES = 4;
const EXCELLENT_WINRATE = 0.8;

// With a rank change, it has to move by at least one win's worth and the winrate must not
// contradict it. Without one (unranked), the winrate alone decides.
export function sessionVerdict(s: SessionSummary): Verdict {
    if (s.games < VERDICT_MIN_GAMES) return "neutral";
    const winrate = s.wins / s.games;
    if (s.netDelta !== null) {
        if (
            s.games >= EXCELLENT_MIN_GAMES_RANKED &&
            s.netDelta >= EXCELLENT_MIN_DELTA &&
            winrate >= EXCELLENT_WINRATE_RANKED
        ) {
            return "excellent";
        }
        if (s.netDelta >= VERDICT_MIN_DELTA && winrate > 0.5) return "good";
        if (s.netDelta <= -VERDICT_MIN_DELTA && winrate < 0.5) return "bad";
        return "neutral";
    }
    if (s.games >= EXCELLENT_MIN_GAMES && winrate >= EXCELLENT_WINRATE) return "excellent";
    if (winrate >= VERDICT_WINRATE) return "good";
    if (winrate <= 1 - VERDICT_WINRATE) return "bad";
    return "neutral";
}

export interface Highlight {
    kind: "latest" | "best";
    session: Session;
    summary: SessionSummary;
    verdict: Verdict;
}

const RECENT_S = 3 * 86_400;
const BEST_LOOKBACK = 10;

const rankOf = (v: Verdict) => (v === "excellent" ? 2 : v === "good" ? 1 : 0);

// The latest session if it was good and recent, otherwise the best good-or-better session among
// the last few. Null when nothing qualifies, so the page shows no banner rather than a hollow one.
export function sessionHighlight(sessions: Session[], nowS: number): Highlight | null {
    const scoredSessions = sessions.map((session) => {
        const summary = summarizeSession(session);
        return { session, summary, verdict: sessionVerdict(summary) };
    });
    const last = scoredSessions.at(-1);
    if (!last) return null;
    if (rankOf(last.verdict) > 0 && nowS - (last.summary.startTime + last.summary.durationS) <= RECENT_S) {
        return { kind: "latest", ...last };
    }
    const best = scoredSessions
        .slice(-BEST_LOOKBACK)
        .filter((x) => rankOf(x.verdict) > 0)
        .sort(
            (a, b) =>
                rankOf(b.verdict) - rankOf(a.verdict) ||
                (b.summary.netDelta ?? 0) - (a.summary.netDelta ?? 0) ||
                b.summary.wins / b.summary.games - a.summary.wins / a.summary.games ||
                b.summary.startTime - a.summary.startTime,
        )[0];
    return best ? { kind: "best", ...best } : null;
}

export interface Bucket {
    games: number;
    wins: number;
    winrate: number | null;
}

export const bucket = (games: number, wins: number): Bucket => ({ games, wins, winrate: games ? wins / games : null });

export const scored = (s: Session) => s.matches.filter((m) => m.outcome !== "unscored");

// True only while the latest session is still live and ends on a loss streak of `limit` or more.
export function shouldSuggestBreak(
    sessions: Session[],
    limit: number,
    nowS: number,
    gapS: number = SESSION_GAP_S,
): boolean {
    const last = sessions.at(-1);
    if (!last) return false;
    const lastMatch = last.matches.at(-1)!;
    if (nowS - endOf(lastMatch) > gapS) return false;
    let run = 0;
    for (const m of [...scored(last)].reverse()) {
        if (m.outcome !== "loss") break;
        run++;
    }
    return run >= limit;
}
