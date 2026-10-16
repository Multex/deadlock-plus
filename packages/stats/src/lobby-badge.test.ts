import { describe, expect, it } from "vitest";
import {
    badgeFilter,
    groupFilter,
    groupLabel,
    meanBadge,
    MIN_MATCHES,
    nextGroup,
    startGroup,
    tierRange,
    unrankedLobbyBadge,
    widen,
    type ComparisonGroup,
    type RankRow,
} from "./lobby-badge";

const DAY = 86_400;
const NOW = 1_800_000_000;

const row = (badge: number, daysAgo: number | null = 1): RankRow => ({
    badge,
    last_match: daysAgo === null ? null : { start_time: NOW - daysAgo * DAY },
});

const tiers = (fromTier: number, toTier: number): ComparisonGroup => ({ kind: "tiers", range: { fromTier, toTier } });

describe("meanBadge", () => {
    it("gives a real badge for Mystic 6 and Ritualist 1, not the 59 a plain mean rounds to", () => {
        expect(meanBadge([56, 61])).toBe(61);
    });

    it("excludes zeros", () => {
        expect(meanBadge([0, 0, 43, 0])).toBe(43);
    });

    it("returns null when every badge is zero or missing", () => {
        expect(meanBadge([])).toBeNull();
        expect(meanBadge([0, null, 0])).toBeNull();
    });

    it("averages within one tier", () => {
        expect(meanBadge([82, 84])).toBe(83);
        expect(meanBadge([81, 82])).toBe(82);
    });

    it("rounds across tiers on the dense subrank scale", () => {
        expect(meanBadge([16, 21, 22])).toBe(21);
        expect(meanBadge([11, 116])).toBe(64);
    });

    it("always lands on subrank 1-6", () => {
        const all = Array.from({ length: 11 }, (_, t) =>
            Array.from({ length: 6 }, (_, s) => (t + 1) * 10 + s + 1),
        ).flat();
        for (const a of all)
            for (const b of all) {
                const sub = meanBadge([a, b])! % 10;
                expect(sub).toBeGreaterThanOrEqual(1);
                expect(sub).toBeLessThanOrEqual(6);
            }
    });
});

describe("unrankedLobbyBadge", () => {
    it("averages the usable ranks when at least four are left", () => {
        expect(unrankedLobbyBadge([row(81), row(82), row(83), row(84)], null, NOW)).toBe(83);
    });

    it("skips unranked badges, missing last matches and ranks older than 30 days", () => {
        const rows = [row(81), row(83), row(84), row(85), row(0), row(11, null), row(116, 31)];
        expect(unrankedLobbyBadge(rows, null, NOW)).toBe(83);
    });

    it("keeps a rank whose last match is exactly 30 days old", () => {
        expect(unrankedLobbyBadge([row(81), row(81), row(81), row(81, 30)], null, NOW)).toBe(81);
    });

    it("uses your own rank with fewer than four usable ranks", () => {
        expect(unrankedLobbyBadge([row(81), row(82), row(83)], 45, NOW)).toBe(45);
    });

    it("uses your own rank even when the lobby gave none", () => {
        expect(unrankedLobbyBadge([], 45, NOW)).toBe(45);
    });

    it("returns null with fewer than four usable ranks and no own rank", () => {
        expect(unrankedLobbyBadge([row(81), row(83), row(0)], 0, NOW)).toBeNull();
        expect(unrankedLobbyBadge([row(81), row(82), row(83)], null, NOW)).toBeNull();
    });

    it("returns null with no usable ranks and no own rank", () => {
        expect(unrankedLobbyBadge([row(0), row(55, 40)], null, NOW)).toBeNull();
    });
});

