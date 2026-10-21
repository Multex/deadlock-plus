import type { AccoladeEntry } from "@deadlock-plus/ipc-types/AccoladeEntry";
import type { BuildTag } from "@deadlock-plus/ipc-types/BuildTag";
import type { ClassArt } from "@deadlock-plus/ipc-types/ClassArt";
import type { HeroAbilities } from "@deadlock-plus/ipc-types/HeroAbilities";
import type { HeroArt } from "@deadlock-plus/ipc-types/HeroArt";
import type { HeroProgression } from "@deadlock-plus/ipc-types/HeroProgression";
import type { ItemEntry } from "@deadlock-plus/ipc-types/ItemEntry";
import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import type { ItemStats } from "@deadlock-plus/ipc-types/ItemStats";
import type { LaneLine } from "@deadlock-plus/ipc-types/LaneLine";
import type { MapItem } from "@deadlock-plus/ipc-types/MapItem";
import type { MapItemsPayload } from "@deadlock-plus/ipc-types/MapItemsPayload";
import type { MatchPingSeries } from "@deadlock-plus/ipc-types/MatchPingSeries";
import type { MinimapArtResult } from "@deadlock-plus/ipc-types/MinimapArtResult";
import type { MinimapIcon } from "@deadlock-plus/ipc-types/MinimapIcon";
import type { MinimapIconArt } from "@deadlock-plus/ipc-types/MinimapIconArt";
import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import type { PopularItem } from "@deadlock-plus/ipc-types/PopularItem";
import type { PopularItems } from "@deadlock-plus/ipc-types/PopularItems";
import type { ProvisionalMatch } from "@deadlock-plus/ipc-types/ProvisionalMatch";
import type { ShopItem } from "@deadlock-plus/ipc-types/ShopItem";
import type { ShopSlot } from "@deadlock-plus/ipc-types/ShopSlot";

import type { Handlers } from "../../backend";
import { seeded } from "../../random";
import type { Identity, Module } from "../../scenario";
import { fakeAccountId, fakeName } from "./identity";
import { demoGrade } from "./match-grades";
import { historyRows, type HistoryRow } from "./progress";
import { spreadStartTimes, type RecoverySession } from "./recovery";

export interface MatchDetailOptions {
    /** The map table decoded from a real game build: `crates/ring2/dp-gamedata/fixtures/map_items.tsv`. */
    mapItemsTsv: string;
    /** Where the shell module leaves this install's recovery state, so the matches it lacks answer 404. */
    recoverySession?: RecoverySession;
}

type Rng = () => number;
type Side = 0 | 1;

/** English names from `citadel_main_english.txt`; ids are MurmurHash2 (seed 0x31415926) of `citadel_build_tag_<key>`. */
const BUILD_TAGS: BuildTag[] = [
    { key: "weapon", id: 47026193, name: "Weapon" },
    { key: "vitality", id: 4213205702, name: "Vitality" },
    { key: "spirit", id: 36498494, name: "Spirit" },
    { key: "complexity_1", id: 1052421347, name: "For New Players" },
    { key: "complexity_2", id: 1150155374, name: "For Intermediate Players" },
    { key: "complexity_3", id: 3797987367, name: "For Advanced Players" },
    { key: "damage", id: 2592289373, name: "Damage" },
    { key: "utility", id: 953263904, name: "Utility" },
    { key: "healing", id: 38758251, name: "Healing" },
    { key: "crowd_control", id: 4216803923, name: "Crowd Control" },
    { key: "mobility", id: 3238474489, name: "Mobility" },
    { key: "melee", id: 3401565923, name: "Melee" },
    { key: "headshots", id: 2579669585, name: "Headshots" },
    { key: "debuff", id: 255841590, name: "Debuff" },
];

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const range = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const other = (side: Side): Side => (side === 0 ? 1 : 0);

function shuffled<T>(rng: Rng, list: readonly T[]): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = int(rng, 0, i);
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
}

/** Index drawn in proportion to its weight; -1 when no weight is positive. */
function weighted(rng: Rng, weights: readonly number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return -1;
    let roll = rng() * total;
    for (let i = 0; i < weights.length; i++) {
        roll -= weights[i]!;
        if (roll < 0) return i;
    }
    return weights.length - 1;
}

/** Hero id followed by the ids of its four abilities, from the public hero and item assets. */
const HEROES: readonly (readonly number[])[] = [
    [1, 491391007, 3516947824, 1593133799, 1142270357],
    [2, 1065103387, 1074714947, 539192269, 2061574352],
    [3, 537527508, 1796564033, 2048438176, 775377419],
    [4, 715325746, 218284420, 3230530872, 1307289689],
    [6, 4072270083, 2824119765, 715762406, 509856396],
    [7, 1999680326, 4147641675, 1842576017, 2981692841],
    [8, 3133377790, 2142734020, 1725685134, 3503044146],
    [10, 58655583, 1366719170, 1128670012, 2917891787],
    [11, 3760705623, 2031714424, 492030745, 249410288],
    [12, 18921423, 1963397252, 2351041382, 3826390464],
    [13, 2948410412, 2414191464, 1080948381, 731943444],
    [14, 1235098866, 2240607294, 4179229681, 3190606822],
    [15, 3089858203, 2521902222, 1928108461, 3832675871],
    [17, 548943648, 3452399392, 512733154, 3242902780],
    [18, 1454278799, 2406758797, 1914797280, 1917840730],
    [19, 2460791803, 1458044103, 1537272748, 1835738020],
    [20, 4111222521, 1531378655, 3642273386, 1247583368],
    [25, 2656490109, 2751689917, 1656913918, 2702908623],
    [27, 3255651252, 2566573207, 2366960452, 3319782965],
    [31, 3561817145, 2670099061, 519124136, 397010810],
    [35, 3247040238, 3788152387, 1020817390, 4206531918],
    [50, 938149308, 1976701714, 3747867012, 2954330093],
    [52, 3733594387, 1336069669, 2221949202, 2604653402],
    [58, 645773760, 3428732129, 1469918191, 1594727071],
];

/** Shop item ids by tier, cheapest tier first. */
const SHOP: readonly (readonly number[])[] = [
    [
        1548066885, 1009965641, 3077079169, 1342610602, 2010028405, 668299740, 1437614329, 3633614685, 3399065363,
        4139877411, 968099481, 754480263, 1998374645, 3776945997,
    ],
    [
        2064029594, 3331811235, 393974127, 395867183, 3403085434, 3977876567, 499683006, 2566692615, 2447176615,
        805079544, 112198670, 7409189, 2081037738, 380806748, 2951612397,
    ],
    [
        811521119, 2678489038, 1414319208, 2152872419, 4053935515, 2095565695, 1414025773, 2163598980, 3140772621,
        3585132399, 3270001687, 1193964439, 787198704, 3261353684, 2717651715,
    ],
    [
        710436191, 339443430, 3884003354, 1396247347, 2480592370, 365620721, 2037039379, 865846625, 3357231760,
        2407781327, 3577481646, 3005970438, 2519598785, 630839635,
    ],
];
const SHOP_COST = [800, 1600, 3200, 6400];
/** Shop items that are bound to one of the buyer's abilities. */
const IMBUES = new Set([754480263, 380806748, 2951612397, 2717651715, 3577481646, 630839635]);
const MAX_HELD_ITEMS = 12;

/** Player lane ids and the objective lane slots that go with them, left to right across the map. */
const LANE_IDS = [1, 4, 6];
const GUARDIAN_IDS = [1, 3, 4];
const WALKER_IDS = [5, 7, 8];
const BASE_GUARDIAN_IDS = [12, 14, 15];
const SHRINE_IDS = [10, 11];
const PATRON_ID = 9;
const CORE_ID = 0;

