import { deadlockApi } from "$lib/core/deadlock-api";
import { kvGet, kvSet } from "$lib/core/kv";
import { NameResolver } from "@deadlock-plus/match/names";

const STORE = "stats-cache";
const KEY = "player-names";

export const playerNames = new NameResolver({
    fetchBatch: (ids) => deadlockApi.steamProfiles(ids),
    load: () => kvGet(STORE, KEY),
    save: (names) => kvSet(STORE, KEY, names),
    now: () => Date.now(),
});
