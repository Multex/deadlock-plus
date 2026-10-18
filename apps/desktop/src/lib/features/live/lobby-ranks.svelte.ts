import { untrack } from "svelte";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { LivePlayer } from "@deadlock-plus/ipc-types/LivePlayer";
import type { DeadlockApi } from "@deadlock-plus/deadlock-api";
import { deadlockApi } from "$lib/core/deadlock-api";
import { live } from "./live.svelte";
import { badgeMap, boardRank, cachedRankLookup, rankLookupIds, type BoardRank } from "./lobby-ranks";

export interface LobbyRanksDeps {
    live: { readonly match: LiveMatch | null };
    lookup: DeadlockApi["playerRanks"];
    /** Calls `onChange` with `read()` now and each time it changes. Returns the stop. */
    watch?: (read: () => string | null, onChange: (key: string | null) => void) => () => void;
}

function watchWithEffect(read: () => string | null, onChange: (key: string | null) => void): () => void {
    return $effect.root(() => {
        $effect(() => {
            const key = read();
            untrack(() => onChange(key));
        });
    });
}

const EMPTY: ReadonlyMap<number, number> = new Map();

/** Ranks from deadlock-api.com for lobbies where the game shows none, such as unranked. */
export class LobbyRanksStore {
    // The reader fills players in over the first seconds of pregame. Badges are looked up by account,
    // so the last reply keeps serving while a grown lobby is asked again.
    private badges = $state.raw<ReadonlyMap<number, number>>(EMPTY);
    private readonly key = $derived.by(() => {
        const ids = rankLookupIds(this.deps.live.match);
        return ids.length === 0 ? null : ids.join(",");
    });
    private token = 0;

    constructor(private readonly deps: LobbyRanksDeps) {}

    rank(player: LivePlayer): BoardRank {
        return boardRank(player, this.badges);
    }

    private begin(key: string | null) {
        const token = ++this.token;
        if (key === null) {
            this.badges = EMPTY;
            return;
        }
        this.deps
            .lookup(key.split(",").map(Number))
            .then((rows) => {
                if (token === this.token) this.badges = badgeMap(rows);
            })
            .catch(() => {});
    }

    start(): () => void {
        const watch = this.deps.watch ?? watchWithEffect;
        const stopWatching = watch(
            () => this.key,
            (key) => this.begin(key),
        );
        return () => {
            stopWatching();
            this.token++;
            this.badges = EMPTY;
        };
    }
}

/** Shared with the grades, which look up the same unranked lobby. */
export const rankLookup = cachedRankLookup(deadlockApi);

export const lobbyRanks = new LobbyRanksStore({ live, lookup: rankLookup });
