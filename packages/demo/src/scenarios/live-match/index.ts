import type { JobsSnapshot } from "@deadlock-plus/ipc-types/JobsSnapshot";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { LivePlayer } from "@deadlock-plus/ipc-types/LivePlayer";
import type { LiveSide } from "@deadlock-plus/ipc-types/LiveSide";
import type { LiveState } from "@deadlock-plus/ipc-types/LiveState";
import type { LiveTeam } from "@deadlock-plus/ipc-types/LiveTeam";
import type { VoiceBanFile } from "@deadlock-plus/ipc-types/VoiceBanFile";

import type { Handlers } from "../../backend";
import type { ApiRoute } from "../../fetch";
import { defineScenario, type Identity, type Module, type Scenario } from "../../scenario";
import type { ScenarioOptions } from "../default";
import { adminAccessModule } from "../default/admin-access";
import { fakeAccountId, fakeName, IDENTITY, MATCH_IDS, NOW_MS, SEED } from "../default/identity";
import { matchDetailModule } from "../default/match-detail";
import { progressModule } from "../default/progress";
import { serverPicker } from "../default/server-picker";
import { shellModule } from "../default/shell";
import { supportModule } from "../default/support";
import { upkeepModule } from "../default/upkeep";
import { analyticsRoutes } from "./analytics";

const STEAM64_OFFSET = 76561197960265728n;
const CLOCK_SECS = 23 * 60 + 41;
const TEAM_SIZE = 6;
const YOUR_SLOT = 0;

const STATE: LiveState = { phase: "inMatch", matchPresent: true };

/**
 * One row per lobby slot, The Hidden King's six first. Columns: hero, rank badge (tier times ten plus subrank),
 * souls, kills, deaths, assists, hero damage, objective damage, healing, and the part of that healing the player
 * gave themself. The hero ids are Lash, Infernus, Dynamo, Haze, Abrams and Kelvin against Seven, Vindicta, Lady
 * Geist, Wraith, McGinnis and Paradox. Each team's kills add up to the other team's deaths.
 */
const PLAYERS: readonly (readonly number[])[] = [
    [31, 86, 31240, 9, 3, 8, 21480, 3120, 4210, 3380],
    [1, 85, 28410, 7, 4, 6, 24950, 2480, 1890, 1720],
    [11, 84, 22870, 2, 5, 15, 9860, 1740, 11320, 2410],
    [13, 91, 33980, 8, 4, 5, 26110, 5230, 2140, 2140],
    [6, 86, 25630, 4, 6, 11, 15240, 4390, 9870, 9120],
    [12, 83, 21150, 1, 4, 14, 8730, 6820, 13460, 2880],
    [2, 85, 29870, 8, 5, 7, 23340, 2910, 1620, 1480],
    [3, 92, 27560, 6, 4, 6, 20870, 1980, 980, 980],
    [4, 84, 24310, 5, 6, 8, 18420, 3640, 6230, 5940],
    [7, 86, 30120, 5, 5, 4, 19760, 7410, 1450, 1310],
    [8, 82, 23480, 1, 5, 12, 11230, 8950, 12740, 3150],
    [10, 85, 20940, 1, 6, 11, 9410, 2260, 2880, 2610],
];

function player(identity: Identity, cells: readonly number[], slot: number): LivePlayer {
    const [heroId, rank, souls, kills, deaths, assists, heroDamage, objectiveDamage, healing, selfHealing] = cells;
    const isYou = slot === YOUR_SLOT;
    // The invented names start after the player's own slot.
    const other = slot - 1;
    return {
        key: slot,
        side: slot < TEAM_SIZE ? "amber" : "sapphire",
        name: isYou ? identity.persona : fakeName(identity, other),
        steamId: isYou ? identity.steamId64 : (BigInt(fakeAccountId(identity, other)) + STEAM64_OFFSET).toString(),
        heroId: heroId!,
        rank: rank!,
        souls: souls!,
        kills: kills!,
        deaths: deaths!,
        assists: assists!,
        heroDamage: heroDamage!,
        objectiveDamage: objectiveDamage!,
        healing: healing!,
        selfHealing: selfHealing!,
        isYou,
    };
}

function liveMatch(identity: Identity): LiveMatch {
    const players = PLAYERS.map((cells, slot) => player(identity, cells, slot));
    const team = (side: LiveSide): LiveTeam => {
        const own = players.filter((p) => p.side === side);
        return { side, souls: own.reduce((sum, p) => sum + p.souls!, 0), players: own };
    };
    return {
        clockSecs: CLOCK_SECS,
        paused: false,
        matchMode: "ranked",
        gameMode: "normal",
        perspective: "playing",
        yourSide: "amber",
        teams: [team("amber"), team("sapphire")],
        queue: null,
    };
}

