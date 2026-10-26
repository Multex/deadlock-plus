import { describe, expect, it } from "vitest";
import { MUSIC_TRACKS } from "../../music";
import { videoTimeline } from "../../timeline";
import {
    awardsPlan,
    awardsSfx,
    CATEGORY_PICKS,
    pickLineup,
    revealBar,
    YEAR_END_BEATS,
    type AwardCandidate,
    type Lineup,
} from "./plan";

const TRACK_BARS = [...new Set(MUSIC_TRACKS.map((track) => videoTimeline(track).bars))];

const full: AwardCandidate[] = [
    { id: "y_hero", strength: 0.53, signal: "one_trick" },
    { id: "y_month", strength: 0 },
    { id: "y_performance", strength: 0.5, signal: "big_game" },
    { id: "y_longest_run", strength: 0.71, signal: "streak" },
    { id: "y_supporting", strength: 0.2 },
    { id: "y_villain", strength: 0.05 },
];

function covers(plan: { bar: number; bars: number }[], bars: number) {
    let at = 0;
    for (const beat of plan) {
        expect(beat.bar).toBe(at);
        expect(beat.bars).toBeGreaterThan(0);
        at += beat.bars;
    }
    expect(at).toBe(bars);
}

describe("pickLineup", () => {
    it("always keeps the hero and the month, plus the two strongest categories", () => {
        const lineup = pickLineup(full);
        expect(lineup.awards.map((a) => a.id).sort()).toEqual(
            ["y_hero", "y_longest_run", "y_month", "y_performance"].sort(),
        );
        expect(lineup.awards.filter((a) => a.id !== "y_hero" && a.id !== "y_month")).toHaveLength(CATEGORY_PICKS);
    });

    it("saves the strongest award for last and opens on the weakest", () => {
        const lineup = pickLineup(full);
        expect(lineup.lead).toBe("y_longest_run");
        expect(lineup.awards.map((a) => a.id)).toEqual(["y_month", "y_performance", "y_hero", "y_longest_run"]);
    });

    it("opens on a plain Hero of the Year when nothing ties it to a signal", () => {
        const lineup = pickLineup([
            { id: "y_hero", strength: 0 },
            { id: "y_month", strength: 0 },
            { id: "y_supporting", strength: 0.76, signal: "duo" },
            { id: "y_endurance", strength: 0.58, signal: "marathon" },
            { id: "y_villain", strength: 0.5, signal: "nemesis" },
        ]);
        expect(lineup.awards.map((a) => a.id)).toEqual(["y_hero", "y_month", "y_endurance", "y_supporting"]);
        expect(lineup.lead).toBe("y_supporting");
    });

    it("lets a hero signal make Hero of the Year the closer", () => {
        const lineup = pickLineup([
            { id: "y_hero", strength: 0.75, signal: "explorer" },
            { id: "y_performance", strength: 0.3 },
            { id: "y_supporting", strength: 0.2 },
            { id: "y_endurance", strength: 0.15 },
        ]);
        expect(lineup.lead).toBe("y_hero");
        expect(lineup.awards.map((a) => a.id)).toEqual(["y_supporting", "y_performance", "y_hero"]);
    });

    it("never spends one signal on two awards", () => {
        const lineup = pickLineup([
            { id: "y_hero", strength: 0.6, signal: "one_trick" },
            { id: "y_performance", strength: 0.6, signal: "one_trick" },
            { id: "y_supporting", strength: 0.2 },
        ]);
        const signals = lineup.awards.flatMap((a) => (a.signal ? [a.signal] : []));
        expect(new Set(signals).size).toBe(signals.length);
    });

    it("plays what it has when the year is thin", () => {
        expect(pickLineup([{ id: "y_hero", strength: 0 }]).awards.map((a) => a.id)).toEqual(["y_hero"]);
        expect(pickLineup([])).toEqual({ awards: [], lead: null });
    });
});