/** Lane centre lines as x, y pairs in world units, from the Hidden King base to the Archmother base. */
const LANE_LINES: readonly (readonly number[])[] = [
    [
        -2250, -7400, -4300, -6340, -4750, -5300, -6300, -4600, -6900, -3000, -8150, -2400, -7850, -1000, -7700, 0,
        -7050, 1100, -7030, 2700, -6000, 3700, -5300, 5300, -3100, 6200, -900, 6600, 400, 7350,
    ],
    [
        -1280, -8000, -1280, -6130, -1280, -4360, -1140, -3640, -160, -2730, -130, -1688, 0, -1000, 0, 0, 0, 1000, 100,
        1736, 130, 2544, 1080, 3620, 1290, 4352, 1290, 6200, 1280, 8000,
    ],
    [
        -330, -7400, 900, -6500, 2800, -6150, 3760, -5440, 5500, -4800, 5600, -4070, 6660, -3080, 6950, -1650, 7500,
        -250, 7600, 744, 8050, 1816, 7184, 2704, 6800, 4176, 6050, 4975, 4140, 6095, 2344, 6650, 2200, 7400,
    ],
];
/** Where each lane's objectives stand along its line: the Hidden King's base guardians, walker and guardian, then the Archmother's in reverse. */
const LANE_STOPS: readonly (readonly number[])[] = [
    [0.05, 0.22, 0.38, 0.56, 0.72, 0.95],
    [0.16, 0.27, 0.4, 0.61, 0.74, 0.84],
    [0.05, 0.29, 0.44, 0.61, 0.77, 0.94],
];
/** Neutral camp spots, the eight on the Hidden King half first. */
const CAMPS: readonly number[] = [
    -5824, -2400, -4480, -3840, -4000, -1696, -1920, -864, 1920, -3488, 4480, -1920, 2392, -2792, 7936, -2288, -7958,
    2040, -4480, 2560, -2432, 2560, 1952, 832, 3776, 1856, 3808, 3704, 5824, 3984, -3808, 4024,
];
const BASES: readonly (readonly [number, number])[] = [
    [-1280, -9100],
    [1280, 9100],
];

interface Lane {
    xs: number[];
    ys: number[];
    /** Distance along the line at each point. */
    at: number[];
    length: number;
}

const LANES: readonly Lane[] = LANE_LINES.map((line) => {
    const xs = line.filter((_, i) => i % 2 === 0);
    const ys = line.filter((_, i) => i % 2 === 1);
    const at = [0];
    for (let i = 1; i < xs.length; i++) at.push(at[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!));
    return { xs, ys, at, length: at[at.length - 1]! };
});

function lanePoint(lane: Lane, u: number): [number, number] {
    const d = clamp(u, 0, 1) * lane.length;
    let i = 1;
    while (i < lane.at.length - 1 && lane.at[i]! < d) i++;
    const f = (d - lane.at[i - 1]!) / (lane.at[i]! - lane.at[i - 1]!);
    return [
        lane.xs[i - 1]! + (lane.xs[i]! - lane.xs[i - 1]!) * f,
        lane.ys[i - 1]! + (lane.ys[i]! - lane.ys[i - 1]!) * f,
    ];
}

function nearestU(lane: Lane, x: number, y: number): number {
    let best = 0;
    let nearest = Infinity;
    for (let k = 0; k <= 40; k++) {
        const [px, py] = lanePoint(lane, k / 40);
        const d = Math.hypot(px - x, py - y);
        if (d < nearest) {
            nearest = d;
            best = k / 40;
        }
    }
    return best;
}

interface Player {
    slot: number;
    team: Side;
    accountId: number;
    heroId: number;
    abilities: readonly number[];
    /** Index into the lane tables. */
    lane: number;
    farm: number;
    fight: number;
    damage: number;
    heal: number;
    bulletShare: number;
}

interface Objective {
    id: number;
    team: Side;
    /** Index into the lane tables, -1 for the base objectives that belong to no lane. */
    lane: number;
    health: number;
    destroyedS: number;
}

interface MidBossKill {
    team: Side;
    timeS: number;
}

const PLAN_MID = 3;
const PLAN_CAMP = 4;
const FIGHT_LEAD_S = 24;

interface Kill {
    t: number;
    killer: number;
    victim: number;
    assists: number[];
    /** A lane index, or `PLAN_MID`. */
    spot: number;
    offsetX: number;
    offsetY: number;
    respawnS: number;
    timeToKillS: number;
}

interface Core {
    matchId: number;
    row: HistoryRow;
    /** The player's whole match list, newest first. */
    history: readonly HistoryRow[];
    durationS: number;
    ranked: boolean;
    winner: Side;
    own: number;
    players: Player[];
    bans: number[];
    objectives: Objective[];
    midBoss: MidBossKill[];
    /** Lane front per second, as a position along each lane line. */
    front: Float32Array[];
    /** Where each player means to be at each second: a lane index, `PLAN_MID`, or `PLAN_CAMP` plus a camp index. */
    plan: Uint8Array[];
    kills: Kill[];
    sampleTimes: number[];
    /** Signed share by which the Hidden King out-earns the Archmother over time. */
    lead: (t: number) => number;
}

const MATCH_MODE_RANKED = 4;

const stream = (matchId: number, salt: number) => seeded(matchId * 131 + salt);

function roster(rng: Rng, row: HistoryRow, identity: Identity): { players: Player[]; own: number; bans: number[] } {
    const own = row.player_team * 6 + int(rng, 0, 5);
    const heroes = shuffled(
        rng,
        HEROES.filter((h) => h[0] !== row.hero_id),
    );
    const names = shuffled(
        rng,
        identity.names.map((_, i) => i),
    );
    const lanes = [shuffled(rng, [0, 0, 1, 1, 2, 2]), shuffled(rng, [0, 0, 1, 1, 2, 2])];

    let next = 0;
    const players = Array.from({ length: 12 }, (_, i): Player => {
        const isOwn = i === own;
        const hero = isOwn ? HEROES.find((h) => h[0] === row.hero_id)! : heroes[next]!;
        const accountId = isOwn ? identity.accountId : fakeAccountId(identity, names[next]!);
        if (!isOwn) next++;
        const team: Side = i < 6 ? 0 : 1;
        return {
            slot: i + 1,
            team,
            accountId,
            heroId: hero[0]!,
            abilities: hero.slice(1),
            lane: lanes[team]![i % 6]!,
            farm: isOwn ? range(rng, 1.0, 1.14) : range(rng, 0.8, 1.14),
            fight: isOwn ? range(rng, 1.15, 1.5) : range(rng, 0.6, 1.4),
            damage: range(rng, 0.65, 1.35),
            heal: 0.25 + rng() ** 2 * 2.2,
            bulletShare: range(rng, 0.25, 0.72),
        };
    });
    return { players, own, bans: heroes.slice(11, 14).map((h) => h[0]!) };
}

/** Every objective of both sides, with a destroy time of 0 for the ones left standing. */
function objectiveSchedule(rng: Rng, durationS: number, winner: Side): Objective[] {
    const out: Objective[] = [];
    for (const attacker of [0, 1] as const) {
        const team = other(attacker);
        const strong = attacker === winner;
        const pushed = new Set(strong ? shuffled(rng, [0, 1, 2]).slice(0, int(rng, 1, 3)) : []);
        const shrinesFrom = durationS - int(rng, 100, 150);

        for (let lane = 0; lane < 3; lane++) {
            let guardian = 0;
            let walker = 0;
            let base = 0;
            if (strong) {
                base = pushed.has(lane) ? Math.min(range(rng, 0.7, 0.88) * durationS, shrinesFrom - 60) : 0;
                walker = Math.min(range(rng, 0.4, 0.66) * durationS, (base || shrinesFrom) - 70);
                guardian = Math.min(Math.max(210, range(rng, 0.14, 0.3) * durationS), walker - 100);
            } else {
                if (rng() < 0.85) guardian = range(rng, 0.2, 0.5) * durationS;
                if (guardian > 0 && rng() < 0.4) walker = guardian + range(rng, 0.2, 0.35) * durationS;
                if (walker > durationS - 90) walker = 0;
            }
            out.push({ id: GUARDIAN_IDS[lane]!, team, lane, health: 5500, destroyedS: Math.round(guardian) });
            out.push({ id: WALKER_IDS[lane]!, team, lane, health: 9000, destroyedS: Math.round(walker) });
            const first = Math.round(base);
            const second = first > 0 ? first + int(rng, 6, 25) : 0;
            out.push({ id: BASE_GUARDIAN_IDS[lane]!, team, lane, health: 4500, destroyedS: first });
            out.push({ id: BASE_GUARDIAN_IDS[lane]!, team, lane, health: 4500, destroyedS: second });
        }

        const shrines = strong ? [shrinesFrom, shrinesFrom + int(rng, 8, 30)] : [0, 0];
        SHRINE_IDS.forEach((id, i) => out.push({ id, team, lane: -1, health: 7000, destroyedS: shrines[i]! }));
        out.push({
            id: PATRON_ID,
            team,
            lane: -1,
            health: 14000,
            destroyedS: strong ? durationS - int(rng, 35, 60) : 0,
        });
        out.push({ id: CORE_ID, team, lane: -1, health: 11000, destroyedS: strong ? durationS : 0 });
    }
    return out;
}

const ENDGAME_S = 100;

