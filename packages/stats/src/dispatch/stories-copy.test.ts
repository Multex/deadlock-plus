import { describe, expect, it } from "vitest";
import { copySeed } from "./copy";
import { PERSONAS, personaEdition } from "./personas.fixture";
import { editionSignals } from "./signals";
import {
    arrangeStories,
    canPrint,
    fitShapes,
    HEADLINE_SHAPES,
    cellConditions,
    lineCondition,
    lineHolds,
    pageShapes,
    rankDispatchStories,
    STORY_COPY,
    storyCopy,
    type CopyContext,
    type HeadlineShape,
} from "./stories";
import { STORY_LINES } from "./story-lines";
import type { DispatchStoryKind, Edition, EditionKind } from "./types";

const KINDS: readonly EditionKind[] = ["weekly", "monthly", "collectors", "year_end"];

function ctx(edition: Edition, chain: readonly string[] = [], previous: Edition | null = null): CopyContext {
    return {
        edition,
        seeds: [...chain, edition.id].map((id) => copySeed(edition.accountId, id)),
        signals: editionSignals(edition, previous),
        previous,
    };
}

const coreOf = (e: Edition, kind: DispatchStoryKind, shape: HeadlineShape = "plain", c = ctx(e)) => {
    const s = e.stories.find((x) => x.kind === kind);
    expect(s, `${kind} in ${e.id}`).toBeDefined();
    return storyCopy(s!, shape, c);
};

describe("pageShapes", () => {
    const seeds = (n: number) => Array.from({ length: n }, (_, i) => copySeed(7, `weekly-2026-${i}`));

    it("gives the first stories on a page distinct shapes", () => {
        for (let n = 1; n < 60; n++) {
            const shapes = pageShapes(seeds(n), HEADLINE_SHAPES.length);
            expect(new Set(shapes).size).toBe(HEADLINE_SHAPES.length);
        }
    });

    it("never leads with the previous same-kind edition's lead shape", () => {
        let prev: HeadlineShape | null = null;
        for (let n = 1; n < 200; n++) {
            const [lead] = pageShapes(seeds(n), 1);
            expect(lead).not.toBe(prev);
            prev = lead;
        }
    });

    it("never gives a position the shape it had in the previous edition", () => {
        let prev: HeadlineShape[] | null = null;
        for (let n = 1; n < 200; n++) {
            const shapes = pageShapes(seeds(n), HEADLINE_SHAPES.length);
            if (prev) shapes.forEach((s, i) => expect(s, `edition ${n} position ${i}`).not.toBe(prev![i]));
            prev = shapes;
        }
    });

    it("spreads the lead over every shape", () => {
        const leads = new Set(
            Array.from({ length: 200 }, (_, i) => pageShapes([copySeed(i, "weekly-2026-10-05")], 1)[0]),
        );
        expect(leads.size).toBe(HEADLINE_SHAPES.length);
    });

    it("is deterministic", () => {
        expect(pageShapes(seeds(5), 10)).toEqual(pageShapes(seeds(5), 10));
    });
});

describe("fitShapes", () => {
    it("moves a story off a shape it has no line for, keeping the page's shapes distinct", () => {
        let moved = 0;
        for (const kind of KINDS) {
            for (const p of PERSONAS) {
                const named = personaEdition(p, kind);
                const e = { ...named, playerName: null };
                for (let i = 0; i < 100; i++) {
                    const c = ctx({ ...e, id: `${kind}-fit-${i}` });
                    const stories = arrangeStories(e.stories, c.signals, c.seeds[c.seeds.length - 1]);
                    const planned = pageShapes(c.seeds, stories.length);
                    const shapes = fitShapes(stories, planned, c);
                    stories.forEach((s, n) => expect(canPrint(s, shapes[n], c), `${s.kind} ${shapes[n]}`).toBe(true));
                    const front = shapes.slice(0, HEADLINE_SHAPES.length);
                    expect(new Set(front).size).toBe(front.length);
                    if (shapes.join() !== planned.join()) moved++;
                }
            }
        }
        expect(moved).toBeGreaterThan(0);
    });

    it("leaves a page alone when every story can take its shape", () => {
        const e = personaEdition("P1", "weekly");
        const c = ctx(e);
        const shapes = pageShapes(c.seeds, e.stories.length);
        expect(fitShapes(e.stories, shapes, c)).toEqual(shapes);
    });
});

