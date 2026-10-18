import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import type { PlayerRank } from "@deadlock-plus/deadlock-api";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { LivePlayer } from "@deadlock-plus/ipc-types/LivePlayer";

vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("./live.svelte", () => ({ live: { state: null, match: null } }));

import { LobbyRanksStore, type LobbyRanksDeps } from "./lobby-ranks.svelte";

const STEAM64_OFFSET = 76561197960265728n;
const steamId = (accountId: number) => (BigInt(accountId) + STEAM64_OFFSET).toString();

class FakeLive {
    match = $state.raw<LiveMatch | null>(null);
}

function player(key: number): LivePlayer {
    return {
        key,
        side: key % 2 === 0 ? "amber" : "sapphire",
        name: null,
        steamId: steamId(key),
        heroId: 10 + key,
        rank: null,
        souls: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        heroDamage: 0,
        objectiveDamage: 0,
        healing: 0,
        selfHealing: 0,
        isYou: key === 0,
    };
}

function match(matchMode: LiveMatch["matchMode"], keys = [0, 1, 2, 3]): LiveMatch {
    const players = keys.map(player);
    return {
        clockSecs: 0,
        paused: false,
        matchMode,
        gameMode: "normal",
        perspective: "playing",
        yourSide: "amber",
        teams: [
            { side: "amber", souls: 0, players: players.filter((p) => p.side === "amber") },
            { side: "sapphire", souls: 0, players: players.filter((p) => p.side === "sapphire") },
        ],
        queue: null,
    };
}

const row = (account_id: number, badge: number): PlayerRank => ({
    account_id,
    badge,
    rank: Math.floor(badge / 10),
    subrank: badge % 10,
    last_match: null,
});

const lookup = vi.fn<(ids: readonly (number | string)[]) => Promise<PlayerRank[]>>();
let fake: FakeLive;
let store: LobbyRanksStore;
let stop: (() => void) | null = null;
let poll = () => {};

// Vitest compiles Svelte for the server here, where `$effect` never runs, so the store's watch is driven by hand.
const pollingWatch: LobbyRanksDeps["watch"] = (read, onChange) => {
    let last: string | null | undefined;
    poll = () => {
        const key = read();
        if (key === last) return;
        last = key;
        onChange(key);
    };
    poll();
    return () => {
        poll = () => {};
    };
};

async function show(m: LiveMatch | null) {
    fake.match = m;
    flushSync();
    poll();
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
    lookup.mockReset().mockResolvedValue([]);
    fake = new FakeLive();
    store = new LobbyRanksStore({ live: fake, lookup, watch: pollingWatch });
    stop = store.start();
});

afterEach(() => {
    stop?.();
    stop = null;
});

describe("LobbyRanksStore", () => {
    it("looks up an unranked lobby once and serves each player's badge", async () => {
        lookup.mockResolvedValue([row(1, 83), row(2, 41)]);
        await show(match("unranked"));
        await show(match("unranked"));
        expect(lookup).toHaveBeenCalledExactlyOnceWith([0, 1, 2, 3]);
        expect(store.rank(player(1))).toEqual({ rank: 83, fromHistory: true });
        expect(store.rank(player(3))).toEqual({ rank: null, fromHistory: false });
    });

    it("asks nothing in ranked", async () => {
        await show(match("ranked"));
        expect(lookup).not.toHaveBeenCalled();
    });

    it("keeps the badges it has while a grown lobby is looked up", async () => {
        lookup.mockResolvedValueOnce([row(1, 83)]);
        await show(match("unranked", [0, 1]));
        let release: (rows: PlayerRank[]) => void = () => {};
        lookup.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
        await show(match("unranked", [0, 1, 2]));
        expect(store.rank(player(1)).rank).toBe(83);
        release([row(1, 83), row(2, 41)]);
        await show(match("unranked", [0, 1, 2]));
        expect(store.rank(player(2)).rank).toBe(41);
    });

    it("drops the badges once the match is gone and ignores a late reply", async () => {
        let release: (rows: PlayerRank[]) => void = () => {};
        lookup.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
        await show(match("unranked"));
        await show(null);
        release([row(1, 83)]);
        await show(null);
        expect(store.rank(player(1)).rank).toBeNull();
    });

    it("shows nothing extra when the lookup fails", async () => {
        lookup.mockRejectedValue(new Error("down"));
        await show(match("unranked"));
        expect(store.rank(player(1))).toEqual({ rank: null, fromHistory: false });
    });
});