/** The fight on each lane sits between the outermost objectives still standing on it, and ends at the loser's patron. */
function laneFronts(objectives: readonly Objective[], durationS: number, winner: Side): Float32Array[] {
    return LANE_STOPS.map((stops, lane) => {
        const mine = objectives.filter((o) => o.lane === lane);
        const edge = (team: Side, t: number): number => {
            const standing = (ids: readonly number[]) =>
                mine.some((o) => o.team === team && ids.includes(o.id) && (o.destroyedS === 0 || o.destroyedS > t));
            const order = team === 0 ? [2, 1, 0] : [3, 4, 5];
            if (standing(GUARDIAN_IDS)) return stops[order[0]!]!;
            if (standing(WALKER_IDS)) return stops[order[1]!]!;
            if (standing(BASE_GUARDIAN_IDS)) return stops[order[2]!]!;
            return team === 0 ? 0.03 : 0.97;
        };
        const front = new Float32Array(durationS + 1);
        let at = (stops[2]! + stops[3]!) / 2;
        for (let t = 0; t <= durationS; t++) {
            const ending = lane === 1 && t > durationS - ENDGAME_S;
            // The winning side holds more of every lane as the match goes on.
            const push = (winner === 0 ? 0.1 : -0.1) * (t / durationS) ** 2;
            const target = ending ? (winner === 0 ? 0.97 : 0.03) : (edge(0, t) + edge(1, t)) / 2 + push;
            at += clamp(target - at, -0.0035, 0.0035);
            front[t] = at + (ending ? 0 : 0.018 * Math.sin(t / 37 + lane * 2.1));
        }
        return front;
    });
}

function midBossKills(rng: Rng, durationS: number, winner: Side): MidBossKill[] {
    const first = Math.round(Math.max(640, range(rng, 0.42, 0.6) * durationS));
    if (first > durationS - 150) return [];
    const out: MidBossKill[] = [{ team: rng() < 0.65 ? winner : other(winner), timeS: first }];
    const second = first + 420 + int(rng, 40, 220);
    if (second < durationS - 150) out.push({ team: rng() < 0.8 ? winner : other(winner), timeS: second });
    return out;
}

function plans(
    rng: Rng,
    players: readonly Player[],
    durationS: number,
    objectives: readonly Objective[],
    midBoss: readonly MidBossKill[],
): Uint8Array[] {
    const hot = new Uint8Array(durationS + 1);
    for (let t = 0; t <= durationS;) {
        const until = t + int(rng, 60, 110);
        const falling = objectives.find((o) => o.lane >= 0 && o.destroyedS >= t && o.destroyedS < t + 150);
        hot.fill(falling ? falling.lane : int(rng, 0, 2), t, until);
        t = until;
    }

    const out = players.map((p) => {
        const plan = new Uint8Array(durationS + 1).fill(p.lane);
        for (let t = int(rng, 400, 560); t <= durationS;) {
            const roll = rng();
            let code = p.lane;
            let length = int(rng, 40, 80);
            if (roll < 0.5) {
                code = hot[t]!;
                length = int(rng, 45, 95);
            } else if (roll >= 0.72) {
                const anywhere = t > durationS * 0.6;
                code = PLAN_CAMP + (anywhere ? int(rng, 0, 15) : p.team * 8 + int(rng, 0, 7));
                length = int(rng, 20, 34);
            }
            plan.fill(code, t, t + length);
            t += length;
        }
        return plan;
    });

    for (const boss of midBoss) {
        players.forEach((p, i) => {
            const takes = p.team === boss.team;
            if (rng() >= (takes ? 0.7 : 0.3)) return;
            out[i]!.fill(PLAN_MID, Math.max(0, boss.timeS - (takes ? 32 : 20)), boss.timeS + 6);
        });
    }
    for (const plan of out) plan.fill(1, Math.max(0, durationS - ENDGAME_S));
    return out;
}

function respawnSeconds(t: number): number {
    return clamp(Math.round(8 + Math.max(0, t - 300) * 0.042), 8, 75);
}

type OwnRole = "kill" | "assist" | "death";

/** When the demo player's own kills, assists and deaths happen, spaced so each can follow the one before. */
function ownTimeline(rng: Rng, row: HistoryRow): { t: number; role: OwnRole }[] {
    const durationS = row.match_duration_s;
    const roles = shuffled<OwnRole>(rng, [
        ...Array.from({ length: row.player_kills }, () => "kill" as const),
        ...Array.from({ length: row.player_assists }, () => "assist" as const),
        ...Array.from({ length: row.player_deaths }, () => "death" as const),
    ]);
    const times = roles.map(() => Math.round(70 + (durationS - 76) * Math.sqrt(rng()))).sort((a, b) => a - b);
    const gapAfter = (i: number) => (roles[i] === "death" ? respawnSeconds(times[i]!) + 6 : 8);
    for (let i = 1; i < times.length; i++) times[i] = Math.max(times[i]!, times[i - 1]! + gapAfter(i - 1));
    const last = times.length - 1;
    if (last >= 0) times[last] = Math.min(times[last]!, durationS - 2);
    for (let i = last - 1; i >= 0; i--) times[i] = Math.min(times[i]!, times[i + 1]! - gapAfter(i));
    return roles.map((role, i) => ({ t: times[i]!, role }));
}

/**
 * The demo player's part in the fighting is fixed by their match-list row; everyone else's kills are
 * drawn around it.
 */
function killList(
    rng: Rng,
    players: readonly Player[],
    plan: readonly Uint8Array[],
    row: HistoryRow,
    own: number,
    winner: Side,
    midBoss: readonly MidBossKill[],
    lead: (t: number) => number,
): Kill[] {
    const durationS = row.match_duration_s;
    const minutes = durationS / 60;
    const ownTeam = players[own]!.team;
    const quota = [0, 0];
    quota[winner] = Math.round(minutes * range(rng, 1.15, 1.55));
    quota[other(winner)] = Math.round(minutes * range(rng, 0.8, 1.2));
    quota[ownTeam] = Math.max(0, quota[ownTeam]! - row.player_kills - row.player_assists);
    quota[other(ownTeam)] = Math.max(0, quota[other(ownTeam)]! - row.player_deaths);

    // Fights get more frequent as the match goes on.
    const events: { t: number; role: OwnRole | null }[] = [
        ...ownTimeline(rng, row),
        ...Array.from({ length: quota[0]! + quota[1]! }, () => ({
            t: Math.round(70 + (durationS - 76) * Math.sqrt(rng())),
            role: null,
        })),
    ].sort((a, b) => a.t - b.t);

    const freeFrom = players.map(() => 0);
    const deadUntil = players.map(() => 0);
    const out: Kill[] = [];
    for (const { t, role } of events) {
        let team = role === "death" ? other(ownTeam) : ownTeam;
        if (!role) {
            const tilt = lead(t) * 4;
            const side = weighted(rng, [quota[0]! * (1 + Math.max(0, tilt)), quota[1]! * (1 + Math.max(0, -tilt))]);
            if (side < 0) continue;
            team = side as Side;
            quota[team]!--;
        }

        const atBoss = midBoss.some((b) => t >= b.timeS - 25 && t <= b.timeS + 10);
        const ownSpot = plan[own]![t]!;
        const spot = role && ownSpot <= PLAN_MID ? ownSpot : atBoss ? PLAN_MID : int(rng, 0, 2);
        const pickFrom = (wanted: Side, skill: (p: Player) => number, taken: readonly number[]): number => {
            const open = (p: Player, i: number) => p.team === wanted && i !== own && !taken.includes(i);
            const ready = weighted(
                rng,
                players.map((p, i) =>
                    open(p, i) && freeFrom[i]! <= t ? skill(p) * (plan[i]![t] === spot ? 8 : 1) : 0,
                ),
            );
            if (ready >= 0 || !role) return ready;
            // The demo player's fights always happen, so someone still walking back takes part if need be.
            return weighted(
                rng,
                players.map((p, i) => (!open(p, i) ? 0 : deadUntil[i]! > t ? 0.001 : 1)),
            );
        };

        const killer = role === "kill" ? own : pickFrom(team, (p) => p.fight, []);
        const victim = role === "death" ? own : pickFrom(other(team), (p) => 1 / p.fight, []);
        if (killer < 0 || victim < 0) continue;

        const assists: number[] = role === "assist" ? [own] : [];
        const helpers = t < 300 ? int(rng, 0, 1) : t < 900 ? int(rng, 1, 3) : int(rng, 2, 4);
        for (let n = assists.length; n < helpers; n++) {
            const helper = pickFrom(team, () => 1, [killer, ...assists]);
            if (helper >= 0) assists.push(helper);
        }

        const respawnS = respawnSeconds(t);
        // Everyone in a fight needs the whole lead time to reach the next one.
        for (const i of [killer, ...assists]) freeFrom[i] = t + FIGHT_LEAD_S;
        freeFrom[victim] = t + respawnS + 12 + FIGHT_LEAD_S;
        deadUntil[victim] = t + respawnS;
        out.push({
            t,
            killer,
            victim,
            assists,
            spot,
            offsetX: range(rng, -350, 350),
            offsetY: range(rng, -350, 350),
            respawnS,
            timeToKillS: range(rng, 4, 22),
        });
    }
    return out;
}