describe("awardsPlan", () => {
    const lineups: Lineup[] = [
        pickLineup(full),
        pickLineup(full.slice(0, 3)),
        pickLineup([{ id: "y_hero", strength: 0 }]),
        pickLineup([]),
    ];

    it("fills every track's bars exactly, whatever awards play", () => {
        expect(TRACK_BARS.length).toBeGreaterThan(1);
        for (const bars of [...TRACK_BARS, 22, 34]) {
            for (const lineup of lineups) covers(awardsPlan(bars, lineup), bars);
        }
    });

    it("runs the night in order: pre-show, welcome, the awards, credits, end card", () => {
        const plan = awardsPlan(29, pickLineup(full));
        expect(plan.map((b) => b.id)).toEqual([
            "y_preshow",
            "y_welcome",
            "y_month",
            "y_performance",
            "y_hero",
            "y_longest_run",
            "y_credits",
            "y_end",
        ]);
        expect(plan.find((b) => b.id === "y_longest_run")?.signal).toBe("streak");
        expect(plan.find((b) => b.id === "y_month")?.signal).toBeUndefined();
    });

    it("holds each award long enough for nominees, the envelope and the winner", () => {
        for (const bars of TRACK_BARS) {
            for (const beat of awardsPlan(bars, pickLineup(full))) {
                if (beat.id.startsWith("y_") && !["y_preshow", "y_welcome", "y_credits", "y_end"].includes(beat.id))
                    expect(beat.bars).toBeGreaterThanOrEqual(3);
            }
        }
    });

    it("gives a missing award's bars to the awards that stay, the lead first", () => {
        const four = awardsPlan(29, pickLineup(full));
        const one = awardsPlan(29, pickLineup([{ id: "y_hero", strength: 0.6, signal: "one_trick" }]));
        const hero = (plan: typeof one) => plan.find((b) => b.id === "y_hero")!.bars;
        expect(hero(one)).toBeGreaterThan(hero(four));
    });

    it("only uses its own y_ beat ids", () => {
        const ids = lineups.flatMap((l) => awardsPlan(29, l).map((b) => b.id));
        for (const id of ids) {
            expect(id.startsWith("y_")).toBe(true);
            expect(YEAR_END_BEATS).toContain(id);
        }
    });
});

describe("awardsSfx", () => {
    const barSeconds = 240 / 172;
    const plan = awardsPlan(29, pickLineup(full));
    const cues = awardsSfx(plan, barSeconds);
    const at = (id: string) => plan.find((b) => b.id === id)!;

    it("tears every envelope on its award's reveal bar", () => {
        const tears = cues.filter((c) => c.cue === "envelope_tear").map((c) => c.atSeconds);
        const reveals = plan.filter((b) => revealBar(b) !== null).map((b) => revealBar(b)! * barSeconds);
        expect(tears).toEqual(reveals);
        expect(reveals).toHaveLength(4);
    });

    it("gives the winner sting to the lead award only, and the crowd to every winner", () => {
        const stings = cues.filter((c) => c.cue === "winner_sting");
        expect(stings).toHaveLength(1);
        const lead = at("y_longest_run");
        expect(stings[0].atSeconds).toBeGreaterThan(lead.bar * barSeconds);
        expect(stings[0].atSeconds).toBeLessThan((lead.bar + lead.bars) * barSeconds);
        expect(cues.filter((c) => c.cue === "crowd").length).toBeGreaterThanOrEqual(5);
    });

    it("lights the marquee in the pre-show and drops confetti on the welcome", () => {
        const preshow = at("y_preshow");
        const bulbs = cues.filter((c) => c.cue === "marquee_bulb");
        expect(bulbs.length).toBeGreaterThan(0);
        for (const c of bulbs) expect(c.atSeconds).toBeLessThan((preshow.bar + preshow.bars) * barSeconds);
        expect(cues.find((c) => c.cue === "confetti")?.atSeconds).toBeCloseTo(at("y_welcome").bar * barSeconds);
    });

    it("lands every cue on a beat inside the video", () => {
        const end = 29 * barSeconds;
        for (const c of cues) {
            expect(c.atSeconds).toBeGreaterThanOrEqual(0);
            expect(c.atSeconds).toBeLessThan(end);
            const beats = c.atSeconds / (barSeconds / 4);
            expect(Math.abs(beats - Math.round(beats))).toBeLessThan(1e-6);
        }
    });
});
