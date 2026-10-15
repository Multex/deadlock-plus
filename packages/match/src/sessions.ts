import {
    groupSessions,
    sessionHighlight,
    sessionVerdict,
    summarizeSession,
    type Highlight,
    type Session,
    type Verdict,
} from "@deadlock-plus/stats/sessions";
import type { Match } from "@deadlock-plus/stats/stats";
import type { MatchRow } from "./list";
import { PAGE_SIZE, type Page } from "./pagination";

export interface SessionGroup {
    key: string;
    startTime: number;
    durationS: number;
    wins: number;
    losses: number;
    unscored: number;
    games: number;
    netDelta: number | null;
    verdict: Verdict;
    /** Set on the one session the stats highlight picks, if any. */
    highlight: Highlight["kind"] | null;
    /** Matches in the whole session that are still provisional. */
    syncing: number;
    /** Only the rows the filters let through, newest first. */
    rows: MatchRow[];
}

// The stats session helpers read only timing, outcome and rank change, so the mode fields stay zero.
const asMatch = (r: MatchRow): Match => ({
    matchId: r.matchId,
    heroId: r.heroId,
    startTime: r.startTime,
    matchMode: 0,
    gameMode: 0,
    outcome: r.outcome,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    netWorth: r.souls,
    durationS: r.durationS,
    rankBadge: r.rankBadge,
    rankDelta: r.rankDelta,
    calibration: r.calibration,
    demotionProtected: false,
});

/**
 * Sessions come from `all`, so a header always describes the whole session even when filters
 * hide some of its matches. Groups without a visible row are dropped. Newest first.
 */
export function groupBySession(visible: MatchRow[], all: MatchRow[], nowS: number): SessionGroup[] {
    const rowOf = new Map<Match, MatchRow>();
    const sessions = groupSessions(
        all.map((r) => {
            const m = asMatch(r);
            rowOf.set(m, r);
            return m;
        }),
    );
    const highlight = sessionHighlight(sessions, nowS);
    const shown = new Set(visible);

    const groups: SessionGroup[] = [];
    for (const session of [...sessions].reverse()) {
        const own = session.matches.map((m) => rowOf.get(m)!);
        const rows = own.filter((r) => shown.has(r)).reverse();
        if (rows.length === 0) continue;
        const syncing = own.filter((r) => r.source === "provisional").length;
        const kind = highlight?.session === session ? highlight.kind : null;
        groups.push(toGroup(session, rows, kind, syncing));
    }
    return groups;
}

function toGroup(
    session: Session,
    rows: MatchRow[],
    highlight: Highlight["kind"] | null,
    syncing: number,
): SessionGroup {
    const s = summarizeSession(session);
    return {
        key: `session-${session.matches[0].matchId}`,
        startTime: s.startTime,
        durationS: s.durationS,
        wins: s.wins,
        losses: s.losses,
        unscored: s.unscored,
        games: s.games,
        netDelta: s.netDelta,
        verdict: sessionVerdict(s),
        highlight,
        syncing,
        rows,
    };
}

/**
 * Whole sessions per page: a page closes once it holds `size` matches or more, so a session
 * longer than a page gets one to itself. `total` counts matches, not sessions.
 */
export function paginateSessions(groups: SessionGroup[], page: number, size = PAGE_SIZE): Page<SessionGroup> {
    const pages: SessionGroup[][] = [];
    let current: SessionGroup[] = [];
    let count = 0;
    let total = 0;
    for (const g of groups) {
        if (g.rows.length > size && current.length > 0) {
            pages.push(current);
            current = [];
            count = 0;
        }
        current.push(g);
        count += g.rows.length;
        total += g.rows.length;
        if (count >= size) {
            pages.push(current);
            current = [];
            count = 0;
        }
    }
    if (current.length > 0 || pages.length === 0) pages.push(current);

    const n = Math.min(pages.length, Math.max(1, Math.floor(page) || 1));
    return { items: pages[n - 1], page: n, pageCount: pages.length, total };
}
