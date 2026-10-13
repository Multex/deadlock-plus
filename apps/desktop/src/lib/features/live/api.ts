import { command, listen, type Unlisten } from "$lib/core/tauri";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { LiveState } from "@deadlock-plus/ipc-types/LiveState";

const SNAPSHOT_EVENT = "live-snapshot";
const MATCH_EVENT = "live-match";

export type { LiveMatch, LiveState };

export const getLiveState = () => command<LiveState>("get_live_state");
export const onLiveSnapshot = (handler: (state: LiveState) => void): Promise<Unlisten> =>
    listen<LiveState>(SNAPSHOT_EVENT, handler);

export const getLiveMatch = () => command<LiveMatch>("get_live_match");
export const onLiveMatch = (handler: (match: LiveMatch) => void): Promise<Unlisten> =>
    listen<LiveMatch>(MATCH_EVENT, handler);
