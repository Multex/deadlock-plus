import { describe, expect, it } from "vitest";
import { t, tn } from "$lib/core/i18n.svelte";
import { formatClock } from "$lib/features/live/live";
import type { BoxRow, FrontPage, Story, TeamBox } from "@deadlock-plus/match/stories/index";
import { arrangeStories, criticsNote, frontPageView, type StoryView, type ViewDeps } from "./front-page-view";

const HEROES: Record<number, string> = { 1: "Infernus", 2: "Haze", 3: "Seven", 4: "Vindicta" };

const deps: ViewDeps = {
    t,
    tn,
    number: (n) => new Intl.NumberFormat("en").format(n),
    date: (s) => new Date(s * 1000).toISOString().slice(0, 10),
    ordinal: (n) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`),
    clock: (s) => formatClock(s) ?? "",
    hero: (id) => (HEROES[id] ? { name: HEROES[id], art: `art/${id}.png` } : undefined),
};

function row(slot: number, heroId: number, extra: Partial<BoxRow> = {}): BoxRow {
    return {
        slot,
        accountId: 100 + slot,
        heroId,
        viewer: false,
        kills: slot,
        deaths: 2,
        assists: 3,
        netWorth: 30000 - slot * 1000,
        lastHits: 100,
        ...extra,
    };
}

function team(t: TeamBox["team"], won: boolean, rows: BoxRow[]): TeamBox {
    return { team: t, kills: rows.reduce((s, r) => s + r.kills, 0), netWorth: 0, won, rows };
}

const viewerLine: Story = {
    kind: "viewer_line",
    score: 45,
    subject: 3,
    headline: { key: "front_page.story.viewer_line.headline" },
    deck: { key: "front_page.story.viewer_line.deck_graded" },
    params: {
        hero: { type: "hero", slot: 3 },
        player: { type: "player", slot: 3 },
        kills: { type: "number", value: 15 },
        deaths: { type: "number", value: 4 },
        assists: { type: "number", value: 13 },
        net_worth: { type: "number", value: 38341 },
        letter: { type: "grade", letter: "A" },
        place: { type: "place", value: 2 },
        total: { type: "number", value: 12 },
    },
};

const lastHits = (count: number): Story => ({
    kind: "most_last_hits",
    score: 22,
    subject: 1,
    headline: { key: "front_page.story.most_last_hits.headline", count },
    deck: { key: "front_page.story.most_last_hits.deck" },
    params: { hero: { type: "hero", slot: 1 }, player: { type: "player", slot: 1 } },
});

const midBoss: Story = {
    kind: "mid_boss",
    score: 41,
    headline: { key: "front_page.story.mid_boss.headline" },
    deck: { key: "front_page.story.mid_boss.deck" },
    params: { team: { type: "team", team: "archmother" }, time: { type: "time", seconds: 905 } },
};

function page(extra: Partial<FrontPage> = {}): FrontPage {
    return {
        matchId: 990000060,
        dateline: { mode: "ranked", durationS: 1916, startTime: 1792000000, winner: "archmother", result: "win" },
        viewerSlot: 3,
        banner: viewerLine,
        columns: [midBoss, lastHits(152)],
        briefs: [],
        teams: [
            team("archmother", true, [row(3, 3, { viewer: true, name: "Kelvin", grade: { letter: "A", place: 2 } })]),
            team("hidden-king", false, [row(1, 1, { name: "Dovetail", grade: { letter: "A+", place: 1 } })]),
        ],
        ratings: [
            { slot: 1, heroId: 1, letter: "A+", place: 1, s10: 860, viewer: false },
            { slot: 3, heroId: 3, letter: "A", place: 2, s10: 800, viewer: true },
        ],
        gradedCount: 12,
        lanes: [
            { laneId: 1, color: "yellow", slots: { "hidden-king": [1], archmother: [3] }, leadAt10: -1228 },
            { laneId: 4, color: "blue", slots: { "hidden-king": [], archmother: [] }, leadAt10: 0 },
            { laneId: 6, color: "green", slots: { "hidden-king": [1], archmother: [3] } },
        ],
        objectives: [
            { timeS: 300, kind: "guardian", lane: 1, owner: "hidden-king", by: "archmother" },
            { timeS: 905, kind: "mid_boss", by: "archmother", killedBy: "archmother" },
            { timeS: 950, kind: "mid_boss" },
        ],
        ...extra,
    };
}

describe("frontPageView", () => {
    it("keeps the viewer's team first in the score and the box score", () => {
        const view = frontPageView(page(), deps);
        expect(view.score.map((s) => s.team)).toEqual(["archmother", "hidden-king"]);
        expect(view.box.map((b) => b.name)).toEqual(["The Archmother", "The Hidden King"]);
        expect(view.box[0].result).toBe("Win");
        expect(view.box[1].result).toBeUndefined();
    });

    it("highlights the viewer in the box score and the ratings", () => {
        const view = frontPageView(page(), deps);
        expect(view.box[0].rows[0]).toMatchObject({ hero: "Seven", player: "Kelvin", own: true, grade: "A" });
        expect(view.box[1].rows[0].own).toBe(false);
        expect(view.ratings.map((r) => [r.name, r.own, r.placeLabel])).toEqual([
            ["Infernus", false, "1st of 12"],
            ["Seven", true, "2nd of 12"],
        ]);
    });

    it("leaves the ratings and box grades out without grades", () => {
        const view = frontPageView(
            page({
                ratings: [],
                gradedCount: 0,
                teams: [
                    team("archmother", true, [row(3, 3, { viewer: true })]),
                    team("hidden-king", false, [row(1, 1)]),
                ],
            }),
            deps,
        );
        expect(view.ratings).toEqual([]);
        expect(view.box.flatMap((b) => b.rows.map((r) => r.grade ?? null))).toEqual([null, null]);
    });

    it("fills story params: names, ordinals, clock and numbers", () => {
        const view = frontPageView(page(), deps);
        expect(view.banner).toMatchObject({
            headline: "Seven goes 15/4/13",
            deck: "You finished on 38,341 net worth. The critics gave you A, 2nd of 12.",
            kicker: "Your match",
        });
        expect(view.stories[0]).toMatchObject({
            headline: "The Archmother claims the Mid Boss",
            deck: "The Archmother defeated it at 15:05 and claimed it.",
        });
    });

    it("picks the plural form for counted headlines", () => {
        const one = frontPageView(page({ columns: [midBoss, lastHits(1)] }), deps);
        const many = frontPageView(page(), deps);
        expect(one.stories[1].headline).toBe("Infernus reaps 1 last hit");
        expect(many.stories[1].headline).toBe("Infernus reaps 152 last hits");
        expect(many.stories[1].deck).toBe("Dovetail took more last hits than anyone.");
    });

    it("falls back to the hero's name when the player's is unknown", () => {
        const view = frontPageView(
            page({
                teams: [
                    team("archmother", true, [row(3, 3, { viewer: true })]),
                    team("hidden-king", false, [row(1, 1)]),
                ],
            }),
            deps,
        );
        expect(view.stories[1].deck).toBe("Infernus took more last hits than anyone.");
    });

    it("omits the weather without a ping recording", () => {
        expect(frontPageView(page(), deps).masthead.weather).toBeUndefined();
    });

    it("forecasts from a ping recording", () => {
        const view = frontPageView(
            page({ weather: { avg: 39, worst: 63, jitter: 4, samples: 300, partial: false, forecast: "clear" } }),
            deps,
        );
        expect(view.masthead.weather).toEqual({
            forecast: "Clear skies",
            lines: ["39 ms avg · 63 worst", "4 ms jitter"],
        });
    });

    it("sets the dateline from the match", () => {
        const { masthead } = frontPageView(page(), deps);
        expect(masthead).toMatchObject({
            name: "Deadlock+ Dispatch",
            date: "2026-10-14",
            edition: "Extra! · No. 990000060",
            detail: "Ranked · 31:56",
        });
    });

    it("puts the viewer on the photo with a win stamp", () => {
        const { photo } = frontPageView(page(), deps);
        expect(photo).toMatchObject({
            src: "art/3.png",
            alt: "Seven",
            caption: "Seven, 3/2/3. Hero art: Valve.",
            stamp: { text: "Win", tone: "spot" },
        });
    });

    it("reports lane leads at 10:00 and the matchup when there is none", () => {
        const { lanes } = frontPageView(page(), deps);
        expect(lanes.map((l) => [l.name, l.ink, l.text])).toEqual([
            ["York", "yellow", "The Archmother +1,228 at 10:00"],
            ["Broadway", "blue", "Even at 10:00"],
            ["Greenwich", "green", "Infernus vs Seven"],
        ]);
    });

    it("marks objectives for the team that took them and skips unclaimed ones", () => {
        const { objectives } = frontPageView(page(), deps);
        expect(objectives.marks.map((m) => [m.timeS, m.team, m.short, m.label])).toEqual([
            [300, "archmother", "G", "Guardian"],
            [905, "archmother", "MB", "Mid Boss"],
        ]);
        expect(objectives.durationS).toBe(1916);
    });
});

describe("arrangeStories", () => {
    const stories: StoryView[] = ["a", "b", "c", "d", "e", "f"].map((id) => ({
        id,
        headline: `${id} headline`,
        deck: `${id} deck`,
    }));

    it("sets the first stories beside the photo and the next three in brief", () => {
        const { side, briefs } = arrangeStories(stories, 2);
        expect(side.map((s) => s.id)).toEqual(["a", "b"]);
        expect(briefs).toEqual([
            { id: "c", headline: "c headline", body: "c deck" },
            { id: "d", headline: "d headline", body: "d deck" },
            { id: "e", headline: "e headline", body: "e deck" },
        ]);
    });

    it("moves a story that no longer fits beside the photo into the briefs", () => {
        const { side, briefs } = arrangeStories(stories, 1);
        expect(side.map((s) => s.id)).toEqual(["a"]);
        expect(briefs.map((b) => b.id)).toEqual(["b", "c", "d"]);
    });

    it("copes with fewer stories than places", () => {
        expect(arrangeStories(stories.slice(0, 1), 2)).toEqual({ side: [stories[0]], briefs: [] });
    });
});

describe("criticsNote", () => {
    it("says nothing when no grade was asked for", () => {
        expect(criticsNote(false, false, false)).toBeUndefined();
        expect(criticsNote(false, false, true)).toBeUndefined();
    });

    it("says grading while the grade is on its way, then pending once the wait is over", () => {
        expect(criticsNote(true, false, false)).toBe("grading");
        expect(criticsNote(true, false, true)).toBe("pending");
    });

    it("gives way to the grades once they arrive", () => {
        expect(criticsNote(true, true, false)).toBeUndefined();
        expect(criticsNote(true, true, true)).toBeUndefined();
    });
});
