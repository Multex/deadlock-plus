import { describe, expect, it } from "vitest";
import en from "../../../../locales/matches/en.json";
import { detectStories, rankStories, type Story, type StoryInput, type StoryKind } from "./stories";
import { comebackGrading, comebackMatch, rankedMatch, stompGrading, stompMatch, swingMatch } from "./test-fixtures";

/** Slot 12 on The Archmother, 1st in the grades. */
const COMEBACK_VIEWER = 1200002544;
/** Slot 7 on The Archmother, 2nd in the grades and the top damage dealer. */
const STOMP_VIEWER = 798021720;
/** Slot 2 on The Hidden King. */
const RANKED_VIEWER = 1012030591;

const story = (stories: Story[], kind: StoryKind) => stories.find((s) => s.kind === kind);
const kinds = (stories: Story[]) => stories.map((s) => s.kind);

function stories(input: Partial<StoryInput> & Pick<StoryInput, "detail">): Story[] {
    return detectStories({ viewerAccountId: null, grades: null, ...input });
}

describe("viewer's stat line", () => {
    it("tells the viewer's line with hero, K/D/A and net worth", () => {
        const s = story(stories({ detail: stompMatch(), viewerAccountId: STOMP_VIEWER }), "viewer_line");
        expect(s).toMatchObject({
            subject: 7,
            headline: { key: "front_page.story.viewer_line.headline" },
            deck: { key: "front_page.story.viewer_line.deck" },
            params: {
                hero: { type: "hero", slot: 7 },
                player: { type: "player", slot: 7 },
                kills: { type: "number", value: 17 },
                deaths: { type: "number", value: 2 },
                assists: { type: "number", value: 6 },
                net_worth: { type: "number", value: 30765 },
            },
        });
    });

    it("adds the viewer's grade and place when graded", () => {
        const s = story(
            stories({ detail: stompMatch(), viewerAccountId: STOMP_VIEWER, grades: stompGrading() }),
            "viewer_line",
        );
        expect(s?.deck.key).toBe("front_page.story.viewer_line.deck_graded");
        expect(s?.params).toMatchObject({
            letter: { type: "grade", letter: "A-" },
            place: { type: "place", value: 2 },
            total: { type: "number", value: 12 },
        });
    });

    it("is left out when the viewer did not play", () => {
        expect(story(stories({ detail: stompMatch(), viewerAccountId: 42 }), "viewer_line")).toBeUndefined();
        expect(story(stories({ detail: stompMatch() }), "viewer_line")).toBeUndefined();
    });
});

describe("top damage", () => {
    it("names the player with the most player damage", () => {
        const s = story(stories({ detail: stompMatch() }), "top_damage");
        expect(s).toMatchObject({ subject: 7, params: { damage: { type: "number", value: 32208 } } });
    });

    it("is left out when no player has a stats sample", () => {
        const detail = stompMatch((i) => i.players.forEach((p: Record<string, unknown>) => (p.stats = [])));
        expect(story(stories({ detail }), "top_damage")).toBeUndefined();
    });
});

describe("top healing", () => {
    it("names the player who healed the most", () => {
        const s = story(stories({ detail: rankedMatch() }), "top_healing");
        expect(s).toMatchObject({ subject: 2, params: { healing: { type: "number", value: 7938 } } });
    });

    it("is left out when the source records no healing", () => {
        expect(story(stories({ detail: comebackMatch() }), "top_healing")).toBeUndefined();
    });
});

describe("first blood", () => {
    it("is the earliest death with a player killer", () => {
        const s = story(stories({ detail: comebackMatch() }), "first_blood");
        expect(s).toMatchObject({
            subject: 8,
            params: {
                hero: { type: "hero", slot: 8 },
                victim_hero: { type: "hero", slot: 6 },
                time: { type: "time", seconds: 80 },
            },
        });
    });

    it("skips deaths without a player killer", () => {
        const detail = comebackMatch((i) => {
            const victim = i.players.find((p: { player_slot: number }) => p.player_slot === 6);
            victim.death_details.find((d: { game_time_s: number }) => d.game_time_s === 80).killer_player_slot = 0;
        });
        expect(story(stories({ detail }), "first_blood")?.params.time).toEqual({ type: "time", seconds: 83 });
    });

    it("is left out when the first killer is missing from the data", () => {
        expect(story(stories({ detail: rankedMatch() }), "first_blood")).toBeUndefined();
    });
});

