import { filterScope, type Match, type Outcome } from "./stats";

export interface RankTier {
    tier: number;
    name: string;
    color: string;
    image: string | null;
    /** Remote url of `image`, for Discord. Absent when the tier was not merged with local art. */
    apiImage?: string | null;
}

export interface BadgeParts {
    tier: number;
    sub: number;
}

const UNIT = 1000;
const UNITS_PER_TIER = 7;
const SUBRANKS_PER_TIER = 6;

// The API encodes a badge as tier digits followed by one subrank digit; 0 means unranked.
export function badgeParts(badge: number | null): BadgeParts | null {
    if (!badge || badge <= 0) return null;
    return { tier: Math.floor(badge / 10), sub: badge % 10 };
}

export function parseRanks(body: unknown): RankTier[] {
    if (!Array.isArray(body)) return [];
    const out: RankTier[] = [];
    for (const row of body) {
        if (typeof row !== "object" || row === null) continue;
        const r = row as Record<string, unknown>;
        if (typeof r.tier !== "number" || typeof r.name !== "string") continue;
        const images = (typeof r.images === "object" && r.images !== null ? r.images : {}) as Record<string, unknown>;
        const image = [images.large_webp, images.large].find((v): v is string => typeof v === "string") ?? null;
        out.push({ tier: r.tier, name: r.name, color: typeof r.color === "string" ? r.color : "#888888", image });
    }
    return out;
}

