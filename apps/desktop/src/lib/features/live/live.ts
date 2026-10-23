import type { LivePhase } from "@deadlock-plus/ipc-types/LivePhase";
import type { LiveSide } from "@deadlock-plus/ipc-types/LiveSide";
import type { LiveTeam } from "@deadlock-plus/ipc-types/LiveTeam";
import type { LivePlayer } from "@deadlock-plus/ipc-types/LivePlayer";
import { badgeParts, type BadgeParts } from "@deadlock-plus/stats/rank";

export type StateIcon = "power" | "menu" | "search" | "flag" | "swords" | "trophy" | "loader";

export interface StateLine {
    key: string;
    hint: string;
    icon: StateIcon;
}

const LINES: Record<LivePhase, StateLine> = {
    gameClosed: { key: "live.state.game_closed", hint: "live.state.game_closed_hint", icon: "power" },
    menus: { key: "live.state.menus", hint: "live.state.menus_hint", icon: "menu" },
    queuing: { key: "live.state.queuing", hint: "live.state.queuing_hint", icon: "search" },
    pregame: { key: "live.state.pregame", hint: "live.state.pregame_hint", icon: "flag" },
    inMatch: { key: "live.state.in_match", hint: "live.state.in_match_hint", icon: "swords" },
    postMatch: { key: "live.state.post_match", hint: "live.state.post_match_hint", icon: "trophy" },
};

const LOADING: StateLine = {
    key: "live.state.loading_match",
    hint: "live.state.loading_match_hint",
    icon: "loader",
};

/** `matchPresent` is whether player data has been read; only pregame and in-match care. */
export function stateLine(phase: LivePhase, matchPresent = true): StateLine {
    if (!matchPresent && (phase === "pregame" || phase === "inMatch")) return LOADING;
    return LINES[phase];
}

export interface LiveBarItem {
    key: string;
    clock: string | null;
}

export function liveBarItem(phase: LivePhase, clockSecs: number | null, paused: boolean): LiveBarItem | null {
    switch (phase) {
        case "queuing":
            return { key: "shell.statusbar.live.queuing", clock: null };
        case "pregame":
            return { key: "shell.statusbar.live.pregame", clock: null };
        case "inMatch":
            return {
                key: paused ? "shell.statusbar.live.paused" : "shell.statusbar.live.in_match",
                clock: formatClock(clockSecs),
            };
        case "postMatch":
            return { key: "shell.statusbar.live.post_match", clock: null };
        default:
            return null;
    }
}

export const BOARD_LINGER_MS = 20_000;
const MIN_CLOCK_SECS = 60;

export function soulsPerMinute(souls: number | null, clockSecs: number | null): number | null {
    if (souls === null || clockSecs === null || clockSecs < MIN_CLOCK_SECS) return null;
    return souls / (clockSecs / 60);
}

export function killParticipation(
    kills: number | null,
    assists: number | null,
    teamKills: number | null,
): number | null {
    if (kills === null || assists === null || teamKills === null || teamKills <= 0) return null;
    return (kills + assists) / teamKills;
}

export function formatPercent(fraction: number | null): string | null {
    return fraction === null ? null : `${Math.round(fraction * 100)}%`;
}

/** How far a team's souls are ahead of (+) or behind (-) the other team, as a signed whole percent. */
export function soulsLead(teamSouls: number | null, totalSouls: number): string | null {
    if (teamSouls === null) return null;
    const other = totalSouls - teamSouls;
    if (other <= 0) return null;
    const pct = Math.round(((teamSouls - other) / other) * 100);
    return pct > 0 ? `+${pct}%` : `${pct}%`;
}

export function formatCompact(value: number | null): string | null {
    if (value === null) return null;
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

export function rankView(rank: number | null): BadgeParts | null {
    return badgeParts(rank);
}

export function heroInitials(name: string | null): string {
    const words = (name ?? "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
    const letters = (w: string) => w.match(/[\p{L}\p{N}]/gu) ?? [];
    const picked =
        words.length >= 2 ? [letters(words[0])[0], letters(words[1])[0]] : letters(words[0] ?? "").slice(0, 2);
    return picked.length ? picked.join("").toUpperCase() : "?";
}

export interface TeamTotals {
    souls: number | null;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
    heroDamage: number | null;
    objectiveDamage: number | null;
    healing: number | null;
}

type Column = keyof TeamTotals;

function sumColumn(players: LivePlayer[], column: Column): number | null {
    let total: number | null = null;
    for (const p of players) {
        const v = p[column];
        if (v !== null) total = (total ?? 0) + v;
    }
    return total;
}

export function teamTotals(players: LivePlayer[]): TeamTotals {
    return {
        souls: sumColumn(players, "souls"),
        kills: sumColumn(players, "kills"),
        deaths: sumColumn(players, "deaths"),
        assists: sumColumn(players, "assists"),
        heroDamage: sumColumn(players, "heroDamage"),
        objectiveDamage: sumColumn(players, "objectiveDamage"),
        healing: sumColumn(players, "healing"),
    };
}

/** `sincePostMatchMs` is how long ago the phase became `postMatch`, or `null` if it has not. */
export function boardVisible(phase: LivePhase, sincePostMatchMs: number | null): boolean {
    switch (phase) {
        case "pregame":
        case "inMatch":
            return true;
        case "postMatch":
        case "menus":
        case "gameClosed":
            return sincePostMatchMs !== null && sincePostMatchMs < BOARD_LINGER_MS;
        default:
            return false;
    }
}

export function postMatchStart(phase: LivePhase, current: number | null, now: number): number | null {
    switch (phase) {
        case "postMatch":
            return current ?? now;
        case "menus":
        case "gameClosed":
            return current;
        default:
            return null;
    }
}

export function formatClock(secs: number | null): string | null {
    if (secs === null) return null;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const ss = String(secs % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function orderTeams(teams: LiveTeam[], yourSide: LiveSide | null): LiveTeam[] {
    const first = yourSide ?? "amber";
    return [...teams].sort((a, b) => Number(b.side === first) - Number(a.side === first));
}

export interface HeroSwap {
    key: number;
    from: number;
    to: number;
}

export interface SwapTracker {
    /** Hero per lobby slot as last seen before the match started. */
    seen: Record<number, number>;
    swaps: HeroSwap[];
}

export const NO_SWAPS: SwapTracker = { seen: {}, swaps: [] };

const validHero = (id: number | null): id is number => id !== null && id > 0;

/**
 * Remembers heroes through pregame and, once the match starts, lists the players whose hero differs.
 * A player with no hero seen in pregame (joined late) never produces a swap.
 */
export function trackSwaps(prev: SwapTracker, phase: LivePhase, players: LivePlayer[]): SwapTracker {
    switch (phase) {
        case "gameClosed":
        case "menus":
        case "queuing":
            return prev === NO_SWAPS ? prev : NO_SWAPS;
        case "pregame": {
            const seen = { ...prev.seen };
            for (const p of players) if (validHero(p.heroId)) seen[p.key] = p.heroId;
            return { seen, swaps: [] };
        }
        case "inMatch": {
            const swaps = new Map(prev.swaps.map((s) => [s.key, s]));
            for (const p of players) {
                const from = prev.seen[p.key];
                if (from !== undefined && validHero(p.heroId) && p.heroId !== from) {
                    swaps.set(p.key, { key: p.key, from, to: p.heroId });
                }
            }
            return { seen: prev.seen, swaps: [...swaps.values()] };
        }
        default:
            return prev;
    }
}