/** One install's matches. A match is worked out the first time its page is opened. */
interface World {
    identity: Identity;
    history: readonly HistoryRow[];
    /** The player's own line of every match: the match page repeats what the match list says. */
    rows: ReadonlyMap<number, HistoryRow>;
    cores: Map<number, Core>;
}

function coreOf(world: World, matchId: number): Core {
    const known = world.cores.get(matchId);
    if (known) return known;

    const row = world.rows.get(matchId)!;
    const durationS = row.match_duration_s;
    const rng = stream(matchId, 1);
    const { players, own, bans } = roster(rng, row, world.identity);
    const ranked = row.match_mode === MATCH_MODE_RANKED;
    const winner: Side = row.match_result === 0 ? 0 : 1;

    const sign = winner === 0 ? 1 : -1;
    const phase = range(rng, 0, Math.PI * 2);
    const cycles = range(rng, 1, 2.2);
    const lead = (t: number) => {
        const f = t / durationS;
        return sign * (0.02 + 0.07 * f ** 1.5) + 0.05 * Math.sin(phase + Math.PI * 2 * cycles * f) * (1 - 0.6 * f);
    };

    const objectives = objectiveSchedule(rng, durationS, winner);
    const midBoss = midBossKills(rng, durationS, winner);
    const plan = plans(rng, players, durationS, objectives, midBoss);
    const kills = killList(rng, players, plan, row, own, winner, midBoss, lead);
    const sampleTimes: number[] = [];
    for (let t = 180; t < durationS; t += 180) sampleTimes.push(t);
    sampleTimes.push(durationS);

    const core: Core = {
        matchId,
        row,
        history: world.history,
        durationS,
        ranked,
        winner,
        own,
        players,
        bans: ranked ? bans : [],
        objectives,
        midBoss,
        front: laneFronts(objectives, durationS, winner),
        plan,
        kills,
        sampleTimes,
        lead,
    };
    // The demo player farms exactly what the row's net worth leaves after their kill and assist souls.
    const farmed =
        (7.9 * durationS + 0.004 * durationS ** 2) * (1 + (row.player_team === 0 ? 1 : -1) * lead(durationS));
    players[own]!.farm = Math.max(0.3, (row.net_worth - tallyAt(core, own, durationS).bounty) / farmed);
    world.cores.set(matchId, core);
    return core;
}

interface Tally {
    kills: number;
    deaths: number;
    assists: number;
    /** Souls paid out for the kills and assists counted. */
    bounty: number;
}

function tallyAt(core: Core, player: number, t: number): Tally {
    const out: Tally = { kills: 0, deaths: 0, assists: 0, bounty: 0 };
    for (const k of core.kills) {
        if (k.t > t) break;
        const worth = 120 + 0.35 * k.t;
        if (k.killer === player) {
            out.kills++;
            out.bounty += worth;
        } else if (k.victim === player) out.deaths++;
        else if (k.assists.includes(player)) {
            out.assists++;
            out.bounty += worth / 2;
        }
    }
    return out;
}

function netWorthAt(core: Core, player: number, t: number): number {
    if (player === core.own && t >= core.durationS) return core.row.net_worth;
    const p = core.players[player]!;
    const farmed = (7.9 * t + 0.004 * t * t) * p.farm * (1 + (p.team === 0 ? 1 : -1) * core.lead(t));
    return Math.round(farmed + tallyAt(core, player, t).bounty);
}

function damageAt(core: Core, player: number, t: number): number {
    const tally = tallyAt(core, player, t);
    return Math.round(150 * core.players[player]!.damage * (t / 60) ** 1.5 + tally.kills * 520 + tally.assists * 230);
}

const healingAt = (core: Core, player: number, t: number) =>
    Math.round(45 * core.players[player]!.heal * (t / 60) ** 1.5);

const levelOf = (souls: number) => clamp(Math.round(0.0165 * souls ** 0.73), 1, 36);

interface ApiStat {
    time_stamp_s: number;
    net_worth: number;
    kills: number;
    deaths: number;
    assists: number;
    player_damage: number;
    player_healing: number;
    level: number;
    ability_points: number;
}

function statSeries(core: Core, player: number): ApiStat[] {
    const isOwn = player === core.own;
    let souls = 0;
    return core.sampleTimes.map((t) => {
        souls = isOwn && t >= core.durationS ? core.row.net_worth : Math.max(souls, netWorthAt(core, player, t));
        const tally = tallyAt(core, player, t);
        const level = !isOwn
            ? levelOf(souls)
            : t >= core.durationS
              ? core.row.hero_level
              : Math.min(core.row.hero_level, levelOf(souls));
        return {
            time_stamp_s: t,
            net_worth: souls,
            kills: tally.kills,
            deaths: tally.deaths,
            assists: tally.assists,
            player_damage: damageAt(core, player, t),
            player_healing: healingAt(core, player, t),
            level,
            ability_points: Math.max(0, level - 4),
        };
    });
}

interface ApiItem {
    game_time_s: number;
    item_id: number;
    upgrade_id: number;
    sold_time_s: number;
    flags: number;
    imbued_ability_id: number;
    upgrade_info: number;
}

const ABILITY_UPGRADE_COSTS = [1, 2, 5];

/** Ability rows repeat the ability id; the high half of `upgrade_info` holds one bit per level reached. */
function abilityRows(rng: Rng, core: Core, player: number): ApiItem[] {
    const { durationS } = core;
    const abilities = core.players[player]!.abilities;
    const levels = [0, 0, 0, 0];
    const row = (ability: number, t: number): ApiItem => ({
        game_time_s: t,
        item_id: abilities[ability]!,
        upgrade_id: 0,
        sold_time_s: 0,
        flags: 0,
        imbued_ability_id: 0,
        upgrade_info: ((1 << ++levels[ability]!) - 1) << 16,
    });

    const unlockAt = [int(rng, 8, 20), int(rng, 55, 95), int(rng, 140, 210), int(rng, 290, 420)];
    const rows = [...shuffled(rng, [0, 1, 2]), 3].map((ability, i) => row(ability, unlockAt[i]!));

    let spent = 0;
    let t = 120;
    for (const cost of ABILITY_UPGRADE_COSTS) {
        for (const ability of shuffled(rng, [0, 1, 2, 3])) {
            spent += cost;
            while (t < durationS && levelOf(netWorthAt(core, player, t)) - 4 < spent) t += 15;
            const at = Math.max(t + int(rng, 1, 12), unlockAt[3]! + 5);
            if (at >= durationS - 5) return rows;
            rows.push(row(ability, at));
        }
    }
    return rows;
}

function shopRows(rng: Rng, core: Core, player: number): ApiItem[] {
    const { durationS } = core;
    const abilities = core.players[player]!.abilities;
    const pools = SHOP.map((ids) => shuffled(rng, ids));
    const wantedTier = (t: number): number => {
        const roll = rng();
        if (t < 300) return 0;
        if (t < 600) return roll < 0.6 ? 1 : 0;
        if (t < 1100) return roll < 0.6 ? 2 : 1;
        return roll < 0.65 ? 3 : 2;
    };
    const stocked = (tier: number) => {
        while (tier < 3 && pools[tier]!.length === 0) tier++;
        return tier;
    };

    const rows: ApiItem[] = [];
    const held: { row: ApiItem; tier: number }[] = [];
    let spent = 0;
    let tier = 0;
    for (let t = int(rng, 30, 60); t < durationS - 20; t += int(rng, 8, 30)) {
        for (let bought = 0; bought < 3; bought++) {
            const cost = SHOP_COST[tier]!;
            if (pools[tier]!.length === 0 || netWorthAt(core, player, t) - spent < cost) break;
            if (held.length >= MAX_HELD_ITEMS) {
                const cheapest = held.reduce((a, b) => (b.tier < a.tier ? b : a));
                if (cheapest.tier >= tier) break;
                cheapest.row.sold_time_s = t;
                spent -= SHOP_COST[cheapest.tier]! / 2;
                held.splice(held.indexOf(cheapest), 1);
            }
            const itemId = pools[tier]!.pop()!;
            const row: ApiItem = {
                game_time_s: t,
                item_id: itemId,
                upgrade_id: 1,
                sold_time_s: 0,
                flags: 0,
                imbued_ability_id: IMBUES.has(itemId) ? abilities[int(rng, 0, 3)]! : 0,
                upgrade_info: 1 << 16,
            };
            rows.push(row);
            held.push({ row, tier });
            spent += cost;
            tier = stocked(wantedTier(t));
        }
    }
    return rows;
}

