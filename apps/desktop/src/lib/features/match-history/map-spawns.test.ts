import { describe, expect, it } from "vitest";
import type { MidBossEvent } from "./detail";
import {
    CAMP_FIRST_SPAWN_S,
    MID_BOSS_CLAIM_MARKER_S,
    MID_BOSS_FADE_IN_S,
    MID_BOSS_FIRST_SPAWN_S,
    campSpawned,
    midBossClaimAt,
    midBossOpacity,
    midBossRespawnS,
} from "./map-spawns";

const kill = (destroyedS: number, over: Partial<MidBossEvent> = {}): MidBossEvent => ({ destroyedS, ...over });

describe("campSpawned", () => {
    it("uses the first spawn time of each tier", () => {
        expect(CAMP_FIRST_SPAWN_S).toEqual({ camp_weak: 120, camp_medium: 300, camp_strong: 480, camp_vault: 480 });
    });

    it("is false before the tier's first spawn and true from it on", () => {
        expect(campSpawned("camp_weak", 119.9)).toBe(false);
        expect(campSpawned("camp_weak", 120)).toBe(true);
        expect(campSpawned("camp_medium", 299)).toBe(false);
        expect(campSpawned("camp_medium", 300)).toBe(true);
        expect(campSpawned("camp_strong", 479)).toBe(false);
        expect(campSpawned("camp_strong", 480)).toBe(true);
        expect(campSpawned("camp_vault", 479)).toBe(false);
        expect(campSpawned("camp_vault", 480)).toBe(true);
    });

    it("stays true for the rest of the match", () => {
        expect(campSpawned("camp_weak", 3600)).toBe(true);
    });

    it("is true for kinds that are not camps", () => {
        expect(campSpawned("walker", 0)).toBe(true);
        expect(campSpawned("mid_boss", 0)).toBe(true);
    });
});

describe("midBossRespawnS", () => {
    it("shrinks by a minute per kill down to five minutes", () => {
        expect([0, 1, 2, 3, 9].map(midBossRespawnS)).toEqual([420, 360, 300, 300, 300]);
    });
});

describe("midBossOpacity", () => {
    it("is hidden before the first spawn and shown from it on", () => {
        expect(MID_BOSS_FIRST_SPAWN_S).toBe(600);
        expect(midBossOpacity([], 0)).toBe(0);
        expect(midBossOpacity([], 599.9)).toBe(0);
        expect(midBossOpacity([], 600)).toBe(1);
        expect(midBossOpacity([], 2400)).toBe(1);
    });

    it("is shown until the kill and hidden from the kill on", () => {
        const kills = [kill(900)];
        expect(midBossOpacity(kills, 899)).toBe(1);
        expect(midBossOpacity(kills, 900)).toBe(0);
        expect(midBossOpacity(kills, 1000)).toBe(0);
    });

    it("comes back at the kill time plus the respawn estimate", () => {
        const kills = [kill(900)];
        expect(midBossOpacity(kills, 900 + 420 - MID_BOSS_FADE_IN_S)).toBe(0);
        expect(midBossOpacity(kills, 900 + 420)).toBe(1);
        expect(midBossOpacity(kills, 900 + 420 + 60)).toBe(1);
    });

    it("ramps up over the last seconds before the respawn", () => {
        const kills = [kill(900)];
        const spawn = 900 + 420;
        expect(midBossOpacity(kills, spawn - MID_BOSS_FADE_IN_S / 2)).toBeCloseTo(0.5, 6);
        expect(midBossOpacity(kills, spawn - MID_BOSS_FADE_IN_S / 4)).toBeCloseTo(0.75, 6);
    });

    it("uses a shorter respawn after each later kill", () => {
        const kills = [kill(900), kill(1500), kill(2000), kill(2500)];
        expect(midBossOpacity(kills, 1500 + 359 - MID_BOSS_FADE_IN_S)).toBe(0);
        expect(midBossOpacity(kills, 1500 + 360)).toBe(1);
        expect(midBossOpacity(kills, 2000 + 299 - MID_BOSS_FADE_IN_S)).toBe(0);
        expect(midBossOpacity(kills, 2000 + 300)).toBe(1);
        expect(midBossOpacity(kills, 2500 + 300)).toBe(1);
    });

    it("orders kills by time and ignores kills without a time", () => {
        const kills = [kill(1500), kill(0), kill(900)];
        expect(midBossOpacity(kills, 700)).toBe(1);
        expect(midBossOpacity(kills, 900 + 420)).toBe(1);
        expect(midBossOpacity(kills, 1500 + 360)).toBe(1);
        expect(midBossOpacity(kills, 1500 + 300)).toBe(0);
    });

    it("stays hidden before the first spawn even when a kill is recorded earlier", () => {
        expect(midBossOpacity([kill(550)], 500)).toBe(0);
    });
});

describe("midBossClaimAt", () => {
    it("is the claiming team for a short window after the kill", () => {
        const kills = [kill(900, { killedBy: "hidden-king", claimedBy: "archmother" })];
        expect(MID_BOSS_CLAIM_MARKER_S).toBe(20);
        expect(midBossClaimAt(kills, 899)).toBeNull();
        expect(midBossClaimAt(kills, 900)).toBe("archmother");
        expect(midBossClaimAt(kills, 919.9)).toBe("archmother");
        expect(midBossClaimAt(kills, 920)).toBeNull();
    });

    it("falls back to the killing team", () => {
        expect(midBossClaimAt([kill(900, { killedBy: "hidden-king" })], 905)).toBe("hidden-king");
    });

    it("is null when neither team is known", () => {
        expect(midBossClaimAt([kill(900)], 905)).toBeNull();
    });

    it("picks the latest kill in its window", () => {
        const kills = [kill(900, { claimedBy: "hidden-king" }), kill(1400, { claimedBy: "archmother" })];
        expect(midBossClaimAt(kills, 910)).toBe("hidden-king");
        expect(midBossClaimAt(kills, 1000)).toBeNull();
        expect(midBossClaimAt(kills, 1410)).toBe("archmother");
    });
});
