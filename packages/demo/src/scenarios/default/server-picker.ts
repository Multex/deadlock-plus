import type { EnginePingView } from "@deadlock-plus/ipc-types/EnginePingView";
import type { ExternalScan } from "@deadlock-plus/ipc-types/ExternalScan";
import type { FirewallCapability } from "@deadlock-plus/ipc-types/FirewallCapability";
import type { GameDefinition } from "@deadlock-plus/ipc-types/GameDefinition";
import type { HistoryPoint } from "@deadlock-plus/ipc-types/HistoryPoint";
import type { NetworkSnapshot } from "@deadlock-plus/ipc-types/NetworkSnapshot";
import type { PingSummary } from "@deadlock-plus/ipc-types/PingSummary";
import type { RelayInfo } from "@deadlock-plus/ipc-types/RelayInfo";
import type { RoutingNoteInfo } from "@deadlock-plus/ipc-types/RoutingNoteInfo";
import type { ServerData } from "@deadlock-plus/ipc-types/ServerData";
import type { ServerGroup } from "@deadlock-plus/ipc-types/ServerGroup";
import type { SyncOutcome } from "@deadlock-plus/ipc-types/SyncOutcome";

import type { Handlers } from "../../backend";
import { seeded } from "../../random";
import type { Module } from "../../scenario";

/** A saved region list, in the shape the frontend keeps in the `presets` store. */
interface Preset {
    id: string;
    name: string;
    mode: "allow" | "block";
    regionIds: string[];
}

const GAME: GameDefinition = {
    id: "deadlock",
    displayName: "Deadlock",
    appId: 1422450,
    keywordFilterMode: "none",
    keywords: [],
    clusterKeywords: ["Frankfurt", "Stockholm", "India"],
    serverPickerXClusters: ["China", "Hong Kong", "Sweden", "India", "Netherlands"],
    routingNotes: [
        {
            matches: ["Frankfurt", "Stockholm", "Helsinki"],
            note: "Deadlock has no Russia/Moscow relay; Valve's relay data lists none. Players Valve geolocates to Russia are routed to Frankfurt, Helsinki or Stockholm instead, so blocking only one of them just pushes them to another.",
        },
    ],
};

type Pop = [code: string, description: string, country: string, pingMs: number, relays: number];

const POPS: Pop[] = [
    ["fra", "Frankfurt (Germany)", "de", 24, 4],
    ["fra2", "Frankfurt 2 (Germany)", "de", 26, 2],
    ["ams", "Amsterdam (Netherlands)", "nl", 29, 3],
    ["vie", "Vienna (Austria)", "at", 31, 2],
    ["waw", "Warsaw (Poland)", "pl", 34, 2],
    ["par", "Paris (France)", "fr", 33, 2],
    ["lhr", "London (England)", "gb", 38, 3],
    ["sto", "Stockholm (Sweden)", "se", 41, 3],
    ["sto2", "Stockholm - Bromma (Sweden)", "se", 43, 2],
    ["hel", "Helsinki (Finland)", "fi", 46, 2],
    ["mad", "Madrid (Spain)", "es", 52, 2],
    ["iad", "Sterling (Virginia)", "us", 97, 4],
    ["atl", "Atlanta (Georgia)", "us", 108, 2],
    ["ord", "Chicago (Illinois)", "us", 112, 3],
    ["dfw", "Dallas (Texas)", "us", 131, 2],
    ["dxb", "Dubai (United Arab Emirates)", "ae", 138, 2],
    ["lax", "Los Angeles (California)", "us", 164, 3],
    ["sea", "Seattle (Washington)", "us", 171, 2],
    ["bom", "Mumbai (India)", "in", 149, 2],
    ["maa", "Chennai (India)", "in", 162, 2],
    ["jnb", "Johannesburg (South Africa)", "za", 187, 2],
    ["sgp", "Singapore", "sg", 198, 3],
    ["gru", "Sao Paulo (Brazil)", "br", 214, 3],
    ["hkg", "Hong Kong", "hk", 221, 2],
    ["eze", "Buenos Aires (Argentina)", "ar", 243, 2],
    ["scl", "Santiago (Chile)", "cl", 248, 2],
    ["tyo", "Tokyo (Japan)", "jp", 252, 3],
    ["lim", "Lima (Peru)", "pe", 256, 2],
    ["seo", "Seoul (South Korea)", "kr", 268, 2],
    ["syd", "Sydney (Australia)", "au", 297, 2],
];