describe("storyCopy", () => {
    it("is deterministic", () => {
        const e = personaEdition("P1", "weekly");
        expect(e.stories.map((s) => storyCopy(s, "num", ctx(e)))).toEqual(
            e.stories.map((s) => storyCopy(s, "num", ctx(e))),
        );
    });

    it("keys each headline by story, kind, part and shape", () => {
        const e = personaEdition("P2", "monthly");
        const c = coreOf(e, "longest_match", "quote");
        expect(c.core.key).toMatch(/^dispatch\.story\.longest_match\.monthly\.headline_quote_\d+$/);
        expect(c.shape).toBe("quote");
        expect(c.deck.key).toMatch(/^dispatch\.story\.longest_match\.monthly\.deck_\d+$/);
        expect(coreOf(e, "record", "ask").core.key).toMatch(
            /^dispatch\.story\.record\.monthly\.headline_losing_ask_\d+$/,
        );
    });

    it("takes the signal's angle when one fires", () => {
        const p1 = personaEdition("P1", "weekly");
        expect(coreOf(p1, "best_streak").angle).toBe("streak");
        expect(coreOf(p1, "best_streak").core).toMatchObject({ count: 8 });
        expect(coreOf(p1, "best_streak", "pair").core.key).toMatch(
            /^dispatch\.story\.best_streak\.weekly\.angle_streak_pair_\d+$/,
        );
        expect(coreOf(p1, "top_hero").angle).toBe("one_trick");
        expect(coreOf(p1, "best_game").angle).toBe("big_game");
        const p3 = personaEdition("P3", "monthly");
        expect(coreOf(p3, "record").angle).toBe("losing_then_winning");
        expect(coreOf(p3, "record").params).toMatchObject({ run_wins: { value: 7 }, of: { value: 8 } });
        expect(coreOf(p3, "nemesis").angle).toBe("nemesis");
        expect(coreOf(p3, "played_with").angle).toBe("duo");
        expect(coreOf(p3, "longest_session").angle).toBe("marathon");
    });

    it("keeps the record's own wins and losses beside a comeback run", () => {
        for (const kind of KINDS) {
            const e = personaEdition("P3", kind);
            const copy = coreOf(e, "record");
            expect(copy.angle).toBe("losing_then_winning");
            expect(copy.params).toMatchObject({
                wins: { value: e.stats.wins },
                losses: { value: e.stats.losses },
                run_wins: { value: 7 },
            });
        }
    });

    it("keeps the generic line when nothing stands out", () => {
        expect(coreOf(personaEdition("P2", "weekly"), "longest_match").angle).toBeNull();
    });

    it("names the reader when the edition knows their name", () => {
        const e = personaEdition("P1", "weekly");
        expect(storyCopy(e.stories[0], "name", ctx(e)).params.me).toEqual({
            type: "player",
            accountId: e.accountId,
            name: "Lantern",
        });
        const anon = { ...e, playerName: null };
        expect(storyCopy(anon.stories[0], "name", ctx(anon)).facts.me).toBe(0);
    });

    it("prints only lines whose condition holds for the edition's numbers", () => {
        const bad: string[] = [];
        for (const kind of KINDS) {
            for (const p of PERSONAS) {
                const chain: string[] = [];
                let previous: Edition | null = null;
                for (let n = 0; n < 30; n++) {
                    const e = personaEdition(p, kind, n);
                    const c = ctx(e, chain, previous);
                    for (const s of e.stories) {
                        for (const shape of HEADLINE_SHAPES) {
                            const copy = storyCopy(s, shape, c);
                            for (const t of [copy.core, copy.deck]) {
                                const facts = { ...copy.facts, ...(t.count === undefined ? {} : { count: t.count }) };
                                if (!lineHolds(lineCondition(t.key), facts)) {
                                    bad.push(`${t.key} ${JSON.stringify(facts)}`);
                                }
                            }
                        }
                    }
                    previous = e;
                    chain.push(e.id);
                }
            }
        }
        expect(bad.slice(0, 10)).toEqual([]);
    });

    it("keeps a year of thin attendance off the high-attendance lines", () => {
        const e = personaEdition("P1", "year_end");
        const days = e.stories.find((s) => s.kind === "days_played")!;
        expect(days.params.share).toMatchObject({ value: 16 / 365 });
        const picked = new Set<string>();
        for (let i = 0; i < 200; i++) {
            const c = ctx({ ...e, id: `year_end-seed-${i}` });
            for (const shape of HEADLINE_SHAPES) picked.add(storyCopy(days, shape, c).core.key);
        }
        expect([...picked].filter((k) => /share>=/.test(lineCondition(k)))).toEqual([]);
        const all = Object.keys(STORY_LINES).filter((cell) => cell.startsWith("days_played.year_end.headline_"));
        const gated = all.filter((cell) => cellConditions(cell).some((c) => /share>=/.test(c)));
        expect(gated.length).toBeGreaterThan(0);
    });

    it("never prints the same line for a story two editions running", () => {
        for (const kind of KINDS) {
            for (const p of PERSONAS) {
                const chain: string[] = [];
                let prev = new Set<string>();
                for (let n = 0; n < 40; n++) {
                    const e = { ...personaEdition(p, kind, n), id: `${kind}-run-${n}` };
                    const c = ctx(e, chain);
                    const keys = new Set<string>();
                    for (const s of e.stories) {
                        // Every shape, so a story that moves position on the page is covered too.
                        for (const shape of HEADLINE_SHAPES) {
                            const key = storyCopy(s, shape, c).core.key;
                            keys.add(key);
                            expect(prev.has(key), `${key} twice in a row`).toBe(false);
                        }
                    }
                    prev = keys;
                    chain.push(e.id);
                }
            }
        }
    });

    it("never repeats the previous same-kind edition's deck for a story", () => {
        for (const kind of KINDS) {
            const chain: string[] = [];
            let prev: string | null = null;
            for (let n = 0; n < 40; n++) {
                const e = personaEdition("P1", kind, n);
                const deck = storyCopy(e.stories[0], "plain", ctx(e, chain)).deck.key;
                expect(deck).not.toBe(prev);
                prev = deck;
                chain.push(e.id);
            }
        }
    });

    it("compares with the previous edition where the numbers allow", () => {
        const prev = personaEdition("P1", "weekly", 0);
        const e = personaEdition("P1", "weekly", 1);
        const less = { ...prev, stats: { ...prev.stats, matches: 4 }, longestWin: 3 };
        const c = storyCopy(
            e.stories.find((s) => s.kind === "record")!,
            "plain",
            ctx(e, [prev.id], less),
        );
        expect(c.versus?.key).toMatch(/^dispatch\.story\.record\.weekly\.versus_up_[1-3]$/);
        expect(c.versus).toMatchObject({ count: 4 });
        expect(
            storyCopy(
                e.stories.find((s) => s.kind === "record")!,
                "plain",
                ctx(e),
            ).versus,
        ).toBeNull();
    });

    it("gives the variant counts the catalog holds", () => {
        expect(STORY_COPY).toEqual({ versus: 3 });
        expect(HEADLINE_SHAPES).toHaveLength(8);
    });
});

