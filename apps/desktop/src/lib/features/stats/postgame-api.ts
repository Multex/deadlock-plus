import { command, listen, type Unlisten } from "$lib/core/tauri";
import type { ProvisionalMatch } from "@deadlock-plus/ipc-types/ProvisionalMatch";

const MATCH_EVENT = "postgame-match";

export type { ProvisionalMatch };

export const getPostgameMatches = (accountId: number) =>
    command<ProvisionalMatch[]>("get_postgame_matches", { accountId });
export const reconcilePostgameMatches = (accountId: number, apiMatchIds: number[]) =>
    command<number>("reconcile_postgame_matches", { accountId, apiMatchIds });
export const onPostgameMatch = (handler: (match: ProvisionalMatch) => void): Promise<Unlisten> =>
    listen<ProvisionalMatch>(MATCH_EVENT, handler);
