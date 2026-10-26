import { describe, expect, it } from "vitest";
import { PERSONAS, personaEdition } from "@deadlock-plus/stats/dispatch/personas.fixture";
import { editionSignals } from "@deadlock-plus/stats/dispatch/signals";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import { MUSIC_TRACKS } from "../../music";
import { videoTimeline } from "../../timeline";
import { MONTHLY_BEAT_IDS, monthlyCast, monthlyPlan } from "./plan";

const TRACK_BARS = [...new Set(MUSIC_TRACKS.map((t) => videoTimeline(t).bars))];

const castOf = (e: Edition) => monthlyCast(e, editionSignals(e));

function thin(): Edition {
    const e = personaEdition("P2", "monthly");
    return {
        ...e,
        heroes: [],
        newHeroes: [],
        bestGame: null,
        nominees: [],
        tape: undefined,
        days: undefined,
        mates: [],
        nemesis: null,
        rank: null,
        stats: { ...e.stats, nightShare: 0, busiestDay: null, playtimeS: 0, daysPlayed: 0 },
    };
}

describe("monthlyPlan", () => {
    const editions: [string, Edition][] = [
        ...PERSONAS.map((p) => [p, personaEdition(p, "monthly")] as [string, Edition]),
        ["thin", thin()],
    ];

    it.each(editions)("%s fills every track's bars exactly, back to back", (_, e) => {
        for (const bars of TRACK_BARS) {
            const plan = monthlyPlan(castOf(e), bars);
            let at = 0;
            for (const beat of plan) {
                expect(beat.bar).toBe(at);
                expect(beat.bars).toBeGreaterThan(0);
                expect(beat.kind).toBe("monthly");
                at += beat.bars;
            }
            expect(at).toBe(bars);
        }
    });

    it.each(editions)("%s opens on the flash and closes on the cover, the stand and the end card", (_, e) => {
        const ids = monthlyPlan(castOf(e), 26).map((b) => b.id);
        expect(ids[0]).toBe("m_flash");
        expect(ids.slice(-3)).toEqual(["m_cover", "m_stand", "m_end"]);
    });

    it("prefixes every beat id with m_", () => {
        for (const id of MONTHLY_BEAT_IDS) expect(id.startsWith("m_")).toBe(true);
    });

    it("puts the strongest signal on the beat right after the flash, and gives it the most bars there", () => {
        for (const p of PERSONAS) {
            const e = personaEdition(p, "monthly");
            const lead = editionSignals(e)[0]!;
            const plan = monthlyPlan(castOf(e), 26);
            expect(plan[1]!.signal).toBe(lead.id);
            const middle = plan.slice(1, -3);
            expect(plan[1]!.bars).toBe(Math.max(...middle.map((b) => b.bars)));
        }
    });

    it("shows every signal and stat once: a spent one never comes back in a later beat", () => {
        for (const p of PERSONAS) {
            const plan = monthlyPlan(castOf(personaEdition(p, "monthly")), 26);
            const stats = plan.flatMap((b) => b.presents.map((x) => x.split(":")[0]));
            expect(new Set(stats).size).toBe(stats.length);
            for (const b of plan) if (b.signal) expect(b.presents.map((x) => x.split(":")[0])).toContain(b.signal);
        }
    });

    it("gives each persona its own beat order", () => {
        const orders = PERSONAS.map((p) =>
            monthlyPlan(castOf(personaEdition(p, "monthly")), 26)
                .map((b) => b.id)
                .join(","),
        );
        expect(new Set(orders).size).toBe(PERSONAS.length);
    });

    it("drops beats with nothing to show and hands their bars to the rest", () => {
        const ids = monthlyPlan(castOf(thin()), 26).map((b) => b.id);
        expect(ids).not.toContain("m_shot");
        expect(ids).not.toContain("m_wardrobe");
        expect(ids).not.toContain("m_takes");
        expect(ids).not.toContain("m_feature");
    });

    it("leaves out a mate or rival the history has no name for", () => {
        const e = personaEdition("P3", "monthly");
        const nameless: Edition = {
            ...e,
            mates: e.mates.map((m) => ({ ...m, name: null })),
            nemesis: e.nemesis && { ...e.nemesis, name: null },
        };
        const stats = monthlyPlan(castOf(nameless), 26).flatMap((b) => b.presents.map((x) => x.split(":")[0]));
        expect(stats).not.toContain("duo");
        expect(stats).not.toContain("nemesis");
        expect(stats).not.toContain("mate");
    });
});