interface ApiPosition {
    x: number;
    y: number;
    z: number;
}

interface ApiDeath {
    game_time_s: number;
    time_to_kill_s: number;
    killer_player_slot: number;
    death_pos: ApiPosition;
    killer_pos: ApiPosition;
    death_duration_s: number;
}

interface ApiPath {
    player_slot: number;
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
    x_pos: number[];
    y_pos: number[];
    health: number[];
    combat_type: number[];
    move_type: number[];
}

const PATH_RESOLUTION = 16383;
const COMBAT_PLAYER = 1;
const COMBAT_TROOPER = 2;
const COMBAT_NEUTRAL = 3;
const MOVE_ZIPLINE = 1;
const WALK_SPEED = 380;
const ROAM_SPEED = 440;
const FIGHT_SPEED = 560;
const ZIPLINE_SPEED = 1000;

interface Walker {
    x: number;
    y: number;
    /** Lane the player is walking along, -1 while crossing open ground. */
    onLane: number;
    u: number;
    offsetX: number;
    offsetY: number;
    goalX: number;
    goalY: number;
    depth: number;
    health: number;
    deadUntil: number;
    fights: Kill[];
    nextFight: number;
}

function stepToward(w: Walker, x: number, y: number, speed: number): number {
    const d = Math.hypot(x - w.x, y - w.y);
    if (d <= speed) {
        w.x = x;
        w.y = y;
        return 0;
    }
    w.x += ((x - w.x) / d) * speed;
    w.y += ((y - w.y) / d) * speed;
    return d - speed;
}

/**
 * Walks every player through the match one second at a time, so positions, health and the death
 * records all describe the same events.
 */
function simulate(core: Core): { paths: ApiPath[]; deaths: ApiDeath[][] } {
    const { durationS } = core;
    const rng = stream(core.matchId, 2);
    const samples = durationS + 1;
    const xs = core.players.map(() => new Float32Array(samples));
    const ys = core.players.map(() => new Float32Array(samples));
    const health = core.players.map(() => new Uint8Array(samples));
    const combat = core.players.map(() => new Uint8Array(samples));
    const move = core.players.map(() => new Uint8Array(samples));
    const deaths: ApiDeath[][] = core.players.map(() => []);

    const walkers = core.players.map((p, i): Walker => {
        const [bx, by] = BASES[p.team]!;
        return {
            x: bx + range(rng, -300, 300),
            y: by + range(rng, -200, 200),
            onLane: -1,
            u: 0,
            offsetX: 0,
            offsetY: 0,
            goalX: 0,
            goalY: 0,
            depth: range(rng, 0.012, 0.04),
            health: 100,
            deadUntil: 0,
            fights: core.kills.filter((k) => k.killer === i || k.victim === i || k.assists.includes(i)),
            nextFight: 0,
        };
    });

    const fightSpot = (k: Kill): [number, number] => {
        if (k.spot === PLAN_MID) return [k.offsetX, k.offsetY];
        const [x, y] = lanePoint(LANES[k.spot]!, core.front[k.spot]![k.t]!);
        return [x + k.offsetX, y + k.offsetY];
    };

    let nextKill = 0;
    for (let t = 0; t <= durationS; t++) {
        core.players.forEach((p, i) => {
            const w = walkers[i]!;
            if (t < w.deadUntil) return;
            if (w.deadUntil > 0 && t === w.deadUntil) {
                const [bx, by] = BASES[p.team]!;
                w.x = bx + range(rng, -300, 300);
                w.y = by + range(rng, -200, 200);
                w.onLane = -1;
                w.health = 100;
            }

            if (t % 5 === i % 5) {
                w.goalX = range(rng, -420, 420);
                w.goalY = range(rng, -420, 420);
            }
            w.offsetX += (w.goalX - w.offsetX) * 0.2;
            w.offsetY += (w.goalY - w.offsetY) * 0.2;
            const towards = p.team === 0 ? -1 : 1;

            while (w.nextFight < w.fights.length && w.fights[w.nextFight]!.t < t) w.nextFight++;
            const fight = w.fights[w.nextFight];
            let fighting = 0;
            let riding = 0;

            if (fight && t >= fight.t - FIGHT_LEAD_S) {
                const [sx, sy] = fightSpot(fight);
                stepToward(w, sx + w.offsetX * 0.8, sy + w.offsetY * 0.8 + towards * 240, FIGHT_SPEED);
                w.onLane = -1;
                if (t >= fight.t - 9) fighting = COMBAT_PLAYER;
                if (fight.victim === i) {
                    if (t >= fight.t - Math.ceil(fight.timeToKillS)) w.health -= w.health / (fight.t - t + 2);
                } else if (t >= fight.t - 8) w.health = Math.max(15, w.health - range(rng, 1, 6));
            } else {
                const code = core.plan[i]![t]!;
                w.health = Math.min(100, w.health + 1.5);
                if (code < PLAN_MID) {
                    const lane = LANES[code]!;
                    if (w.onLane !== code) {
                        const u = nearestU(lane, w.x, w.y);
                        const [ex, ey] = lanePoint(lane, u);
                        if (stepToward(w, ex, ey, ROAM_SPEED) < 150) {
                            w.onLane = code;
                            w.u = u;
                        }
                    } else {
                        const target = clamp(core.front[code]![t]! + towards * w.depth, 0.01, 0.99);
                        const gap = target - w.u;
                        const far = Math.abs(gap) * lane.length > 2200;
                        const reach = (far ? ZIPLINE_SPEED : WALK_SPEED) / lane.length;
                        w.u += clamp(gap, -reach, reach);
                        const [lx, ly] = lanePoint(lane, w.u);
                        const spread = far ? 0.15 : 1;
                        w.x = lx + w.offsetX * spread;
                        w.y = ly + w.offsetY * spread;
                        if (far) riding = MOVE_ZIPLINE;
                        else if (t > 40) {
                            if (rng() < 0.07) w.health = Math.max(30, w.health - int(rng, 4, 13));
                            if (rng() < 0.3) fighting = COMBAT_TROOPER;
                        }
                    }
                } else if (code === PLAN_MID) {
                    w.onLane = -1;
                    stepToward(w, w.offsetX, w.offsetY + towards * 300, ROAM_SPEED);
                } else {
                    const camp = (code - PLAN_CAMP) * 2;
                    w.onLane = -1;
                    const left = stepToward(
                        w,
                        CAMPS[camp]! + w.offsetX * 0.3,
                        CAMPS[camp + 1]! + w.offsetY * 0.3,
                        ROAM_SPEED,
                    );
                    if (left < 200) fighting = COMBAT_NEUTRAL;
                }
            }

            xs[i]![t] = w.x;
            ys[i]![t] = w.y;
            health[i]![t] = clamp(Math.round(w.health), 1, 100);
            combat[i]![t] = fighting;
            move[i]![t] = riding;
        });

        for (; nextKill < core.kills.length && core.kills[nextKill]!.t === t; nextKill++) {
            const k = core.kills[nextKill]!;
            const victim = walkers[k.victim]!;
            const killer = walkers[k.killer]!;
            const z = 256 + int(rng, 0, 180);
            deaths[k.victim]!.push({
                game_time_s: t,
                time_to_kill_s: k.timeToKillS,
                killer_player_slot: core.players[k.killer]!.slot,
                death_pos: { x: victim.x, y: victim.y, z },
                killer_pos: { x: killer.x, y: killer.y, z },
                death_duration_s: k.respawnS,
            });
            victim.deadUntil = t + k.respawnS;
            health[k.victim]![t] = 0;
        }
    }

    const paths = core.players.map((p, i): ApiPath => {
        const alive = [...health[i]!].map((h) => h > 0);
        const bounds = (values: Float32Array): [number, number] => {
            const live = [...values].filter((_, t) => alive[t]);
            return [Math.min(...live), Math.max(...live)];
        };
        const [xMin, xMax] = bounds(xs[i]!);
        const [yMin, yMax] = bounds(ys[i]!);
        const pack = (values: Float32Array, min: number, max: number) =>
            [...values].map((v, t) => (alive[t] ? Math.round(((v - min) / (max - min)) * PATH_RESOLUTION) : 0));
        return {
            player_slot: p.slot,
            x_min: xMin,
            y_min: yMin,
            x_max: xMax,
            y_max: yMax,
            x_pos: pack(xs[i]!, xMin, xMax),
            y_pos: pack(ys[i]!, yMin, yMax),
            health: [...health[i]!],
            combat_type: [...combat[i]!],
            move_type: [...move[i]!],
        };
    });
    return { paths, deaths };
}

