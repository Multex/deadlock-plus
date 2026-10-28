import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ProvisionalMatch } from "@deadlock-plus/ipc-types/ProvisionalMatch";

vi.mock("$lib/features/stats/postgame-api", () => ({ onPostgameMatch: vi.fn() }));

import { CaptureFeed, startCaptureFeed, type Capture } from "./capture-feed.svelte";

function follow(feed: CaptureFeed) {
    const seen: Capture[] = [];
    const stop = feed.follow((c) => seen.push(c));
    return { seen, stop };
}

describe("CaptureFeed.follow", () => {
    it("hands over the latest capture at once, so a front page mounted after it still tosses it", () => {
        const feed = new CaptureFeed();
        feed.push(9, "ranked");
        const { seen, stop } = follow(feed);
        expect(seen).toEqual([{ matchId: 9, mode: "ranked" }]);
        stop();
    });

    it("hands over every later capture, the same match again included", () => {
        const feed = new CaptureFeed();
        const { seen, stop } = follow(feed);
        expect(seen).toEqual([]);
        feed.push(9, "ranked");
        feed.push(9, "ranked");
        expect(seen.map((c) => c.matchId)).toEqual([9, 9]);
        stop();
        feed.push(10, "ranked");
        expect(seen).toHaveLength(2);
    });
});

describe("startCaptureFeed", () => {
    it("records each postgame match and stops listening on stop", async () => {
        let handler: ((m: ProvisionalMatch) => void) | null = null;
        const unlisten = vi.fn();
        const listen = vi.fn((h: (m: ProvisionalMatch) => void) => {
            handler = h;
            return Promise.resolve(unlisten);
        });
        const feed = new CaptureFeed();
        const stop = startCaptureFeed(listen, feed);
        await Promise.resolve();
        handler!({ matchId: 12, gameMode: 1, matchMode: 4 } as unknown as ProvisionalMatch);
        expect(feed.latest?.matchId).toBe(12);
        stop();
        expect(unlisten).toHaveBeenCalledTimes(1);
    });
});

describe("root layout", () => {
    it("starts the after-match front page over when a new match is captured", () => {
        const source = readFileSync(new URL("../../../routes/+layout.svelte", import.meta.url), "utf8");
        expect(source).toMatch(/<AppRegion name="front-page" quiet resetKey=\{captureFeed\.latest\?\.matchId\}>/);
    });
});