// What a rank lookup of the lobby finds besides plain ranks: one account opted out of the API, one player
// still in placements, and one whose last ranked match is over 30 days old.
const OPTED_OUT_SLOT = 4;
const PLACEMENTS_SLOT = 9;
const STALE_SLOT = 7;
const DAY_S = 86_400;

interface RankRow {
    account_id: number;
    badge: number;
    rank: number;
    subrank: number;
    last_match: { match_id: number; start_time: number } | null;
}

function rankRow(slot: number, accountId: number, nowS: number): RankRow | null {
    if (slot === OPTED_OUT_SLOT) return null;
    if (slot === PLACEMENTS_SLOT) return { account_id: accountId, badge: 0, rank: 0, subrank: 0, last_match: null };
    const badge = PLAYERS[slot]![1]!;
    const ago = slot === STALE_SLOT ? 41 * DAY_S : (slot + 1) * 5 * 3600;
    return {
        account_id: accountId,
        badge,
        rank: Math.floor(badge / 10),
        subrank: badge % 10,
        last_match: { match_id: MATCH_IDS[0]! + 1 + slot, start_time: nowS - ago },
    };
}

/**
 * The analytics the Live page grades the player against, and `GET /v1/players/rank`, which an unranked match
 * asks for the lobby's ranks. Accounts outside the lobby are absent.
 */
const liveAnalytics: Module = {
    name: "live-analytics",
    create({ identity, now }) {
        const nowS = Math.floor(now / 1000);
        const rows = new Map<number, RankRow>();
        PLAYERS.forEach((cells, slot) => {
            const steamId = player(identity, cells, slot).steamId!;
            const accountId = Number(BigInt(steamId) - STEAM64_OFFSET);
            const row = rankRow(slot, accountId, nowS);
            if (row) rows.set(accountId, row);
        });
        const routes: ApiRoute[] = [
            [
                /^\/v1\/players\/rank$/,
                (url) =>
                    (url.searchParams.get("account_ids") ?? "").split(",").flatMap((id) => rows.get(Number(id)) ?? []),
            ],
            ...analyticsRoutes,
        ];
        return { routes };
    },
};

/** What the app's own command answers when asked to change the mute list while the game runs. */
function gameRunning(): never {
    throw { code: "voice_bans.game_running", params: {} };
}

/** `module` with some of its handlers answering differently; `change` gets the module's own handlers. */
function adapted(module: Module, change: (handlers: Handlers, identity: Identity) => Handlers): Module {
    return {
        name: module.name,
        create(context, replaced) {
            const parts = module.create(context, replaced);
            const handlers = parts.handlers ?? {};
            return { ...parts, handlers: { ...handlers, ...change(handlers, context.identity) } };
        },
    };
}

/**
 * The established player of the default scenario, 23 minutes into a ranked six against six on The Hidden
 * King's side. Every command that reports the game's state says the same thing: running, in a match, connected
 * to the Frankfurt relay. The game's own ping reading stays off, as it does when the game cannot be read, so
 * the Live page shows the relay's ping and its five minutes of history.
 */
export function liveMatchScenario(options: ScenarioOptions): Scenario {
    const shell = adapted(shellModule(options), (handlers, identity) => {
        const match = liveMatch(identity);
        return {
            is_game_running: () => true,
            get_live_state: () => STATE,
            get_live_match: () => match,
            jobs_snapshot: (args): JobsSnapshot => ({
                ...(handlers.jobs_snapshot!(args) as JobsSnapshot),
                gameRunning: true,
            }),
        };
    });
    const support = adapted(supportModule(options), (handlers) => ({
        build_support_report: (args) =>
            String(handlers.build_support_report!(args)).replaceAll("running: no\n", "running: yes\n"),
    }));
    const upkeep = adapted(upkeepModule, (handlers) => ({
        read_voice_ban: (args): VoiceBanFile => ({
            ...(handlers.read_voice_ban!(args) as VoiceBanFile),
            gameRunning: true,
        }),
        write_voice_ban: gameRunning,
    }));
    return defineScenario({
        id: "live-match",
        identity: IDENTITY,
        now: NOW_MS,
        seed: SEED,
        modules: [
            shell,
            support,
            serverPicker({ inMatch: true }),
            progressModule,
            liveAnalytics,
            matchDetailModule(options),
            upkeep,
            adminAccessModule(),
        ],
    });
}