const DAMAGE_SOURCES = ["Bullet", "Melee", "Abilities", "base_stat_regen"];
const DAMAGE_STAT = 3;
const HEALING_STAT = 5;

/** Whole numbers in proportion to `weights` that add up to `total` exactly. */
function split(total: number, weights: readonly number[]): number[] {
    const sum = weights.reduce((a, b) => a + b, 0);
    const parts = weights.map((w) => Math.floor((total * w) / sum));
    parts[parts.length - 1]! += total - parts.reduce((a, b) => a + b, 0);
    return parts;
}

function damageMatrix(rng: Rng, core: Core) {
    const dealers = core.players.map((p, i) => {
        const curve = core.sampleTimes.map((t) => damageAt(core, i, t));
        const total = curve[curve.length - 1]!;
        const growth = (amount: number) => curve.map((v) => Math.round((amount * v) / total));

        const targets = core.players.flatMap((e, j) => (e.team === p.team ? [] : [j]));
        const perTarget = split(
            total,
            targets.map((j) => {
                const fought = core.kills.filter((k) => k.victim === j && (k.killer === i || k.assists.includes(i)));
                return (core.players[j]!.lane === p.lane ? 2 : 1) * range(rng, 0.6, 1.6) + fought.length * 1.2;
            }),
        );
        const melee = range(rng, 0.03, 0.08);
        const shares = [p.bulletShare, melee, 1 - p.bulletShare - melee];
        const bySource = targets.map((_, n) => split(perTarget[n]!, shares));

        const sources = shares.map((_, source) => ({
            damage_to_players: targets.map((j, n) => ({
                target_player_slot: core.players[j]!.slot,
                damage: growth(bySource[n]![source]!),
            })),
            source_details_index: source,
        }));
        sources.push({
            damage_to_players: [
                {
                    target_player_slot: p.slot,
                    damage: core.sampleTimes.map((t) => Math.round(healingAt(core, i, t) * 0.45)),
                },
            ],
            source_details_index: 3,
        });
        return { dealer_player_slot: p.slot, damage_sources: sources };
    });
    return {
        damage_dealers: dealers,
        sample_time_s: core.sampleTimes,
        source_details: {
            stat_type: DAMAGE_SOURCES.map((_, i) => (i === 3 ? HEALING_STAT : DAMAGE_STAT)),
            source_name: DAMAGE_SOURCES,
        },
    };
}

interface Final {
    stats: ApiStat[];
    last: ApiStat;
    lastHits: number;
    denies: number;
    headshots: number;
    breakables: number;
}

function finals(rng: Rng, core: Core): Final[] {
    const minutes = core.durationS / 60;
    return core.players.map((p, i) => {
        const stats = statSeries(core, i);
        return {
            stats,
            last: stats[stats.length - 1]!,
            lastHits: i === core.own ? core.row.last_hits : Math.round(minutes * range(rng, 4.2, 7.2) * p.farm),
            denies: i === core.own ? core.row.denies : int(rng, 0, 18),
            headshots: Math.round(minutes * range(rng, 0.8, 2.8) * p.bulletShare * 2),
            breakables: Math.round(minutes * range(rng, 2, 6)),
        };
    });
}

/** Accolade ids from the public accolade list, each with the stat it counts. */
const ACCOLADES: readonly (readonly [id: number, value: (f: Final, p: Player) => number])[] = [
    [1, (f) => f.last.kills],
    [2, (f) => f.last.assists],
    [3, (f) => f.last.player_healing],
    [4, (f) => f.last.player_damage],
    [5, (f) => f.last.net_worth],
    [8, (f) => f.lastHits],
    [10, (f) => f.denies],
    [11, (f) => f.breakables],
    [22, (f, p) => Math.round(f.last.player_damage * p.bulletShare)],
    [28, (f) => f.headshots],
];

/** Each player gets the three accolades they rank best in across the lobby; the rank sets the tier. */
function accolades(core: Core, all: readonly Final[], player: number) {
    return ACCOLADES.map(([id, value]) => {
        const mine = value(all[player]!, core.players[player]!);
        const ahead = all.filter((f, j) => value(f, core.players[j]!) > mine).length;
        return { id, mine, ahead };
    })
        .sort((a, b) => a.ahead - b.ahead || a.id - b.id)
        .slice(0, 3)
        .map((a) => ({
            accolade_id: a.id,
            accolade_stat_value: a.mine,
            accolade_threshold_achieved: a.ahead < 2 ? 2 : a.ahead < 5 ? 1 : 0,
        }));
}

/** Rank 1 and 2 are the winners' best two players, rank 3 the best of the losing side. */
function mvpRanks(core: Core, all: readonly Final[]): Map<number, number> {
    const score = (i: number) => {
        const s = all[i]!.last;
        return s.kills * 3 + s.assists - s.deaths * 1.5 + s.player_damage / 1500 + s.net_worth / 2000;
    };
    const best = (team: Side) =>
        core.players.flatMap((p, i) => (p.team === team ? [i] : [])).sort((a, b) => score(b) - score(a));
    const winners = best(core.winner);
    return new Map([
        [winners[0]!, 1],
        [winners[1]!, 2],
        [best(other(core.winner))[0]!, 3],
    ]);
}

const SUBRANKS = 6;
const TIER_POINTS = 7000;
const RANK_STEP = 300;

/** The list shows the badge a match ended on, so a match starts on the badge the ranked match before it ended on. */
function badgeBefore(history: readonly HistoryRow[], row: HistoryRow): number {
    const older = history.slice(history.indexOf(row) + 1).find((r) => r.ranked_display_badge !== null);
    return older?.ranked_display_badge ?? row.ranked_display_badge ?? 0;
}

function rankData(rng: Rng, core: Core, player: number) {
    const isOwn = player === core.own;
    const ownBadge = badgeBefore(core.history, core.row);
    const own = (Math.floor(ownBadge / 10) - 1) * SUBRANKS + (ownBadge % 10) - 1;
    const ladder = isOwn ? own : clamp(own + int(rng, -4, 4), 0, 11 * SUBRANKS - 1);
    const tier = Math.floor(ladder / SUBRANKS) + 1;
    const sub = (ladder % SUBRANKS) + 1;
    const before = (tier - 1) * TIER_POINTS + (sub - 1) * 1000 + int(rng, 0, sub === SUBRANKS ? 1999 : 999);
    const step = core.players[player]!.team === core.winner ? RANK_STEP : -RANK_STEP;
    const change = isOwn ? (core.row.ranked_delta ?? step) : step;
    return {
        initial_display_rank: tier * 10 + sub,
        initial_flat_progress: before,
        final_flat_progress: before + change,
        desired_progress_change: change,
        initial_calibration_games: 0,
        initial_demotion_protection_games: int(rng, 0, 3),
        consumed_demotion_protection: isOwn && core.row.ranked_used_demotion_protection === true,
        initial_win_streak: int(rng, 0, 3),
    };
}

function objectiveRows(rng: Rng, core: Core) {
    return core.objectives.map((o) => {
        const destroyed = o.destroyedS > 0;
        const touched = destroyed || (o.lane >= 0 && GUARDIAN_IDS.includes(o.id));
        const dealt = !touched ? 0 : destroyed ? o.health : Math.round(o.health * range(rng, 0.1, 0.6));
        const byPlayers = Math.round(dealt * range(rng, 0.5, 0.85));
        const firstHit = destroyed
            ? Math.max(40, o.destroyedS - int(rng, 60, 280))
            : int(rng, 120, Math.max(121, core.durationS - 60));
        return {
            legacy_objective_id: null,
            team_objective_id: o.id,
            team: o.team,
            destroyed_time_s: o.destroyedS,
            first_damage_time_s: touched ? firstHit : 0,
            creep_damage: dealt - byPlayers,
            creep_damage_mitigated: null,
            player_damage: byPlayers,
            player_damage_mitigated: null,
            player_spirit_damage: Math.round(byPlayers * range(rng, 0.03, 0.3)),
        };
    });
}

