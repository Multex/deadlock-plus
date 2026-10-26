import { describe, expect, it } from "vitest";
import { copySeed } from "./copy";
import { PERSONAS, personaEdition } from "./personas.fixture";
import { editionSignals } from "./signals";
import {
    arrangeStories,
    HEADLINE_SHAPES,
    pageShapes,
    rankDispatchStories,
    STORY_COPY,
    storyCopy,
    type CopyContext,
    type HeadlineShape,
} from "./stories";
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
        expect(c.core.key).toBe("dispatch.story.longest_match.monthly.headline_quote");
        expect(c.shape).toBe("quote");
        expect(c.deck.key).toMatch(/^dispatch\.story\.longest_match\.monthly\.deck_[1-3]$/);
        expect(coreOf(e, "record", "ask").core.key).toBe("dispatch.story.record.monthly.headline_losing_ask");
    });

    it("takes the signal's angle when one fires", () => {
        const p1 = personaEdition("P1", "weekly");
        expect(coreOf(p1, "best_streak").angle).toBe("streak");
        expect(coreOf(p1, "best_streak").core).toMatchObject({ count: 8 });
        expect(coreOf(p1, "best_streak", "pair").core.key).toBe("dispatch.story.best_streak.weekly.angle_streak_pair");
        expect(coreOf(p1, "top_hero").angle).toBe("one_trick");
        expect(coreOf(p1, "best_game").angle).toBe("big_game");
        const p3 = personaEdition("P3", "monthly");
        expect(coreOf(p3, "record").angle).toBe("losing_then_winning");
        expect(coreOf(p3, "record").params).toMatchObject({ wins: { value: 7 }, of: { value: 8 } });
        expect(coreOf(p3, "nemesis").angle).toBe("nemesis");
        expect(coreOf(p3, "played_with").angle).toBe("duo");
        expect(coreOf(p3, "longest_session").angle).toBe("marathon");
    });

    it("keeps the generic line when nothing stands out", () => {
        expect(coreOf(personaEdition("P2", "weekly"), "longest_match").angle).toBeNull();
    });

    it("gives every story a hero and a match count to lead with", () => {
        for (const kind of KINDS) {
            const e = personaEdition("P2", kind);
            for (const s of e.stories) {
                const c = storyCopy(s, "name", ctx(e));
                expect(c.params.top, `${kind} ${s.kind}`).toBeDefined();
                expect(c.params.played).toEqual({ type: "number", value: e.stats.matches });
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
        expect(STORY_COPY).toEqual({ deck: 3, versus: 3 });
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
