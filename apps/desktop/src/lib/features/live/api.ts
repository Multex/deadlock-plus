import { command, listen, type Unlisten } from "$lib/core/tauri";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { LiveState } from "@deadlock-plus/ipc-types/LiveState";

const SNAPSHOT_EVENT = "live-snapshot";
const MATCH_EVENT = "live-match";

export type { LiveMatch, LiveState };

export const getLiveState = () => command<LiveState>("get_live_state");
export const onLiveSnapshot = (handler: (state: LiveState) => void): Promise<Unlisten> =>
    listen<LiveState>(SNAPSHOT_EVENT, handler);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export async function getLiveMatch() {
    const match = await command<LiveMatch>("get_live_match");
    if (
        !isRecord(match) ||
        !Array.isArray(match.teams) ||
        !match.teams.every((t) => isRecord(t) && Array.isArray(t.players))
    )
        throw new Error("get_live_match returned an unexpected shape");
    return match;
}

export const onLiveMatch = (handler: (match: LiveMatch) => void): Promise<Unlisten> =>
    listen<LiveMatch>(MATCH_EVENT, handler);
