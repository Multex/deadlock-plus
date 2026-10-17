import {
    MATCH_TEAMS,
    type DamageEntry,
    type DamageMatrix,
    type DamageSource,
    type DetailSource,
    type MatchAbility,
    type MatchAccolade,
    type MatchDeath,
    type MatchDetail,
    type MatchItem,
    type MatchObjective,
    type MatchPaths,
    type PlayerPath,
    type MatchPlayer,
    type MatchTeam,
    type MatchTeamDetail,
    type MidBossEvent,
    type PlayerOutcome,
    type PlayerRank,
    type Position,
    type SeriesPoint,
} from "./detail";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objs = (v: unknown): Obj[] => arr(v).filter(isObj);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const numOr0 = (v: unknown): number => num(v) ?? 0;
const nums = (v: unknown): number[] => arr(v).map(numOr0);

// The API numbers teams by lobby side: 0 is The Hidden King, 1 is The Archmother.
function teamOf(v: unknown): MatchTeam | undefined {
    const n = num(v);
    return n === 0 || n === 1 ? MATCH_TEAMS[n] : undefined;
}

function position(v: unknown): Position | undefined {
    if (!isObj(v)) return undefined;
    const x = num(v.x);
    const y = num(v.y);
    const z = num(v.z);
    return x === undefined || y === undefined || z === undefined ? undefined : { x, y, z };
}

function item(r: Obj): MatchItem | null {
    const itemId = num(r.item_id);
    if (itemId === undefined) return null;
    const sold = num(r.sold_time_s);
    const imbued = num(r.imbued_ability_id);
    const upgradeBits = (num(r.upgrade_info) ?? 0) >>> 16;
    return {
        itemId,
        boughtS: numOr0(r.game_time_s),
        soldS: sold !== undefined && sold > 0 ? sold : undefined,
        upgradeId: numOr0(r.upgrade_id),
        imbuedAbilityId: imbued !== undefined && imbued > 0 ? imbued : undefined,
        upgradeBits: upgradeBits > 0 ? upgradeBits : undefined,
    };
}

function death(r: Obj): MatchDeath | null {
    const timeS = num(r.game_time_s);
    const killerSlot = num(r.killer_player_slot);
    if (timeS === undefined || killerSlot === undefined) return null;
    return {
        timeS,
        killerSlot,
        position: position(r.death_pos),
        killerPosition: position(r.killer_pos),
        respawnS: num(r.death_duration_s),
        timeToKillS: num(r.time_to_kill_s),
    };
}

function point(r: Obj): SeriesPoint | null {
    const timeS = num(r.time_stamp_s);
    if (timeS === undefined) return null;
    return {
        timeS,
        souls: numOr0(r.net_worth),
        playerDamage: numOr0(r.player_damage),
        healing: numOr0(r.player_healing),
        kills: numOr0(r.kills),
        deaths: numOr0(r.deaths),
        assists: numOr0(r.assists),
    };
}

function rank(v: unknown): PlayerRank | undefined {
    if (!isObj(v)) return undefined;
    const displayRank = num(v.initial_display_rank);
    if (displayRank === undefined) return undefined;
    return {
        displayRank,
        progressBefore: numOr0(v.initial_flat_progress),
        progressAfter: numOr0(v.final_flat_progress),
        progressChange: numOr0(v.desired_progress_change),
        calibrationGamesLeft: numOr0(v.initial_calibration_games),
        demotionProtectionGamesLeft: numOr0(v.initial_demotion_protection_games),
        consumedDemotionProtection: v.consumed_demotion_protection === true,
        winStreak: numOr0(v.initial_win_streak),
    };
}

function abilities(v: unknown): MatchAbility[] {
    return objs(v).flatMap((r) => {
        const abilityId = num(r.ability_id);
        return abilityId === undefined ? [] : [{ abilityId, value: numOr0(r.ability_value) }];
    });
}

function accolades(v: unknown): MatchAccolade[] {
    return objs(v).flatMap((r) => {
        const accoladeId = num(r.accolade_id);
        if (accoladeId === undefined) return [];
        return [{ accoladeId, value: numOr0(r.accolade_stat_value), tier: numOr0(r.accolade_threshold_achieved) }];
    });
}

