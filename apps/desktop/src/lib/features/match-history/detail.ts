export type MatchTeam = "hidden-king" | "archmother";
export type DetailSource = "api" | "provisional";
export type PlayerOutcome = "win" | "loss" | "unscored";

export const MATCH_TEAMS: readonly MatchTeam[] = ["hidden-king", "archmother"];

export interface Position {
    x: number;
    y: number;
    z: number;
}

export interface MatchItem {
    itemId: number;
    boughtS: number;
    /** Absent while the item was still held at match end. */
    soldS?: number;
    upgradeId: number;
    imbuedAbilityId?: number;
    /** Bit 0 is set once the row's item or ability is owned, one more bit per upgrade. Absent when not recorded. */
    upgradeBits?: number;
}

export interface MatchDeath {
    timeS: number;
    killerSlot: number;
    position?: Position;
    killerPosition?: Position;
    respawnS?: number;
    timeToKillS?: number;
}

/** Cumulative values at one sample time. */
export interface SeriesPoint {
    timeS: number;
    souls: number;
    playerDamage: number;
    healing: number;
    kills: number;
    deaths: number;
    assists: number;
}

export interface PlayerRank {
    /** Tier * 10 + subrank, the value `rank-badge` renders. */
    displayRank: number;
    progressBefore: number;
    progressAfter: number;
    progressChange: number;
    calibrationGamesLeft: number;
    demotionProtectionGamesLeft: number;
    consumedDemotionProtection: boolean;
    winStreak: number;
}

export interface MatchAbility {
    abilityId: number;
    value: number;
}

export interface MatchAccolade {
    accoladeId: number;
    value: number;
    tier: number;
}

export interface MatchPlayer {
    /** Slot within the match, 1 to 12. Killers and damage matrix entries refer to it. */
    slot: number;
    accountId: number;
    /** Filled in by name resolution; adapters leave it unset. */
    name?: string;
    team: MatchTeam;
    heroId: number;
    lane?: number;
    level: number;
    kills: number;
    deaths: number;
    assists: number;
    souls: number;
    lastHits: number;
    denies: number;
    playerDamage: number;
    healing: number;
    mvpRank?: number;
    outcome: PlayerOutcome;
    items: MatchItem[];
    deathLog: MatchDeath[];
    series: SeriesPoint[];
    abilities: MatchAbility[];
    accolades: MatchAccolade[];
    rank?: PlayerRank;
}

export interface MatchTeamDetail {
    team: MatchTeam;
    /** Sum of the team's kills. */
    score: number;
    /** Absent when the source does not report one for this team. */
    averageBadge?: number;
    players: MatchPlayer[];
}

export interface MatchObjective {
    objectiveId: number;
    /** Team that owns the objective. */
    team: MatchTeam;
    /** Absent when the objective was never destroyed. */
    destroyedS?: number;
    firstDamageS?: number;
    creepDamage: number;
    playerDamage: number;
    spiritDamage: number;
}

export interface MidBossEvent {
    killedBy?: MatchTeam;
    claimedBy?: MatchTeam;
    destroyedS: number;
}

export interface DamageSource {
    name: string;
    statType: number;
}

/** Cumulative damage dealt by one player to one target through one source, sampled at `sampleTimesS`. */
export interface DamageEntry {
    dealerSlot: number;
    /** Slot 0 is not a player. */
    targetSlot: number;
    sourceIndex: number;
    cumulative: number[];
}

export interface DamageMatrix {
    sampleTimesS: number[];
    sources: DamageSource[];
    entries: DamageEntry[];
}

/** One player's raw recorded path; coordinates are quantised within the per-player world bounds. */
export interface PlayerPath {
    slot: number;
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
    xPos: number[];
    yPos: number[];
    /** Percent, 0 while dead. Empty when the source omits it. */
    health: number[];
    combatType: number[];
    moveType: number[];
}

export interface MatchPaths {
    /** Seconds between samples. */
    intervalS: number;
    xResolution: number;
    yResolution: number;
    paths: PlayerPath[];
}

export interface MatchDetail {
    source: DetailSource;
    /** Merge key between sources. */
    matchId: number;
    startTime: number;
    durationS: number;
    matchMode: number;
    gameMode: number;
    winningTeam?: MatchTeam;
    notScored: boolean;
    bans: number[];
    teams: [MatchTeamDetail, MatchTeamDetail];
    objectives: MatchObjective[];
    midBoss: MidBossEvent[];
    damageMatrix: DamageMatrix;
    /** Null when the source recorded no paths, as with provisional captured data. */
    matchPaths?: MatchPaths | null;
}

export function allPlayers(detail: MatchDetail): MatchPlayer[] {
    return detail.teams.flatMap((t) => t.players);
}

export function playerBySlot(detail: MatchDetail, slot: number): MatchPlayer | undefined {
    return allPlayers(detail).find((p) => p.slot === slot);
}

/** `accountIds` is ordered by preference; the first account present in the match wins. */
export function findPlayer(detail: MatchDetail, accountIds: number[]): MatchPlayer | undefined {
    const players = allPlayers(detail);
    for (const id of accountIds) {
        const p = players.find((x) => x.accountId === id);
        if (p) return p;
    }
    return undefined;
}

export function outcomeFor(detail: MatchDetail, accountIds: number[]): PlayerOutcome | null {
    return findPlayer(detail, accountIds)?.outcome ?? null;
}

const SUBRANKS_PER_TIER = 6;

/**
 * Mean of display ranks (tier * 10 + sub, sub 1-6) taken over the ladder position, so the
 * result is always a real tier and sub-tier. Zero and negative values are not ranks and are skipped.
 */
export function averageDisplayRank(ranks: readonly number[]): number | undefined {
    const flats = ranks
        .filter((r) => r > 0)
        .map((r) => {
            const tier = Math.max(1, Math.floor(r / 10));
            const sub = Math.min(SUBRANKS_PER_TIER, Math.max(1, r % 10));
            return (tier - 1) * SUBRANKS_PER_TIER + (sub - 1);
        });
    if (flats.length === 0) return undefined;
    const flat = Math.round(flats.reduce((a, b) => a + b, 0) / flats.length);
    return (Math.floor(flat / SUBRANKS_PER_TIER) + 1) * 10 + (flat % SUBRANKS_PER_TIER) + 1;
}

export function averageBadgeOf(detail: MatchDetail): number | undefined {
    return averageDisplayRank(detail.teams.flatMap((t) => (t.averageBadge === undefined ? [] : [t.averageBadge])));
}