describe("comeback", () => {
    it("fires when the winner trailed in net worth", () => {
        const s = story(stories({ detail: comebackMatch() }), "comeback");
        expect(s).toMatchObject({
            params: {
                team: { type: "team", team: "archmother" },
                deficit: { type: "number", value: 42212 },
                time: { type: "time", seconds: 2655 },
            },
        });
    });

    it("fires when the winner recovered from a mid-match deficit", () => {
        const s = story(stories({ detail: swingMatch() }), "comeback");
        expect(s?.params).toMatchObject({ deficit: { value: 6977 }, time: { seconds: 2100 } });
    });

    it("is left out when the winner led throughout", () => {
        expect(story(stories({ detail: stompMatch() }), "comeback")).toBeUndefined();
    });

    it("is left out without a winner", () => {
        const detail = comebackMatch((i) => delete i.winning_team);
        expect(story(stories({ detail }), "comeback")).toBeUndefined();
    });
});

describe("Mid Boss", () => {
    it("tells the first claim", () => {
        const s = story(stories({ detail: comebackMatch() }), "mid_boss");
        expect(s).toMatchObject({
            deck: { key: "front_page.story.mid_boss.deck" },
            params: { team: { type: "team", team: "archmother" }, time: { type: "time", seconds: 1143 } },
        });
    });

    it("names both teams when one defeated it and the other claimed it", () => {
        const detail = comebackMatch((i) => (i.mid_boss[0].team_killed = 0));
        const s = story(stories({ detail }), "mid_boss");
        expect(s?.deck.key).toBe("front_page.story.mid_boss.deck_split");
        expect(s?.params.killer).toEqual({ type: "team", team: "hidden-king" });
    });

    it("is left out when nobody claimed it", () => {
        expect(story(stories({ detail: comebackMatch((i) => (i.mid_boss = [])) }), "mid_boss")).toBeUndefined();
        const unclaimed = comebackMatch((i) =>
            i.mid_boss.forEach((m: Record<string, unknown>) => delete m.team_claimed),
        );
        expect(story(stories({ detail: unclaimed }), "mid_boss")).toBeUndefined();
    });
});

describe("objective falls", () => {
    it("tells the first fall of each objective kind, credited to the other team", () => {
        const s = stories({ detail: comebackMatch() });
        const at = (kind: StoryKind) => story(s, kind)?.params;
        expect(at("guardian_fall")).toMatchObject({
            team: { type: "team", team: "archmother" },
            owner: { type: "team", team: "hidden-king" },
            time: { type: "time", seconds: 337 },
        });
        expect(at("walker_fall")).toMatchObject({ team: { team: "hidden-king" }, time: { seconds: 857 } });
        expect(at("base_guardian_fall")).toMatchObject({ team: { team: "archmother" }, time: { seconds: 1570 } });
        expect(at("shrine_fall")).toMatchObject({ team: { team: "hidden-king" }, time: { seconds: 1728 } });
        expect(at("patron_fall")).toMatchObject({ team: { team: "archmother" }, time: { seconds: 2051 } });
    });

    it("skips objectives the API reports at one second", () => {
        const detail = rankedMatch((i) =>
            i.objectives.forEach((o: Record<string, unknown>) => (o.destroyed_time_s = 1)),
        );
        expect(kinds(stories({ detail })).filter((k) => k.endsWith("_fall"))).toEqual([]);
    });

    it("is left out for kinds that never fell", () => {
        const s = stories({ detail: rankedMatch() });
        expect(story(s, "walker_fall")).toBeDefined();
        expect(story(s, "patron_fall")).toBeUndefined();
        expect(story(s, "shrine_fall")).toBeUndefined();
    });
});

describe("critics' top grade", () => {
    it("names the 1st place with letter and lobby size", () => {
        const s = story(stories({ detail: comebackMatch(), grades: comebackGrading() }), "critics_top");
        expect(s).toMatchObject({
            subject: 12,
            params: { letter: { type: "grade", letter: "S-" }, total: { type: "number", value: 12 } },
        });
    });

    it("breaks a shared 1st place by score, then slot", () => {
        const grades = comebackGrading().map((g) => (g.playerSlot === 11 ? { ...g, place: 1, s10: 999 } : g));
        expect(story(stories({ detail: comebackMatch(), grades }), "critics_top")?.subject).toBe(11);
    });

    it("is left out without grades", () => {
        expect(story(stories({ detail: comebackMatch() }), "critics_top")).toBeUndefined();
        expect(story(stories({ detail: comebackMatch(), grades: [] }), "critics_top")).toBeUndefined();
    });
});