describe("arrangeStories", () => {
    it("lets signals and the edition reorder the front page", () => {
        const fronts = new Set<string>();
        for (const p of PERSONAS) {
            const e = personaEdition(p, "weekly");
            const arranged = arrangeStories(e.stories, editionSignals(e), copySeed(e.accountId, e.id));
            expect(arranged.map((s) => s.kind).sort()).toEqual(e.stories.map((s) => s.kind).sort());
            fronts.add(
                arranged
                    .slice(0, 3)
                    .map((s) => s.kind)
                    .join(","),
            );
        }
        expect(fronts.size).toBe(3);
    });

    it("pulls a fired signal's story up", () => {
        const e = personaEdition("P2", "weekly");
        const plain = rankDispatchStories(e.stories).findIndex((s) => s.kind === "night_owl");
        const moved = arrangeStories(e.stories, editionSignals(e), copySeed(e.accountId, e.id)).findIndex(
            (s) => s.kind === "night_owl",
        );
        expect(moved).toBeLessThan(plain);
    });

    it("keeps a special edition's lead stories in front", () => {
        for (const p of PERSONAS) {
            for (const kind of ["collectors", "year_end"] as const) {
                const e = personaEdition(p, kind);
                const lead = arrangeStories(e.stories, editionSignals(e), copySeed(e.accountId, e.id))[0];
                const leads =
                    kind === "collectors"
                        ? ["season_climb", "rank_move", "peak_rank"]
                        : ["hours", "top_hero", "days_played"];
                expect(leads).toContain(lead.kind);
            }
        }
    });

    it("gives the three personas different banners", () => {
        for (const kind of KINDS) {
            const banners = PERSONAS.map((p) => {
                const e = personaEdition(p, kind);
                const [first] = arrangeStories(e.stories, editionSignals(e), copySeed(e.accountId, e.id));
                const c = ctx(e);
                return storyCopy(first, pageShapes(c.seeds, 1)[0], c).core.key;
            });
            expect(new Set(banners).size, `${kind}: ${banners.join(" | ")}`).toBe(3);
        }
    });
});