function outcome(winning: MatchTeam | undefined, notScored: boolean, team: MatchTeam): PlayerOutcome {
    if (notScored || winning === undefined) return "unscored";
    return winning === team ? "win" : "loss";
}

function pathSeconds(paths: unknown, slot: number): number | undefined {
    if (!isObj(paths)) return undefined;
    const row = objs(paths.paths).find((p) => num(p.player_slot) === slot);
    return row === undefined ? undefined : arr(row.x_pos).length * (num(paths.interval_s) ?? 1);
}

function player(r: Obj, winning: MatchTeam | undefined, notScored: boolean, paths: unknown): MatchPlayer | null {
    const slot = num(r.player_slot);
    const accountId = num(r.account_id);
    const heroId = num(r.hero_id);
    const team = teamOf(r.team);
    if (slot === undefined || accountId === undefined || heroId === undefined || team === undefined) return null;

    const series = objs(r.stats)
        .map(point)
        .filter((p): p is SeriesPoint => p !== null)
        .sort((a, b) => a.timeS - b.timeS);
    const last = series.at(-1);
    const lastRaw = objs(r.stats)
        .filter((s) => num(s.time_stamp_s) !== undefined)
        .sort((x, y) => numOr0(x.time_stamp_s) - numOr0(y.time_stamp_s))
        .at(-1);
    const items = objs(r.items)
        .map(item)
        .filter((i): i is MatchItem => i !== null)
        .sort((a, b) => a.boughtS - b.boughtS);
    const deathLog = objs(r.death_details)
        .map(death)
        .filter((d): d is MatchDeath => d !== null)
        .sort((a, b) => a.timeS - b.timeS);

    return {
        slot,
        accountId,
        team,
        heroId,
        lane: num(r.assigned_lane),
        level: numOr0(r.level),
        kills: numOr0(r.kills),
        deaths: numOr0(r.deaths),
        assists: numOr0(r.assists),
        souls: numOr0(r.net_worth),
        lastHits: numOr0(r.last_hits),
        denies: numOr0(r.denies),
        playerDamage: last?.playerDamage ?? 0,
        healing: last?.healing ?? 0,
        bossDamage: num(lastRaw?.boss_damage),
        teammateHealing: num(lastRaw?.teammate_healing),
        teammateBarriering: num(lastRaw?.teammate_barriering),
        abandonMatchTimeS: num(r.abandon_match_time_s),
        playerMatchOutcome: num(r.player_match_outcome),
        pathS: pathSeconds(paths, slot),
        mvpRank: num(r.mvp_rank),
        outcome: outcome(winning, notScored, team),
        items,
        deathLog,
        series,
        abilities: abilities(r.ability_stats),
        accolades: accolades(r.accolades),
        rank: rank(r.player_rank_data),
    };
}

function objective(r: Obj): MatchObjective | null {
    const objectiveId = num(r.team_objective_id);
    const team = teamOf(r.team);
    if (objectiveId === undefined || team === undefined) return null;
    const destroyed = num(r.destroyed_time_s);
    return {
        objectiveId,
        team,
        destroyedS: destroyed !== undefined && destroyed > 0 ? destroyed : undefined,
        firstDamageS: num(r.first_damage_time_s),
        creepDamage: numOr0(r.creep_damage),
        playerDamage: numOr0(r.player_damage),
        spiritDamage: numOr0(r.player_spirit_damage),
    };
}

function midBoss(r: Obj): MidBossEvent {
    return {
        killedBy: teamOf(r.team_killed),
        claimedBy: teamOf(r.team_claimed),
        destroyedS: numOr0(r.destroyed_time_s),
    };
}