describe("richest player", () => {
    it("names the highest net worth", () => {
        const s = story(stories({ detail: comebackMatch() }), "richest");
        expect(s).toMatchObject({ subject: 3, params: { net_worth: { type: "number", value: 62754 } } });
    });

    it("is left out when no net worth is recorded", () => {
        const detail = comebackMatch((i) => i.players.forEach((p: Record<string, unknown>) => delete p.net_worth));
        expect(story(stories({ detail }), "richest")).toBeUndefined();
    });
});

describe("most last hits", () => {
    it("names the player with the most last hits and counts them", () => {
        const s = story(stories({ detail: stompMatch() }), "most_last_hits");
        expect(s).toMatchObject({
            subject: 1,
            headline: { key: "front_page.story.most_last_hits.headline", count: 125 },
        });
    });

    it("is left out when no last hits are recorded", () => {
        const detail = stompMatch((i) => i.players.forEach((p: Record<string, unknown>) => delete p.last_hits));
        expect(story(stories({ detail }), "most_last_hits")).toBeUndefined();
    });
});

describe("ranking", () => {
    it("orders a comeback match seen by the graded winner", () => {
        const ranked = stories({
            detail: comebackMatch(),
            viewerAccountId: COMEBACK_VIEWER,
            grades: comebackGrading(),
        });
        expect(kinds(ranked)).toEqual([
            "comeback",
            "critics_top",
            "viewer_line",
            "mid_boss",
            "patron_fall",
            "first_blood",
            "top_damage",
            "base_guardian_fall",
            "walker_fall",
            "richest",
            "guardian_fall",
            "shrine_fall",
            "most_last_hits",
        ]);
    });

    it("lifts stories about the viewer", () => {
        const plain = story(stories({ detail: stompMatch() }), "top_damage")!;
        const own = story(stories({ detail: stompMatch(), viewerAccountId: STOMP_VIEWER }), "top_damage")!;
        expect(own.score).toBeGreaterThan(plain.score);
    });

    it("is the same on every run", () => {
        const input = { detail: rankedMatch(), viewerAccountId: RANKED_VIEWER };
        expect(stories(input)).toEqual(stories(input));
    });

    it("breaks equal scores by kind order, then subject slot", () => {
        const make = (kind: StoryKind, subject: number): Story => ({
            kind,
            score: 30,
            subject,
            headline: { key: "" },
            deck: { key: "" },
            params: {},
        });
        const out = rankStories([make("richest", 1), make("top_damage", 9), make("top_damage", 4)]);
        expect(out.map((s) => [s.kind, s.subject])).toEqual([
            ["top_damage", 4],
            ["top_damage", 9],
            ["richest", 1],
        ]);
    });
});

describe("keys", () => {
    const all = [
        ...stories({ detail: comebackMatch(), viewerAccountId: COMEBACK_VIEWER, grades: comebackGrading() }),
        ...stories({ detail: comebackMatch((i) => (i.mid_boss[0].team_killed = 0)), viewerAccountId: COMEBACK_VIEWER }),
        ...stories({ detail: rankedMatch() }),
    ];

    it("covers every kind and deck variant", () => {
        expect(new Set(all.map((s) => s.kind)).size).toBe(14);
        expect(new Set(all.map((s) => s.deck.key)).size).toBe(16);
    });

    it("builds every headline and deck under front_page.story.<kind>", () => {
        for (const s of all) {
            expect(s.headline.key).toMatch(new RegExp(`^front_page\\.story\\.${s.kind}\\.headline$`));
            expect(s.deck.key).toMatch(new RegExp(`^front_page\\.story\\.${s.kind}\\.deck(_\\w+)?$`));
        }
    });

    it("finds each key in en.json with only placeholders the story fills", () => {
        const lookup = (key: string): string | undefined =>
            key.split(".").reduce<any>((node, part) => node?.[part], en);
        for (const s of all) {
            for (const text of [s.headline, s.deck]) {
                const forms = text.count === undefined ? [text.key] : [`${text.key}_one`, `${text.key}_other`];
                for (const form of forms) {
                    const copy = lookup(form);
                    expect(typeof copy, form).toBe("string");
                    const filled = new Set([...Object.keys(s.params), ...(text.count === undefined ? [] : ["count"])]);
                    for (const [, name] of (copy as string).matchAll(/\{(\w+)\}/g)) {
                        expect(filled.has(name), `${form} {${name}}`).toBe(true);
                    }
                }
            }
        }
    });
});
