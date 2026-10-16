import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
import type { RankTier } from "@deadlock-plus/stats/rank";
import { getLiveMatch, getLiveState, onLiveMatch, onLiveSnapshot, type LiveMatch, type LiveState } from "./api";
import { BOARD_LINGER_MS, NO_SWAPS, boardVisible, postMatchStart, trackSwaps, type SwapTracker } from "./live";
import { loadRankTiers } from "$lib/features/ranks/ranks";
import { keepGameArt } from "$lib/features/gamedata/art-refresh";

class LiveStore {
    state = $state.raw<LiveState | null>(null);
    match = $state.raw<LiveMatch | null>(null);
    heroes = $state<Record<number, Hero>>({});
    tiers = $state.raw<RankTier[]>([]);
    private postMatchAt = $state<number | null>(null);
    private now = $state(Date.now());
    private timer: ReturnType<typeof setTimeout> | null = null;
    private tracker = $state.raw<SwapTracker>(NO_SWAPS);
    private swapsDismissed = $state(false);

    readonly swaps = $derived(this.swapsDismissed ? [] : this.tracker.swaps);

    dismissSwaps() {
        this.swapsDismissed = true;
    }

    private refreshUnknownHeroes() {
        const ids = (this.match?.teams ?? []).flatMap((t) => t.players).flatMap((p) => (p.heroId ? [p.heroId] : []));
        if (ids.every((id) => id in this.heroes)) return;
        void loadHeroes(ids).then((h) => {
            if (h !== this.heroes) this.heroes = h;
        });
    }

    private trackHeroes() {
        this.refreshUnknownHeroes();
        if (this.state === null) return;
        const players = (this.match?.teams ?? []).flatMap((t) => t.players);
        const next = trackSwaps(this.tracker, this.state.phase, players);
        if (next === this.tracker) return;
        if (next === NO_SWAPS || this.state.phase === "pregame") this.swapsDismissed = false;
        this.tracker = next;
    }

    readonly boardShown = $derived(
        this.state !== null &&
            boardVisible(this.state.phase, this.postMatchAt === null ? null : this.now - this.postMatchAt),
    );

    private apply(next: LiveState) {
        this.now = Date.now();
        this.postMatchAt = postMatchStart(next.phase, this.postMatchAt, this.now);
        this.state = next;
        this.trackHeroes();
        this.schedule();
    }

    private schedule() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        if (this.postMatchAt === null) return;
        const left = this.postMatchAt + BOARD_LINGER_MS - Date.now();
        if (left <= 0) {
            this.now = Date.now();
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            this.now = Date.now();
        }, left);
    }

    /** Hydrates once, then follows pushed events. Returns the cleanup. */
    start() {
        let stopped = false;
        const unlisteners: Array<() => void> = [];
        const keep = (fn: () => void) => {
            if (stopped) fn();
            else unlisteners.push(fn);
        };

        onLiveSnapshot((next) => {
            if (!stopped) this.apply(next);
        })
            .then(keep)
            .catch(() => {});
        onLiveMatch((next) => {
            if (stopped) return;
            this.match = next;
            this.trackHeroes();
        })
            .then(keep)
            .catch(() => {});

        getLiveState()
            .then((initial) => {
                // A pushed snapshot may already be newer than this reply.
                if (!stopped && this.state === null) this.apply(initial);
            })
            .catch(() => {});
        getLiveMatch()
            .then((initial) => {
                if (stopped || this.match !== null) return;
                this.match = initial;
                this.trackHeroes();
            })
            .catch(() => {});

        void loadHeroes().then((h) => {
            if (!stopped) this.heroes = h;
        });
        keep(
            onHeroesRefreshed((h) => {
                if (!stopped) this.heroes = h;
            }),
        );
        keep(
            keepGameArt(() =>
                loadRankTiers().then((r) => {
                    if (!stopped) this.tiers = r;
                }),
            ),
        );

        return () => {
            stopped = true;
            if (this.timer) clearTimeout(this.timer);
            this.timer = null;
            for (const fn of unlisteners) fn();
        };
    }
}

export const live = new LiveStore();
