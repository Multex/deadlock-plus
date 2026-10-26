import { describe, expect, it } from "vitest";
import { copySeed } from "./copy";
import { PERSONAS, personaEdition } from "./personas.fixture";
import { editionSignals } from "./signals";
import { arrangeStories, rankDispatchStories, STORY_COPY, storyCopy, type CopyContext } from "./stories";
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

const coreOf = (e: Edition, kind: DispatchStoryKind, c = ctx(e)) => {
    const i = e.stories.findIndex((s) => s.kind === kind);
    expect(i, `${kind} in ${e.id}`).toBeGreaterThanOrEqual(0);
    return storyCopy(e.stories[i], i, c);
};

describe("storyCopy", () => {
    it("is deterministic", () => {
        const e = personaEdition("P1", "weekly");
        expect(e.stories.map((s, i) => storyCopy(s, i, ctx(e)))).toEqual(
            e.stories.map((s, i) => storyCopy(s, i, ctx(e))),
        );
    });

    it("keys each line by story, kind, part and variant", () => {
        const e = personaEdition("P2", "monthly");
        const c = coreOf(e, "longest_match");
        expect(c.core.key).toMatch(/^dispatch\.story\.longest_match\.monthly\.headline_[1-5]$/);
        expect(c.deck.key).toMatch(/^dispatch\.story\.longest_match\.monthly\.deck_[1-3]$/);
        expect(coreOf(e, "record").core.key).toMatch(/^dispatch\.story\.record\.monthly\.headline_losing_[1-5]$/);
    });

    it("takes the signal's angle when one fires", () => {
        const p1 = personaEdition("P1", "weekly");
        expect(coreOf(p1, "best_streak").angle).toBe("streak");
        expect(coreOf(p1, "best_streak").core).toMatchObject({ count: 8 });
        expect(coreOf(p1, "best_streak").core.key).toMatch(/\.weekly\.angle_streak_[1-4]$/);
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
        const p2 = personaEdition("P2", "weekly");
        expect(coreOf(p2, "longest_match").angle).toBeNull();
    });

    it("never prints the previous same-kind edition's line, kicker or tail", () => {
        for (const kind of KINDS) {
            const chain: string[] = [];
            let prev: ReturnType<typeof storyCopy> | null = null;
            for (let n = 0; n < 40; n++) {
                const e = personaEdition("P1", kind, n);
                const c = storyCopy(e.stories[0], 0, ctx(e, chain));
                if (prev && prev.core.key.replace(/_\d+$/, "") === c.core.key.replace(/_\d+$/, "")) {
                    expect(c.core.key).not.toBe(prev.core.key);
                }
                if (prev) {
                    if (c.kicker || prev.kicker) expect(c.kicker).not.toBe(prev.kicker);
                    expect(c.deck.key === prev.deck.key && c.core.key === prev.core.key).toBe(false);
                }
                prev = c;
                chain.push(e.id);
            }
        }
    });

    it("gives every story on one page its own kicker", () => {
        for (const p of PERSONAS) {
            const e = personaEdition(p, "weekly");
            const front = e.stories.slice(0, 5);
            expect(front.length).toBe(5);
            const kickers = front.map((s, i) => storyCopy(s, i, ctx(e)).kicker).filter((k) => k !== null);
            expect(new Set(kickers).size).toBe(kickers.length);
        }
    });

    it("compares with the previous edition where the numbers allow", () => {
        const prev = personaEdition("P1", "weekly", 0);
        const e = personaEdition("P1", "weekly", 1);
        const less = { ...prev, stats: { ...prev.stats, matches: 4 }, longestWin: 3 };
        const c = storyCopy(
            e.stories.find((s) => s.kind === "record")!,
            0,
            ctx(e, [prev.id], less),
        );
        expect(c.tail?.key).toMatch(/^dispatch\.story\.record\.weekly\.versus_up_[1-3]$/);
        expect(c.tail).toMatchObject({ count: 4 });
    });

    it("gives the variant counts the catalog holds", () => {
        expect(STORY_COPY).toMatchObject({ core: 5, angle: 4, deck: 3, kicker: 10, tail: 10, versus: 3 });
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
                return storyCopy(first, 0, ctx(e)).core.key;
            });
            expect(new Set(banners).size, `${kind}: ${banners.join(" | ")}`).toBe(3);
        }
    });
});