function buildServerData(): ServerData {
    let host = 0;
    const unclustered: ServerGroup[] = POPS.map(([id, description, countryCode, , relays]) => ({
        id,
        description,
        isCluster: false,
        countryCode,
        // Addresses reserved for documentation, so no row points at a real host.
        relayIps: Array.from({ length: relays }, () => `203.0.113.${++host}`),
        memberIds: [],
        routingNote: null,
    }));

    const clustered: ServerGroup[] = [];
    for (const pop of unclustered) {
        const name = GAME.clusterKeywords.find((k) => pop.description.includes(k));
        if (!name) {
            clustered.push({ ...pop });
            continue;
        }
        const id = name.toLowerCase();
        const existing = clustered.find((g) => g.id === id);
        if (existing) {
            existing.relayIps = [...existing.relayIps, ...pop.relayIps];
            existing.memberIds.push(pop.id);
        } else {
            clustered.push({ ...pop, id, description: name, isCluster: true, memberIds: [pop.id] });
        }
    }

    const { matches, note } = GAME.routingNotes[0]!;
    for (const groups of [unclustered, clustered]) {
        const related = groups.filter((g) => matches.some((m) => g.description.includes(m)));
        for (const g of related) {
            const routingNote: RoutingNoteInfo = {
                note,
                relatedGroupIds: related.filter((o) => o.id !== g.id).map((o) => o.id),
                unblockableMatches: [],
            };
            g.routingNote = routingNote;
        }
        groups.sort((a, b) => a.description.localeCompare(b.description));
    }

    return { revision: "1760295600", unclustered, clustered };
}

const PING_BY_ID = new Map(POPS.map(([id, , , pingMs]) => [id, pingMs]));

const FAR_REGIONS = ["hkg", "india", "seo", "sgp", "tyo", "eze", "gru", "lim", "scl"];

const PRESETS: Preset[] = [
    {
        id: "demo-eu-only",
        name: "EU only",
        mode: "allow",
        regionIds: ["frankfurt", "ams", "vie", "waw", "par", "lhr", "stockholm", "hel", "mad"],
    },
    { id: "demo-no-far", name: "No Asia or South America", mode: "block", regionIds: FAR_REGIONS },
];

const RELAY_PING_MS = 24;
const HISTORY_SECONDS = 300;

function pingSeries(startMs: number, endMs: number, count: number): HistoryPoint[] {
    const random = seeded(Math.floor(startMs / 1000));
    const step = count > 1 ? (endMs - startMs) / (count - 1) : 0;
    return Array.from({ length: count }, (_, i) => {
        const spike = random() > 0.97 ? 6 + random() * 9 : 0;
        return {
            t: Math.round(startMs + i * step),
            raw: Math.round((RELAY_PING_MS - 2 + random() * 4 + spike) * 10) / 10,
        };
    });
}

function rangeSeries(args: Record<string, unknown>, maxPoints: number, now: number): HistoryPoint[] {
    const startMs = Number(args.startMs);
    const endMs = Math.min(Number(args.endMs), now);
    if (!(endMs > startMs)) return [];
    return pingSeries(startMs, endMs, Math.min(maxPoints, Math.floor((endMs - startMs) / 1000) + 1));
}

