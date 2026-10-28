import { describe, expect, it } from "vitest";
import { PERSONAS, personaEdition } from "@deadlock-plus/stats/dispatch/personas.fixture";
import { editionSignals, type Signal } from "@deadlock-plus/stats/dispatch/signals";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import { CHASE_FACES, COLLECTORS_BEAT_IDS, castCards, chaseFlipBar, collectorsPlan, type Casting } from "./plan";

const TRACK_BARS = [26, 27, 29];

const persona = (p: (typeof PERSONAS)[number]) => personaEdition(p, "collectors");
const cast = (e: Edition): Casting => castCards(e, editionSignals(e));
const order = (e: Edition, bars = 26) => collectorsPlan(cast(e), bars).map((b) => b.id);

describe("collectorsPlan", () => {
    it("fills every track's bars exactly, back to back from bar 0", () => {
        for (const p of PERSONAS) {
            for (const bars of TRACK_BARS) {
                const plan = collectorsPlan(cast(persona(p)), bars);
                expect(plan.reduce((n, b) => n + b.bars, 0)).toBe(bars);
                let at = 0;
                for (const beat of plan) {
                    expect(beat.bar).toBe(at);
                    expect(beat.bars).toBeGreaterThanOrEqual(1);
                    at += beat.bars;
                }
            }
        }
    });

    it("still fills the track when most beats drop", () => {
        const bare: Edition = { ...persona("P2"), heroes: [], rank: null, rankSeries: undefined, tape: undefined };
        for (const bars of TRACK_BARS) {
            const plan = collectorsPlan(castCards(bare, []), bars);
            expect(plan.reduce((n, b) => n + b.bars, 0)).toBe(bars);
            expect(plan.map((b) => b.id)).toEqual(["c_pack", "c_tear", "c_grind", "c_slab", "c_fan"]);
        }
    });

    it("opens the pack, deals the cards weakest first, then the chase, the slab and the fan", () => {
        for (const p of PERSONAS) {
            const ids = order(persona(p));
            expect(ids.slice(0, 2)).toEqual(["c_pack", "c_tear"]);
            expect(ids.slice(-3)).toEqual(["c_chase", "c_slab", "c_fan"]);
            const casting = cast(persona(p));
            const strengths = casting.cards.map((c) => c.strength);
            expect(strengths).toEqual([...strengths].sort((a, b) => a - b));
        }
    });

    it("gives the three personas three different beat orders", () => {
        const orders = PERSONAS.map((p) => order(persona(p)).join(" "));
        expect(new Set(orders).size).toBe(3);
    });

    it("prefixes every beat id with c_ and names it in the beat list", () => {
        for (const p of PERSONAS) {
            for (const beat of collectorsPlan(cast(persona(p)), 26)) {
                expect(beat.id.startsWith("c_")).toBe(true);
                expect(COLLECTORS_BEAT_IDS).toContain(beat.id);
                expect(beat.kind).toBe("collectors");
                expect(beat.presents.length).toBeGreaterThan(0);
            }
        }
    });
});

describe("castCards", () => {
    it("makes the strongest chase-worthy signal the chase card", () => {
        expect(cast(persona("P1")).chase).toEqual({ face: "peak", signal: "climb" });
        expect(cast(persona("P2")).chase).toEqual({ face: "explorer", signal: "explorer" });
        expect(cast(persona("P3")).chase).toEqual({ face: "losing_then_winning", signal: "losing_then_winning" });
    });

    it("follows the lead when a different signal is strongest", () => {
        const hot = { ...persona("P1"), longestWin: 12 };
        const signals = editionSignals(hot);
        expect(signals[0].id).toBe("streak");
        expect(castCards(hot, signals).chase).toEqual({ face: "streak", signal: "streak" });
    });

    it("never spends a signal twice", () => {
        for (const p of PERSONAS) {
            const plan = collectorsPlan(cast(persona(p)), 26);
            const spent = plan.flatMap((b) => (b.signal ? [b.signal] : []));
            expect(new Set(spent).size).toBe(spent.length);
        }
    });

    it("never claims mates, enemies, a single game or another kind's months", () => {
        // P3 has a duo and a nemesis; a Collector's Copy is ranked only and mate-stats has no mode filter.
        for (const p of PERSONAS) {
            const plan = collectorsPlan(cast(persona(p)), 26);
            for (const beat of plan) expect(["duo", "nemesis", "big_game", "swing_month"]).not.toContain(beat.signal);
        }
    });

    it("drops the Main card when the chase is the one-trick", () => {
        const trick: Edition = {
            ...persona("P1"),
            heroes: [{ heroId: 12, games: 21, wins: 15, playtimeS: 40000 }],
            longestWin: 3,
            rank: null,
        };
        const casting = castCards(trick, editionSignals(trick));
        expect(casting.chase).toEqual({ face: "main", signal: "one_trick" });
        expect(casting.cards.map((c) => c.beat)).not.toContain("c_main");
    });

    it("never deals a peak chase on a slide", () => {
        const slid: Edition = {
            ...persona("P2"),
            heroes: persona("P2").heroes.slice(0, 3),
            newHeroes: [],
            rank: { startBadge: 46, endBadge: 32, peakBadge: 46, delta: -14 },
        };
        const signals = editionSignals(slid).filter((s) => s.id !== "night_owl");
        expect(signals.map((s) => s.id)).toContain("slide");
        const casting = castCards(slid, signals);
        expect(casting.chase?.face).not.toBe("peak");
        const climb = casting.cards.find((c) => c.beat === "c_climb");
        expect(climb?.signal).toBe("slide");
    });

    it("drops the climb card without a rank and the main card without heroes", () => {
        const e: Edition = { ...persona("P3"), rank: null, heroes: [] };
        const beats = cast(e).cards.map((c) => c.beat);
        expect(beats).not.toContain("c_climb");
        expect(beats).not.toContain("c_main");
    });

    it("adds an insert only for a second strong card-worthy signal", () => {
        expect(cast(persona("P1")).cards.map((c) => c.beat)).toContain("c_insert");
        expect(cast(persona("P2")).cards.map((c) => c.beat)).not.toContain("c_insert");
        expect(cast(persona("P3")).cards.map((c) => c.beat)).not.toContain("c_insert");
    });

    it("skips a pull whose number would read 0", () => {
        const signal: Signal = {
            id: "losing",
            strength: 1,
            facts: { wins: 0, losses: 12, winrate: 0 },
        };
        const casting = castCards(persona("P2"), [signal]);
        expect(casting.cards.map((c) => c.beat)).not.toContain("c_pull");
    });

    it("only deals chase faces it has copy for", () => {
        for (const p of PERSONAS) {
            const face = cast(persona(p)).chase?.face;
            if (face) expect(CHASE_FACES).toContain(face);
        }
    });
});

describe("chaseFlipBar", () => {
    it("flips after the build and holds the holo at least two bars", () => {
        for (let bars = 3; bars <= 8; bars++) {
            const flip = chaseFlipBar(bars);
            expect(flip).toBeGreaterThanOrEqual(1);
            expect(bars - flip).toBeGreaterThanOrEqual(2);
        }
    });
});