describe("tier range", () => {
    it("starts at the badge's whole tier", () => {
        expect(tierRange(63)).toEqual({ fromTier: 6, toTier: 6 });
    });

    it("widens one tier each side", () => {
        expect(widen({ fromTier: 6, toTier: 6 })).toEqual({ fromTier: 5, toTier: 7 });
    });

    it("clamps to tiers 1-11", () => {
        expect(widen({ fromTier: 1, toTier: 2 })).toEqual({ fromTier: 1, toTier: 3 });
        expect(widen({ fromTier: 10, toTier: 11 })).toEqual({ fromTier: 9, toTier: 11 });
    });

    it("returns null when it cannot widen", () => {
        expect(widen({ fromTier: 1, toTier: 11 })).toBeNull();
    });

    it("maps to whole-tier badge bounds", () => {
        expect(badgeFilter({ fromTier: 5, toTier: 7 })).toEqual({ minAverageBadge: 51, maxAverageBadge: 76 });
    });

    it("drops a bound that adds no filter", () => {
        expect(badgeFilter({ fromTier: 1, toTier: 3 })).toEqual({ minAverageBadge: undefined, maxAverageBadge: 36 });
        expect(badgeFilter({ fromTier: 10, toTier: 11 })).toEqual({ minAverageBadge: 101, maxAverageBadge: undefined });
        expect(badgeFilter({ fromTier: 1, toTier: 11 })).toEqual({
            minAverageBadge: undefined,
            maxAverageBadge: undefined,
        });
    });
});

describe("comparison group", () => {
    it("has no rank filter in Street Brawl, whatever the lobby", () => {
        const g = startGroup({ streetBrawl: true, badge: 63 });
        expect(g).toEqual({ kind: "streetBrawl" });
        expect(groupFilter(g)).toEqual({ minAverageBadge: undefined, maxAverageBadge: undefined });
        expect(groupLabel(g)).toEqual({ kind: "streetBrawl" });
        expect(nextGroup(g, 0)).toBeNull();
    });

    it("has no rank filter without a lobby badge", () => {
        const g = startGroup({ streetBrawl: false, badge: null });
        expect(g).toEqual({ kind: "allRanks" });
        expect(groupFilter(g)).toEqual({ minAverageBadge: undefined, maxAverageBadge: undefined });
        expect(groupLabel(g)).toEqual({ kind: "allRanks" });
        expect(nextGroup(g, 0)).toBeNull();
    });

    it("starts at the lobby badge's tier", () => {
        const g = startGroup({ streetBrawl: false, badge: 63 });
        expect(g).toEqual(tiers(6, 6));
        expect(groupFilter(g)).toEqual({ minAverageBadge: 61, maxAverageBadge: 66 });
        expect(groupLabel(g)).toEqual({ kind: "rank", tier: 6 });
    });

    it("widens while matches are under the minimum", () => {
        expect(MIN_MATCHES).toBe(200);
        expect(nextGroup(tiers(6, 6), 199)).toEqual(tiers(5, 7));
        expect(nextGroup(tiers(6, 6), 200)).toBeNull();
    });

    it("stops at tiers 1-11", () => {
        expect(nextGroup(tiers(2, 10), 0)).toEqual(tiers(1, 11));
        expect(nextGroup(tiers(1, 11), 0)).toBeNull();
    });

    it("takes six steps at most", () => {
        let g: ComparisonGroup = startGroup({ streetBrawl: false, badge: 63 });
        let calls = 1;
        for (let next = nextGroup(g, 0); next; next = nextGroup(g, 0)) {
            g = next;
            calls++;
        }
        expect(calls).toBe(6);
        expect(g).toEqual(tiers(1, 11));
    });

    it("labels a widened range by its end tiers", () => {
        expect(groupLabel(tiers(5, 7))).toEqual({ kind: "range", fromTier: 5, toTier: 7 });
        expect(groupLabel(tiers(1, 3))).toEqual({ kind: "range", fromTier: 1, toTier: 3 });
    });

    it("labels the full ladder as all ranks", () => {
        expect(groupLabel(tiers(1, 11))).toEqual({ kind: "allRanks" });
    });
});