function damageMatrix(v: unknown): DamageMatrix {
    if (!isObj(v)) return { sampleTimesS: [], sources: [], entries: [] };
    const details = isObj(v.source_details) ? v.source_details : {};
    const names = arr(details.source_name);
    const types = arr(details.stat_type);
    const sources: DamageSource[] = names.map((name, i) => ({
        name: typeof name === "string" ? name : "",
        statType: numOr0(types[i]),
    }));

    const entries: DamageEntry[] = [];
    for (const dealer of objs(v.damage_dealers)) {
        const dealerSlot = num(dealer.dealer_player_slot);
        if (dealerSlot === undefined) continue;
        for (const src of objs(dealer.damage_sources)) {
            const sourceIndex = num(src.source_details_index);
            if (sourceIndex === undefined) continue;
            for (const target of objs(src.damage_to_players)) {
                const targetSlot = num(target.target_player_slot);
                if (targetSlot === undefined) continue;
                entries.push({ dealerSlot, targetSlot, sourceIndex, cumulative: nums(target.damage) });
            }
        }
    }
    return { sampleTimesS: nums(v.sample_time_s), sources, entries };
}

function pathOf(r: Obj): PlayerPath | null {
    const slot = num(r.player_slot);
    const xMin = num(r.x_min);
    const yMin = num(r.y_min);
    const xMax = num(r.x_max);
    const yMax = num(r.y_max);
    if (slot === undefined || xMin === undefined || yMin === undefined || xMax === undefined || yMax === undefined) {
        return null;
    }
    return {
        slot,
        xMin,
        yMin,
        xMax,
        yMax,
        xPos: nums(r.x_pos),
        yPos: nums(r.y_pos),
        health: nums(r.health),
        combatType: nums(r.combat_type),
        moveType: nums(r.move_type),
    };
}

function matchPaths(v: unknown): MatchPaths | null {
    if (!isObj(v)) return null;
    const xResolution = num(v.x_resolution);
    const yResolution = num(v.y_resolution);
    const intervalS = num(v.interval_s) ?? 1;
    if (xResolution === undefined || yResolution === undefined) return null;
    if (xResolution <= 0 || yResolution <= 0 || intervalS <= 0) return null;
    const paths = objs(v.paths)
        .map(pathOf)
        .filter((p): p is PlayerPath => p !== null);
    return paths.length === 0 ? null : { intervalS, xResolution, yResolution, paths };
}

export interface ParseOptions {
    /** The captured post-game message serialises to the same shape as the API body. */
    source?: DetailSource;
}

/** Accepts the `/v1/matches/{id}/metadata` body, or its `match_info` object alone. */
export function parseApiDetail(raw: unknown, options: ParseOptions = {}): MatchDetail | null {
    if (!isObj(raw)) return null;
    const info = isObj(raw.match_info) ? raw.match_info : raw;
    const matchId = num(info.match_id);
    if (matchId === undefined) return null;

    const winningTeam = teamOf(info.winning_team);
    const notScored = info.not_scored === true;
    const players = objs(info.players)
        .map((p) => player(p, winningTeam, notScored, info.match_paths))
        .filter((p): p is MatchPlayer => p !== null)
        .sort((a, b) => a.slot - b.slot);
    if (players.length === 0) return null;

    const badges = [num(info.average_badge_team0), num(info.average_badge_team1)];
    const teams = MATCH_TEAMS.map((team, i): MatchTeamDetail => {
        const members = players.filter((p) => p.team === team);
        const badge = badges[i];
        return {
            team,
            score: members.reduce((sum, p) => sum + p.kills, 0),
            averageBadge: badge !== undefined && badge > 0 ? badge : undefined,
            players: members,
        };
    }) as [MatchTeamDetail, MatchTeamDetail];

    return {
        source: options.source ?? "api",
        matchId,
        startTime: numOr0(info.start_time),
        durationS: numOr0(info.duration_s),
        matchMode: numOr0(info.match_mode),
        gameMode: numOr0(info.game_mode),
        matchOutcome: num(info.match_outcome),
        lowPriPool: typeof info.low_pri_pool === "boolean" ? info.low_pri_pool : undefined,
        winningTeam,
        notScored,
        bans: nums(isObj(raw.match_info) ? raw.banned_hero_ids : info.banned_hero_ids),
        teams,
        objectives: objs(info.objectives)
            .map(objective)
            .filter((o): o is MatchObjective => o !== null),
        midBoss: objs(info.mid_boss).map(midBoss),
        damageMatrix: damageMatrix(info.damage_matrix),
        matchPaths: matchPaths(info.match_paths),
    };
}