function relay(history: readonly HistoryPoint[], serverData: ServerData): RelayInfo {
    const raws = history.map((p) => p.raw ?? RELAY_PING_MS);
    const avg = raws.reduce((a, b) => a + b, 0) / raws.length;
    const jitter = raws.slice(1).reduce((sum, v, i) => sum + Math.abs(v - raws[i]!), 0) / (raws.length - 1);
    const frankfurt = serverData.unclustered.find((g) => g.id === "fra")!;
    return {
        ip: frankfurt.relayIps[0]!,
        port: 27031,
        popCode: frankfurt.id,
        description: frankfurt.description,
        countryCode: frankfurt.countryCode,
        ppsIn: 64,
        ppsOut: 62,
        maxGapMs: 31,
        ping: {
            current: raws.at(-1)!,
            avg,
            min: Math.min(...raws),
            max: Math.max(...raws),
            jitter,
            lossPct: 0,
            samples: raws.length,
        },
    };
}

/**
 * The Server Picker and the network monitor. With `inMatch` the game is running and connected to the Frankfurt
 * relay; without it Deadlock is closed, and the five minutes of ping history are what the monitor last recorded.
 */
export const serverPicker = ({ inMatch }: { inMatch: boolean }): Module => ({
    name: "server-picker",
    create({ now }) {
        const serverData = buildServerData();
        const blocked = new Set(FAR_REGIONS);
        const history = pingSeries(now - (HISTORY_SECONDS - 1) * 1000, now, HISTORY_SECONDS);
        const current = (): NetworkSnapshot => ({
            monitoring: true,
            needsPermission: false,
            traceError: null,
            gameRunning: inMatch,
            relay: inMatch ? relay(history, serverData) : null,
            updatedAtMs: now,
        });

        const handlers: Handlers = {
            get_game_definitions: (): GameDefinition[] => [GAME],
            firewall_capability: (): FirewallCapability => ({ supported: true }),
            fetch_server_groups: (): ServerData => serverData,
            ping_server_groups: (args): Record<string, number | null> => {
                const groups = args.groups as { id: string }[];
                return Object.fromEntries(groups.map((g) => [g.id, PING_BY_ID.get(g.id) ?? null]));
            },
            list_blocked_group_ids: (args): string[] => (args.candidateIds as string[]).filter((id) => blocked.has(id)),
            block_server_groups: (args): null => {
                for (const group of args.groups as { id: string }[]) blocked.add(group.id);
                return null;
            },
            unblock_server_groups: (args): null => {
                for (const id of args.ids as string[]) blocked.delete(id);
                return null;
            },
            sync_server_blocks: (): SyncOutcome => ({ updated: [], failed: [] }),
            detect_external_blocks: (): ExternalScan => ({ ruleNames: [], sources: [], coveredGroupIds: [] }),
            import_external_blocks: (): string[] => [],

            start_network_monitor: (): null => null,
            network_snapshot: current,
            network_history: (): HistoryPoint[] => history,
            network_poll: (args): { snapshot: NetworkSnapshot; tail: HistoryPoint[] } => {
                const sinceT = typeof args.sinceT === "number" ? args.sinceT : -1;
                return { snapshot: current(), tail: history.filter((p) => p.t > sinceT) };
            },
            // The game's own reading replaces the relay stats and restarts the chart from empty, so it stays off.
            engine_ping_latest: (): EnginePingView | null => null,
            network_history_points: (args): HistoryPoint[] => rangeSeries(args, Number(args.maxPoints), now),
            network_history_range: (args): PingSummary | null => {
                const raws = rangeSeries(args, 300, now).flatMap((p) => (p.raw === null ? [] : [p.raw]));
                if (raws.length === 0) return null;
                return {
                    avg: raws.reduce((a, b) => a + b, 0) / raws.length,
                    worst: Math.max(...raws),
                    samples: Math.floor((Math.min(Number(args.endMs), now) - Number(args.startMs)) / 1000) + 1,
                };
            },
        };

        return {
            handlers,
            kv: {
                "server-picker-cache": { [`serverData:${GAME.id}`]: serverData },
                presets: { presets: PRESETS, defaultsSeeded: true },
            },
        };
    },
});

export const serverPickerModule = serverPicker({ inMatch: false });
