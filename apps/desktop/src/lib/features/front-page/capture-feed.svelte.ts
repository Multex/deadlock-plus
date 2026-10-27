import type { Unlisten } from "$lib/core/tauri";
import { onPostgameMatch, type ProvisionalMatch } from "$lib/features/stats/postgame-api";
import { rowMode, type RowMode } from "@deadlock-plus/match/list";

export interface Capture {
    matchId: number;
    mode: RowMode;
}

/** The latest `postgame-match`, kept outside the front page's error region so a remounted page can pick it up. */
export class CaptureFeed {
    latest = $state.raw<Capture | null>(null);
    #followers = new Set<(capture: Capture) => void>();

    push(matchId: number, mode: RowMode): void {
        const capture = { matchId, mode };
        this.latest = capture;
        for (const follower of this.#followers) follower(capture);
    }

    /** Starts with the latest capture, then hands over each new one. Returns the function that stops it. */
    follow(onCapture: (capture: Capture) => void): () => void {
        this.#followers.add(onCapture);
        if (this.latest) onCapture(this.latest);
        return () => this.#followers.delete(onCapture);
    }
}

export const captureFeed = new CaptureFeed();

export function startCaptureFeed(
    listen: (handler: (match: ProvisionalMatch) => void) => Promise<Unlisten> = onPostgameMatch,
    feed: CaptureFeed = captureFeed,
): () => void {
    let stopped = false;
    let unlisten: Unlisten | null = null;
    listen((match) => feed.push(match.matchId, rowMode(match))).then(
        (stop) => {
            if (stopped) stop();
            else unlisten = stop;
        },
        () => {},
    );
    return () => {
        stopped = true;
        unlisten?.();
    };
}
