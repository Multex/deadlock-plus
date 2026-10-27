import { command } from "$lib/core/tauri";
import type { ExternalScan, FirewallCapability, GameDefinition, PingResults, ServerData, SyncOutcome } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export async function getGameDefinitions() {
    const defs = await command<GameDefinition[]>("get_game_definitions");
    if (!Array.isArray(defs)) throw new Error("get_game_definitions returned an unexpected shape");
    return defs;
}

export async function fetchServerGroups(gameId: string) {
    const data = await command<ServerData>("fetch_server_groups", { gameId });
    if (!isRecord(data) || !Array.isArray(data.clustered) || !Array.isArray(data.unclustered))
        throw new Error("fetch_server_groups returned an unexpected shape");
    return data;
}

export async function pingServerGroups(groups: { id: string; relayIps: string[] }[]) {
    const results = await command<PingResults>("ping_server_groups", { groups });
    if (!isRecord(results)) throw new Error("ping_server_groups returned an unexpected shape");
    return results;
}

export function blockServerGroups(groups: { id: string; description: string; relayIps: string[] }[]) {
    return command<void>("block_server_groups", { groups });
}

export function unblockServerGroups(ids: string[]) {
    return command<void>("unblock_server_groups", { ids });
}

export function listBlockedGroupIds(candidateIds: string[]) {
    return command<string[]>("list_blocked_group_ids", { candidateIds });
}

export function syncServerBlocks() {
    return command<SyncOutcome>("sync_server_blocks");
}

export async function firewallCapability() {
    const capability = await command<FirewallCapability>("firewall_capability");
    if (!isRecord(capability) || typeof capability.supported !== "boolean")
        throw new Error("firewall_capability returned an unexpected shape");
    return capability;
}

export async function detectExternalBlocks(gameId: string) {
    const scan = await command<ExternalScan>("detect_external_blocks", { gameId });
    if (!isRecord(scan) || ![scan.ruleNames, scan.sources, scan.coveredGroupIds].every(Array.isArray))
        throw new Error("detect_external_blocks returned an unexpected shape");
    return scan;
}

export function importExternalBlocks(gameId: string) {
    return command<string[]>("import_external_blocks", { gameId });
}