export interface RankInfo {
    badge: number;
    finalFlat: number;
    shieldsLeft: number | null;
    placementLeft: number | null;
    lastMatchId: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseRankInfo(body: unknown): RankInfo | null {
    if (typeof body !== "object" || body === null) return null;
    const last = (body as Record<string, unknown>).last_match;
    if (typeof last !== "object" || last === null) return null;
    const l = last as Record<string, unknown>;
    const badge = num((body as Record<string, unknown>).badge);
    const finalFlat = num(l.player_rank_final_flat_progress);
    if (!badge || finalFlat === null) return null;

    const shields = num(l.player_rank_initial_demotion_protection_games);
    return {
        badge,
        finalFlat,
        shieldsLeft:
            shields === null
                ? null
                : Math.max(0, shields - (l.player_rank_consumed_demotion_protection === true ? 1 : 0)),
        placementLeft: num(l.player_rank_initial_calibration_games),
        lastMatchId: num(l.match_id),
    };
}

export interface Subrank extends BadgeParts {
    start: number;
    span: number;
}

// Progress is one running total. Each tier is 7000 points: subranks 1-5 take 1000 each and the
// sixth takes the last 2000. Checked against a real account's history; the API docs only say 1000.
export function subrankAt(flat: number): Subrank {
    const tier = Math.floor(flat / (UNIT * UNITS_PER_TIER)) + 1;
    const unit = Math.floor((flat % (UNIT * UNITS_PER_TIER)) / UNIT);
    const sub = Math.min(unit + 1, SUBRANKS_PER_TIER);
    const last = sub === SUBRANKS_PER_TIER;
    return {
        tier,
        sub,
        start: (tier - 1) * UNIT * UNITS_PER_TIER + (sub - 1) * UNIT,
        span: last ? UNIT * 2 : UNIT,
    };
}

export interface Standing extends BadgeParts {
    within: number | null;
    span: number;
}

// The API's own badge wins for the name: a loss that crosses a boundary can still show the old
// badge, so the progress bar is only shown when the progress agrees with it.
export function standing(info: RankInfo): Standing {
    const sr = subrankAt(info.finalFlat);
    const shown = badgeParts(info.badge)!;
    const agrees = shown.tier === sr.tier && shown.sub === sr.sub;
    return { ...shown, within: agrees ? info.finalFlat - sr.start : null, span: sr.span };
}

export const STREET_BRAWL = 4;

const BASE_GAIN = 300;
const LOSS = 300;

// Win 1-2 pay the base; from the third consecutive win the bonus grows by 20 per win up to 430.
export function gainForWin(streak: number): number {
    if (streak <= 2) return BASE_GAIN;
    return Math.min(370 + (streak - 3) * 20, 430);
}

export interface LossOutcome {
    lost: number;
    usesShield: boolean;
    demotes: boolean;
}

// A loss costs 300. Below 300 progress a shield absorbs the rest: you lose only what you have.
// Without a shield the full 300 applies and the badge drops.
export function lossOutcome(within: number, shields: number): LossOutcome {
    if (within >= LOSS) return { lost: LOSS, usesShield: false, demotes: false };
    if (shields > 0) return { lost: within, usesShield: true, demotes: false };
    return { lost: LOSS, usesShield: false, demotes: true };
}

export function winStreak(track: RankPoint[]): number {
    let run = 0;
    for (const p of [...track].reverse()) {
        if (p.outcome === "unscored") continue;
        if (p.outcome !== "win") break;
        run++;
    }
    return run;
}

// Consecutive wins needed to fill the rest of the subrank, continuing the current streak.
export function winsToNext(within: number, span: number, streak: number): number {
    let need = span - within;
    let n = 0;
    let s = streak;
    while (need > 0) {
        s++;
        n++;
        need -= gainForWin(s);
    }
    return n;
}

export interface RankPoint {
    matchId: number;
    heroId: number;
    startTime: number;
    badge: number;
    delta: number | null;
    outcome: Outcome;
    demotionProtected: boolean;
    provisional?: boolean;
}

export function rankTrack(matches: Match[]): RankPoint[] {
    return filterScope(matches, "ranked")
        .filter((m) => m.rankBadge > 0 && (!m.provisional || m.gameMode !== STREET_BRAWL))
        .sort((a, b) => a.startTime - b.startTime)
        .map((m) => ({
            matchId: m.matchId,
            heroId: m.heroId,
            startTime: m.startTime,
            badge: m.rankBadge,
            delta: m.rankDelta,
            outcome: m.outcome,
            demotionProtected: m.demotionProtected,
            provisional: m.provisional === true,
        }));
}

export interface ProgressPoint extends RankPoint {
    flat: number;
}

// The API only reports the final progress of the latest match, so earlier values are rebuilt by
// undoing each later match's delta.
export function progressSeries(track: RankPoint[], info: RankInfo): ProgressPoint[] {
    if (track.length === 0) return [];
    const found = track.findIndex((p) => p.matchId === info.lastMatchId);
    const end = found === -1 ? track.length - 1 : found;
    const out: ProgressPoint[] = new Array(end + 1);
    let flat = info.finalFlat;
    for (let i = end; i >= 0; i--) {
        out[i] = { ...track[i], flat };
        flat -= track[i].delta ?? 0;
    }
    return out;
}

export interface RankChange {
    matchId: number;
    startTime: number;
    from: number;
    to: number;
    promoted: boolean;
}

export function rankChanges(track: RankPoint[]): RankChange[] {
    const out: RankChange[] = [];
    for (let i = 1; i < track.length; i++) {
        const from = track[i - 1].badge;
        const to = track[i].badge;
        if (from !== to)
            out.push({ matchId: track[i].matchId, startTime: track[i].startTime, from, to, promoted: to > from });
    }
    return out.reverse();
}

export interface WindowStats {
    games: number;
    wins: number;
    losses: number;
    winrate: number | null;
    net: number;
    shieldsUsed: number;
}

export function windowStats(track: RankPoint[], n: number): WindowStats {
    const recent = track.slice(-n);
    const wins = recent.filter((p) => p.outcome === "win");
    const losses = recent.filter((p) => p.outcome === "loss");
    const scored = wins.length + losses.length;
    return {
        games: scored,
        wins: wins.length,
        losses: losses.length,
        winrate: scored ? wins.length / scored : null,
        net: recent.reduce((s, p) => s + (p.delta ?? 0), 0),
        shieldsUsed: recent.filter((p) => p.demotionProtected).length,
    };
}