/** The body of `GET /v1/matches/{id}/metadata`. */
function metadata(world: World, matchId: number) {
    const core = coreOf(world, matchId);
    const rng = stream(matchId, 3);
    const all = finals(rng, core);
    const mvp = mvpRanks(core, all);
    const { paths, deaths } = simulate(core);

    const players = core.players.map((p, i) => {
        const f = all[i]!;
        return {
            account_id: p.accountId,
            player_slot: p.slot,
            team: p.team,
            hero_id: p.heroId,
            kills: f.last.kills,
            deaths: f.last.deaths,
            assists: f.last.assists,
            net_worth: f.last.net_worth,
            last_hits: f.lastHits,
            denies: f.denies,
            level: f.last.level,
            ability_points: f.last.ability_points,
            assigned_lane: LANE_IDS[p.lane]!,
            mvp_rank: mvp.get(i) ?? null,
            player_rank_data: core.ranked ? rankData(rng, core, i) : null,
            accolades: accolades(core, all, i),
            ability_stats: p.abilities.map((id) => ({ ability_id: id, ability_value: int(rng, 4, 60) })),
            items: [...abilityRows(rng, core, i), ...shopRows(rng, core, i)].sort(
                (a, b) => a.game_time_s - b.game_time_s,
            ),
            death_details: deaths[i]!,
            stats: f.stats,
        };
    });

    return {
        match_info: {
            match_id: matchId,
            start_time: core.row.start_time,
            duration_s: core.durationS,
            match_outcome: 0,
            winning_team: core.winner,
            match_mode: core.row.match_mode,
            game_mode: core.row.game_mode,
            not_scored: false,
            average_badge_team0: 0,
            average_badge_team1: 0,
            players,
            objectives: objectiveRows(rng, core),
            mid_boss: core.midBoss.map((b) => ({
                team_killed: b.team,
                team_claimed: b.team,
                destroyed_time_s: b.timeS,
            })),
            damage_matrix: damageMatrix(rng, core),
            match_paths: {
                version: 1,
                interval_s: 1,
                x_resolution: PATH_RESOLUTION,
                y_resolution: PATH_RESOLUTION,
                paths,
            },
        },
        banned_hero_ids: core.bans,
    };
}

function personaNames(identity: Identity, url: URL) {
    const ids = (url.searchParams.get("account_ids") ?? "").split(",").map(Number);
    return ids.flatMap((id) => {
        if (id === identity.accountId) return [{ account_id: id, personaname: identity.persona }];
        const index = id - fakeAccountId(identity, 0);
        if (!Number.isInteger(index) || index < 0 || index >= identity.names.length) return [];
        return [{ account_id: id, personaname: fakeName(identity, index) }];
    });
}

const ASSETS = "https://api.deadlock-api.com/v1/assets";

type AssetLoader = <T>(name: string) => Promise<T>;

/** Public game-data lists, each fetched once however many commands read it. */
function assetLoader(): AssetLoader {
    const assets = new Map<string, Promise<unknown>>();
    return <T>(name: string) => {
        let pending = assets.get(name);
        if (!pending) {
            pending = fetch(`${ASSETS}/${name}`).then((res) => res.json());
            assets.set(name, pending);
        }
        return pending as Promise<T>;
    };
}

interface AssetItem {
    id: number;
    class_name: string;
    name: string;
    type: string;
    image?: string | null;
    image_webp?: string | null;
    shop_image?: string | null;
    shop_image_webp?: string | null;
    item_slot_type?: string;
    item_tier?: number;
    cost?: number;
    is_active_item?: boolean;
    shopable?: boolean;
    disabled?: boolean;
    component_items?: string[];
    /** Set on items that imbue an ability: the kind of ability they target. */
    imbue?: string | null;
    properties?: Record<string, AssetProperty>;
    tooltip_sections?: AssetTooltipSection[];
}

interface AssetProperty {
    value?: string | number;
    label?: string;
    postvalue_label?: string;
    postfix?: string;
    provided_property_type?: string;
    usage_flags?: string[];
    /** The game's apply filter, as the condition it names ("against NPCs"). */
    conditional?: string;
}

interface AssetTooltipSection {
    section_type?: string;
    section_attributes?: Partial<Record<(typeof SHOWN_LISTS)[number], (string | { name: string })[]>>[];
}

const SHOWN_LISTS = [
    "properties",
    "elevated_properties",
    "important_properties",
    "important_properties_with_icon",
] as const;

interface AssetAccolade {
    id: number;
    flavor_name: string;
    description: string | null;
    tracked_stat_name: string | null;
}

interface AssetHero {
    id: number;
    images?: { minimap_image_webp?: string | null };
    items?: Record<string, string>;
    level_info?: Record<string, { required_gold: number; bonus_currencies?: string[] }>;
    popular_items?: {
        timestamp: number;
        early_game?: AssetPopularItem[];
        mid_game?: AssetPopularItem[];
        late_game?: AssetPopularItem[];
    } | null;
}

interface AssetPopularItem {
    item_id: number;
    class_name: string;
    pick_pct: number;
    winrate_pct: number;
}

interface AssetMap {
    radius?: number;
    images?: { minimap?: string | null };
}

interface AssetIcons {
    minimap?: Record<string, string>;
}

/** The id Source 2 gives a class name: MurmurHash2, seed 0x31415926, over the ASCII-lowercased name. */
function abilityId(className: string): number {
    const M = 0x5bd1e995;
    const data = Array.from(className, (c) => c.toLowerCase().charCodeAt(0) & 0xff);
    let h = (0x31415926 ^ data.length) >>> 0;
    let i = 0;
    for (; i + 4 <= data.length; i += 4) {
        let k = data[i]! | (data[i + 1]! << 8) | (data[i + 2]! << 16) | (data[i + 3]! << 24);
        k = Math.imul(k, M);
        k ^= k >>> 24;
        h = Math.imul(h, M) ^ Math.imul(k, M);
    }
    if (i < data.length) {
        for (let j = 0; i + j < data.length; j++) h ^= data[i + j]! << (8 * j);
        h = Math.imul(h, M);
    }
    h ^= h >>> 13;
    h = Math.imul(h, M);
    return (h ^ (h >>> 15)) >>> 0;
}

const SHOP_SLOTS = new Set<string>(["weapon", "vitality", "spirit"] satisfies ShopSlot[]);

/** The installed game's answers come from the public assets; when those cannot be fetched, as with no game. */
async function orNoGame<T>(read: () => Promise<T>, none: T): Promise<T> {
    try {
        return await read();
    } catch {
        return none;
    }
}

function shopItems(items: readonly AssetItem[]): ShopItem[] {
    return items
        .flatMap((item): ShopItem[] =>
            item.type === "upgrade" && SHOP_SLOTS.has(item.item_slot_type ?? "") && item.item_tier !== undefined
                ? [
                      {
                          id: item.id,
                          className: item.class_name,
                          slot: item.item_slot_type as ShopSlot,
                          tier: item.item_tier,
                          cost: item.cost ?? 0,
                          active: item.is_active_item ?? false,
                          components: (item.component_items ?? []).map(abilityId),
                          disabled: item.disabled ?? false,
                          shopable: item.shopable ?? false,
                          imbue: typeof item.imbue === "string" && item.imbue !== "",
                      },
                  ]
                : [],
        )
        .sort((a, b) => a.id - b.id);
}

const STAT_SECTIONS = new Set<string>(["innate", "passive", "active"] satisfies ItemStat["section"][]);

/**
 * The game's tooltip stat rule applied to the asset's copy of the abilities file. The asset leaves out
 * the intrinsic modifier list, so only stats a tooltip section shows are listed.
 */
function itemStats(items: readonly AssetItem[]): ItemStats[] {
    return items
        .flatMap((item): ItemStats[] => {
            if (item.type !== "upgrade") return [];
            const sections = (item.tooltip_sections ?? []).flatMap((section) =>
                (section.section_attributes ?? []).flatMap((attributes) =>
                    SHOWN_LISTS.flatMap((list) =>
                        (attributes[list] ?? []).map((name) => ({
                            kind: section.section_type ?? "",
                            name: typeof name === "string" ? name : name.name,
                        })),
                    ),
                ),
            );
            const stats = Object.entries(item.properties ?? {}).flatMap(([key, property]): ItemStat[] => {
                const shownIn = sections.filter((s) => s.name === key).map((s) => s.kind);
                const text = String(property.value ?? "").trim();
                const metres = text.endsWith("m");
                const value = Number(metres ? text.slice(0, -1) : text);
                const label = property.label || property.postvalue_label;
                if (shownIn.length === 0 || text === "" || !Number.isFinite(value) || value === 0 || !label) return [];
                const provides = property.provided_property_type ?? null;
                const flat =
                    provides !== null &&
                    shownIn.every((kind) => kind === "innate") &&
                    !(property.usage_flags ?? []).some((flag) => flag.includes("Conditionally")) &&
                    property.conditional === undefined;
                const first = shownIn[0]!;
                return [
                    {
                        key,
                        value,
                        unit: property.postfix || (metres ? "m" : null),
                        label,
                        flat,
                        provides,
                        section: STAT_SECTIONS.has(first) ? (first as ItemStat["section"]) : null,
                    },
                ];
            });
            return stats.length > 0 ? [{ itemId: item.id, stats }] : [];
        })
        .sort((a, b) => a.itemId - b.itemId);
}