describe("lineHolds", () => {
    it("always holds an empty condition", () => {
        expect(lineHolds("", {})).toBe(true);
    });

    it("compares a fact with a number, a percent or another fact", () => {
        expect(lineHolds("share>=50%", { share: 0.5 })).toBe(true);
        expect(lineHolds("share>=50%", { share: 0.49 })).toBe(false);
        expect(lineHolds("count<3", { count: 2 })).toBe(true);
        expect(lineHolds("count<3", { count: 3 })).toBe(false);
        expect(lineHolds("deaths=0", { deaths: 0 })).toBe(true);
        expect(lineHolds("deaths!=0", { deaths: 0 })).toBe(false);
        expect(lineHolds("wins>losses", { wins: 9, losses: 4 })).toBe(true);
        expect(lineHolds("now<prev", { now: 9, prev: 4 })).toBe(false);
    });

    it("reads a bare name as present and a bang as absent", () => {
        expect(lineHolds("letter", { letter: 17 })).toBe(true);
        expect(lineHolds("letter", {})).toBe(false);
        expect(lineHolds("!letter", {})).toBe(true);
        expect(lineHolds("me", { me: 0 })).toBe(false);
    });

    it("needs every comma-separated part, and fails on a fact it does not have", () => {
        expect(lineHolds("kills>=10, deaths=0", { kills: 12, deaths: 0 })).toBe(true);
        expect(lineHolds("kills>=10, deaths=0", { kills: 12, deaths: 1 })).toBe(false);
        expect(lineHolds("prev, now>prev", { now: 5 })).toBe(false);
    });
});

describe("the line catalog", () => {
    const atoms = (cond: string) =>
        cond
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean);
    /** Values around every threshold a cell's conditions name, so each side of each line is tried. */
    function grid(conds: readonly string[]): Record<string, number>[] {
        const values = new Map<string, Set<number>>();
        const add = (name: string, ...v: number[]) => {
            const set = values.get(name) ?? new Set<number>([0, 1]);
            for (const x of v) set.add(x);
            values.set(name, set);
        };
        for (const a of conds.flatMap(atoms)) {
            const m = /^(!?)(\w+)(?:(>=|<=|!=|=|>|<)(.+))?$/.exec(a)!;
            if (!m[3]) {
                add(m[2]);
                continue;
            }
            const rhs = m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
            if (Number.isNaN(rhs)) {
                add(m[2], 2, 5, 9);
                add(m[4], 2, 5, 9);
            } else {
                const eps = m[4].endsWith("%") ? 0.01 : 1;
                add(m[2], rhs - eps, rhs, rhs + eps);
            }
        }
        let cases: Record<string, number>[] = [{}];
        for (const [name, vs] of values) cases = cases.flatMap((c) => [...vs].map((v) => ({ ...c, [name]: v })));
        return cases;
    }

    it("leaves every cell three lines on both sides of the edition parity, or none so the page skips the shape", () => {
        const thin: string[] = [];
        for (const cell of Object.keys(STORY_LINES)) {
            const conds = cellConditions(cell);
            for (const facts of grid(conds)) {
                const ok = conds.flatMap((c, i) => (lineHolds(c, facts) ? [i] : []));
                if (ok.length === 0) continue;
                if (ok.length < 3 || !ok.some((i) => i % 2 === 0) || !ok.some((i) => i % 2 === 1)) {
                    thin.push(`${cell} ${JSON.stringify(facts)}: ${ok.length}`);
                    break;
                }
            }
        }
        expect(thin.slice(0, 10)).toEqual([]);
    });
});
