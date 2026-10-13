import {
    badgeParts,
    gainForWin,
    lossOutcome,
    rankTrack,
    STREET_BRAWL,
    subrankAt,
    winStreak,
    type RankInfo,
    type RankPoint,
} from "./rank";
import { filterScope, type Match } from "./stats";

export interface RankProjection {
    info: RankInfo;
    track: RankPoint[];
    /** Provisional matches whose rank change is modelled rather than confirmed. */
    modelled: number;
}

// Rank as it would stand after finished ranked matches the API has not returned yet. The points
// come from the modelled rules, so every number derived from a modelled row is unconfirmed. When
// the model cannot be trusted (unknown badge, placement games, top tier) the confirmed rank is
// returned untouched rather than a guess.
export function projectRank(matches: Match[], info: RankInfo | null, topTier?: number): RankProjection | null {
    if (!info) return null;
    const confirmed = rankTrack(matches).filter((p) => !p.provisional);
    const confirmedOnly: RankProjection = { info, track: confirmed, modelled: 0 };
    const last = confirmed.at(-1);
    if (!last) return confirmedOnly;

    const pending = filterScope(matches, "ranked")
        .filter((m) => m.provisional && m.gameMode !== STREET_BRAWL && m.startTime > last.startTime)
        .sort((a, b) => a.startTime - b.startTime);
    if (pending.length === 0) return confirmedOnly;

    const tier = badgeParts(info.badge)?.tier ?? 0;
    const modellable =
        (info.placementLeft ?? 0) === 0 &&
        (topTier === undefined || tier < topTier) &&
        pending.every((m) => m.rankBadge > 0 && !m.calibration);
    if (!modellable) return confirmedOnly;

    let flat = info.finalFlat;
    let shields = info.shieldsLeft ?? 0;
    let streak = winStreak(confirmed);
    const points: RankPoint[] = [];
    for (const m of pending) {
        let delta: number | null = null;
        let shielded = false;
        if (m.outcome === "win") {
            delta = gainForWin(streak + 1);
            streak++;
        } else if (m.outcome === "loss") {
            const loss = lossOutcome(flat - subrankAt(flat).start, shields);
            delta = -loss.lost;
            shielded = loss.usesShield;
            if (shielded) shields--;
            streak = 0;
        }
        flat = Math.max(0, flat + (delta ?? 0));
        points.push({
            matchId: m.matchId,
            heroId: m.heroId,
            startTime: m.startTime,
            badge: m.rankBadge,
            delta,
            outcome: m.outcome,
            demotionProtected: shielded,
            provisional: true,
        });
    }

    const sr = subrankAt(flat);
    return {
        info: {
            ...info,
            badge: sr.tier * 10 + sr.sub,
            finalFlat: flat,
            shieldsLeft: shields,
            lastMatchId: pending.at(-1)!.matchId,
        },
        track: [...confirmed, ...points],
        modelled: points.length,
    };
}