/** Every hero shares one level table; the asset repeats it per hero. */
function heroProgression(heroes: readonly AssetHero[]): HeroProgression {
    const info = heroes.find((hero) => hero.level_info)?.level_info ?? {};
    const levels = Object.entries(info).map(([level, row]) => ({
        level: Number(level),
        souls: row.required_gold,
        ap: row.bonus_currencies?.includes("EAbilityPoints") ? 1 : 0,
        unlocks: row.bonus_currencies?.includes("EAbilityUnlocks") ? 1 : 0,
    }));
    return { levels: levels.sort((a, b) => a.level - b.level) };
}

function heroAbilities(heroes: readonly AssetHero[]): HeroAbilities[] {
    return heroes
        .flatMap((hero): HeroAbilities[] => {
            const slots = [1, 2, 3, 4].map((n) => hero.items?.[`signature${n}`]);
            if (slots.some((slot) => slot === undefined)) return [];
            const [a, b, c, d] = (slots as string[]).map(abilityId);
            return [{ heroId: hero.id, abilityIds: [a!, b!, c!, d!] }];
        })
        .sort((a, b) => a.heroId - b.heroId);
}

function popularItems(heroes: readonly AssetHero[], heroId: unknown): PopularItems | null {
    const popular = heroes.find((hero) => hero.id === heroId)?.popular_items;
    if (!popular) return null;
    const phase = (items: AssetPopularItem[] | undefined): PopularItem[] =>
        (items ?? []).map((item) => ({
            id: item.item_id,
            className: item.class_name,
            pickPct: item.pick_pct,
            winPct: item.winrate_pct,
        }));
    const out = {
        timestamp: popular.timestamp,
        earlyGame: phase(popular.early_game),
        midGame: phase(popular.mid_game),
        lateGame: phase(popular.late_game),
    };
    return out.earlyGame.length + out.midGame.length + out.lateGame.length > 0 ? out : null;
}

async function classArt(
    asset: AssetLoader,
    names: unknown,
    image: (item: AssetItem) => string | null | undefined,
): Promise<ClassArt[]> {
    const wanted = new Set(names as string[]);
    return (await asset<AssetItem[]>("items")).flatMap((item) => {
        const path = wanted.has(item.class_name) ? image(item) : null;
        return path ? [{ className: item.class_name, path }] : [];
    });
}

/** Lane slot of each player lane id, as the app assigns it when it reads the same table. */
const LANE_SLOTS: Readonly<Record<number, number>> = { 1: 1, 4: 3, 6: 4 };

/** Reads the fixture map table: three header lines, then tab-separated rows with `-` for an absent value. */
function fixtureMapItems(tsv: string): MapItemsPayload {
    const text = (v: string) => (v === "-" ? null : v);
    const number = (v: string) => (v === "-" ? null : Number(v));
    const rows: MapItem[] = [];
    const lanes: LaneLine[] = [];
    for (const line of tsv.split(/\r?\n/).slice(3)) {
        const f = line.split("\t");
        if (f[0] === "lane") {
            lanes.push({
                laneNum: Number(f[1]),
                laneSlot: LANE_SLOTS[Number(f[1])]!,
                markerSlot: Number(f[2]),
                startTeam: number(f[3]!),
                midIndex: Number(f[4]),
                nodes: f[5]!.split(";").map((node) => node.split(",").map(Number) as [number, number, number]),
            });
        } else if (f.length === 11) {
            rows.push({
                kind: f[0] as MapItem["kind"],
                team: number(f[1]!),
                laneSlot: number(f[2]!),
                objectiveId: number(f[3]!),
                x: Number(f[4]),
                y: Number(f[5]),
                z: Number(f[6]),
                className: f[7]!,
                subclass: text(f[8]!),
                name: text(f[9]!),
                hasIcon: f[10] === "1",
            });
        }
    }
    return { source: "game", installedBuild: null, table: { schema: 2, buildId: null, ventsCrc: 0, rows, lanes } };
}

export function matchDetailModule({ mapItemsTsv, recoverySession }: MatchDetailOptions): Module {
    return {
        name: "match-detail",
        create(context) {
            const { identity } = context;
            const shared = recoverySession?.current;
            const rows = historyRows(context);
            const history = shared?.spreadTimes
                ? spreadStartTimes(rows, Math.floor(context.now / 1000), shared.agedRows)
                : rows;
            const world: World = {
                identity,
                history,
                rows: new Map(history.map((row) => [row.match_id, row])),
                cores: new Map(),
            };
            const asset = assetLoader();
            const mapItems = fixtureMapItems(mapItemsTsv);
            const grades = new Map<number, MvpMatchGrade>();
            const gradeOf = (matchId: number): MvpMatchGrade | null => {
                if (!world.rows.has(matchId)) return null;
                let grade = grades.get(matchId);
                if (!grade) {
                    grade = demoGrade(metadata(world, matchId), identity.accountId);
                    grades.set(matchId, grade);
                }
                return grade;
            };

            const handlers: Handlers = {
                game_items: async (): Promise<ItemEntry[]> =>
                    (await asset<AssetItem[]>("items")).map((item) => ({
                        id: item.id,
                        className: item.class_name,
                        name: item.name,
                        localised: true,
                        kind: item.type,
                    })),
                game_item_art: (args) =>
                    classArt(asset, args.names, (item) =>
                        args.kind === "shop"
                            ? (item.shop_image_webp ?? item.shop_image)
                            : (item.image_webp ?? item.image),
                    ),
                game_ability_art: (args) => classArt(asset, args.names, (item) => item.image_webp ?? item.image),
                game_shop_items: () => orNoGame(async () => shopItems(await asset<AssetItem[]>("items")), []),
                game_item_stats: () => orNoGame(async () => itemStats(await asset<AssetItem[]>("items")), []),
                game_hero_progression: () =>
                    orNoGame(async () => heroProgression(await asset<AssetHero[]>("heroes")), { levels: [] }),
                game_hero_abilities: () => orNoGame(async () => heroAbilities(await asset<AssetHero[]>("heroes")), []),
                game_popular_items: (args) =>
                    orNoGame(async () => popularItems(await asset<AssetHero[]>("heroes"), args.heroId), null),
                game_build_tags: () => BUILD_TAGS.map((tag) => ({ ...tag })),
                game_accolades: async (): Promise<AccoladeEntry[]> =>
                    (await asset<AssetAccolade[]>("accolades")).map((a) => ({
                        id: a.id,
                        name: a.flavor_name,
                        description: a.description,
                        trackedStat: a.tracked_stat_name,
                    })),
                game_hero_art: async (): Promise<HeroArt[]> => {
                    return (await asset<AssetHero[]>("heroes")).map((hero) => ({
                        id: hero.id,
                        sm: null,
                        card: null,
                        mm: hero.images?.minimap_image_webp ?? null,
                    }));
                },
                game_minimap_art: async (): Promise<MinimapArtResult> => {
                    const map = await asset<AssetMap>("map");
                    const path = map.images?.minimap;
                    if (!path) return { status: "unavailable", local: "noInstall" };
                    return { status: "ready", path, radius: map.radius ?? 10752, source: "remote" };
                },
                game_minimap_icons: async (args): Promise<MinimapIconArt[]> => {
                    const files = (await asset<AssetIcons>("icons")).minimap ?? {};
                    return (args.icons as MinimapIcon[]).flatMap((icon) => {
                        const path = files[`${icon}_psd.png`];
                        return path ? [{ icon, path }] : [];
                    });
                },
                game_map_items: () => mapItems,

                get_postgame_detail: () => null,
                fetch_match_details: () => null,
                get_postgame_matches: (): ProvisionalMatch[] => [],
                reconcile_postgame_matches: () => 0,
                match_detail_cache_read: () => null,
                match_detail_cache_write: () => null,
                match_ping_points: (): MatchPingSeries | null => null,
                mvp_grades: ({ matchIds }): MvpMatchGrade[] =>
                    (matchIds as number[]).flatMap((id) => gradeOf(Number(id)) ?? []),
                mvp_grade_match: ({ matchId }) => gradeOf(Number(matchId)),
            };

            return {
                handlers,
                routes: [
                    [
                        /^\/v1\/matches\/\d+\/metadata$/,
                        (url) => {
                            const matchId = Number(url.pathname.split("/")[3]);
                            const recorded = shared
                                ? shared.recovery().coverage([matchId]).withDetails.includes(matchId)
                                : true;
                            return recorded && world.rows.has(matchId)
                                ? metadata(world, matchId)
                                : new Response(null, { status: 404 });
                        },
                    ],
                    [/^\/v1\/players\/steam$/, (url) => personaNames(identity, url)],
                ],
            };
        },
    };
}
