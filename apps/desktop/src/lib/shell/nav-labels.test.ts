import { describe, expect, it } from "vitest";
import { navLabel } from "./nav-labels";

describe("navLabel", () => {
    it("translates every registered feature id", () => {
        const ids: Record<string, string> = {
            home: "Home",
            "server-picker": "Server Picker",
            live: "Live",
            stats: "Stats",
            rank: "Rank",
            sessions: "Sessions",
            alerts: "News",
            presence: "Presence",
            "match-history": "Match History",
            performance: "Performance",
            "voice-bans": "Mutes",
            demos: "Replays",
            storage: "Storage",
        };
        for (const [id, label] of Object.entries(ids)) expect(navLabel(id, "fallback")).toBe(label);
    });

    it("falls back to the registry label for an unknown id", () => {
        expect(navLabel("future-feature", "Future")).toBe("Future");
    });
});
