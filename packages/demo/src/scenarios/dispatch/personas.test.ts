import { afterEach, describe, expect, it } from "vitest";
import { buildEdition } from "../../../../stats/src/dispatch/edition";
import { editionSignals, type Signal, type SignalId } from "../../../../stats/src/dispatch/signals";
import { KNOWN_SEASONS } from "../../../../stats/src/dispatch/seasons";
import type { Companion, Edition, EditionWindow, GradedCandidate } from "../../../../stats/src/dispatch/types";
import { collectorsWindow, windowFor } from "../../../../stats/src/dispatch/window";
import { toMatch, type Match } from "../../../../stats/src/stats";
import { scenarioFactory } from "../index";
import { install, type DemoHandle } from "../../scenario";
import { IDENTITY } from "../default/identity";
import { gradeBook } from "./grades";
import { PERSONA_IDS, personaRows, personaScenarioId, type PersonaId } from "./personas";
import { SEASON_1_END_S } from "./seasons";

const OPTIONS = { appVersion: "1.2.3", changelog: "", mapItemsTsv: "# a\n# b\n# c" };
const API = "https://api.deadlock-api.com";
const TZ = "UTC";
const utc = (...parts: [number, number, number]) => Date.UTC(...parts) / 1000;
const YEAR_START_S = utc(2025, 11, 1);
const YEAR_END_S = utc(2026, 11, 1);
const NOV_S = utc(2026, 10, 1);
const RANKED = 4;

const rowsOf = (id: PersonaId) => personaRows(id);

describe("dispatch-specials personas", () => {
    const handles: DemoHandle[] = [];
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
    });

    const api = async (path: string) => (await fetch(API + path)).json();

    /** Builds the edition the way the app does: match-history rows plus the stats calls over the window. */
    async function build(id: PersonaId, window: EditionWindow): Promise<Edition> {
        const handle = install(scenarioFactory(personaScenarioId(id))(OPTIONS));
        handles.push(handle);
        const { accountId } = IDENTITY;
        const rows = (await api(`/v1/players/${accountId}/match-history`)) as unknown[];
        const history = rows.map(toMatch).filter((m): m is Match => m !== null);
        const range = `min_unix_timestamp=${window.startS}&max_unix_timestamp=${window.endS - 1}`;
        const name = (accountOf: number) => IDENTITY.names[accountOf - accountId - 1] ?? null;
        const companion = (accountOf: number, matches: number, wins: number): Companion => ({
            accountId: accountOf,
            name: name(accountOf),
            matches,
            wins,
        });
        const mates = (await api(`/v1/players/${accountId}/mate-stats?same_party=true&${range}`)) as {
            mate_id: number;
            matches_played: number;
            wins: number;
        }[];
        const enemies = (await api(`/v1/players/${accountId}/enemy-stats?${range}`)) as {
            enemy_id: number;
            matches_played: number;
            wins: number;
        }[];
        const grade = gradeBook(IDENTITY, rowsOf(id));
        const inWindow = history.filter((m) => m.startTime >= window.startS && m.startTime < window.endS);
        const grades: GradedCandidate[] = [];
        for (const m of inWindow) {
            const g = grade(m.matchId)?.players.find((p) => p.accountId === accountId);
            if (g) grades.push({ matchId: m.matchId, letter: g.letter, s10: g.s10, place: g.place });
        }
        handle.uninstall();
        handles.pop();
        const season = KNOWN_SEASONS[0]!;
        const edition = buildEdition({
            window,
            accountId,
            history,
            enrichment: {
                mates: mates.map((r) => companion(r.mate_id, r.matches_played, r.wins)),
                enemies: enemies.map((r) => companion(r.enemy_id, r.matches_played, r.wins)),
                heroCombat: null,
                grades,
            },
            season: window.kind === "collectors" ? season : undefined,
            playerName: null,
            number: null,
            issuedAt: null,
        });
        if (!edition) throw new Error(`${id}: no edition for ${window.id}`);
        return edition;
    }

    const windows = () => ({
        year: windowFor("year_end", NOV_S + 10 * 86_400, TZ),
        season: collectorsWindow(KNOWN_SEASONS[0]!, TZ),
        month: windowFor("monthly", NOV_S, TZ),
    });
    const built = new Map<string, Edition>();
    async function edition(id: PersonaId, kind: "year" | "season" | "month") {
        const key = `${id}/${kind}`;
        let e = built.get(key);
        if (!e) {
            e = await build(id, windows()[kind]);
            built.set(key, e);
        }
        return e;
    }
    const signalOf = <K extends SignalId>(signals: Signal[], id: K) =>
        signals.find((s) => s.id === id) as Extract<Signal, { id: K }> | undefined;

    it("names three personas and one scenario id each", () => {
        expect(PERSONA_IDS).toEqual(["lantern", "moth", "kettle"]);
        expect(PERSONA_IDS.map(personaScenarioId)).toEqual([
            "dispatch-specials-lantern",
            "dispatch-specials-moth",
            "dispatch-specials-kettle",
        ]);
        for (const id of PERSONA_IDS) {
            const scenario = scenarioFactory(personaScenarioId(id))(OPTIONS);
            expect(scenario.id).toBe(personaScenarioId(id));
            expect(scenario.now).toBe(scenarioFactory("dispatch-specials")(OPTIONS).now);
        }
    });

    describe.each(PERSONA_IDS)("%s history", (id) => {
        const rows = rowsOf(id);
        it("covers the year before the window and ends before December 2026", () => {
            expect(new Set(rows.map((r) => r.match_id)).size).toBe(rows.length);
            const starts = rows.map((r) => r.start_time);
            expect(starts).toEqual([...starts].sort((a, b) => b - a));
            expect(Math.min(...starts)).toBeLessThan(YEAR_START_S);
            expect(Math.max(...starts)).toBeLessThan(YEAR_END_S);
            expect(Math.max(...starts)).toBeGreaterThan(YEAR_END_S - 3 * 86_400);
        });

        it("plays ranked only until the season ends", () => {
            const ranked = rows.filter((r) => r.match_mode === RANKED);
            expect(ranked.length).toBeGreaterThan(rows.length * 0.5);
            expect(Math.max(...ranked.map((r) => r.start_time))).toBeLessThan(SEASON_1_END_S);
            expect(rows.some((r) => r.match_mode !== RANKED && r.start_time >= SEASON_1_END_S)).toBe(true);
        });
    });

    it("sizes the three personas apart", () => {
        const inYear = (id: PersonaId) =>
            rowsOf(id).filter((r) => r.start_time >= YEAR_START_S && r.start_time < YEAR_END_S).length;
        expect(inYear("lantern")).toBeGreaterThan(120);
        expect(inYear("moth")).toBeGreaterThan(120);
        expect(inYear("kettle")).toBeGreaterThan(180);
    });

    describe("P1 Lantern, the one-trick climber", () => {
        it("year: a run of 11, Lash in most games, a climb", async () => {
            const e = await edition("lantern", "year");
            const s = editionSignals(e);
            expect(signalOf(s, "streak")?.facts.wins).toBe(11);
            const trick = signalOf(s, "one_trick");
            expect(trick?.facts.heroId).toBe(31);
            expect(trick?.facts.share).toBeGreaterThanOrEqual(0.5);
            expect(signalOf(s, "climb")).toBeDefined();
            expect(signalOf(s, "explorer")).toBeUndefined();
            expect(signalOf(s, "duo")).toBeUndefined();
        });

        it("season: a climb of at least 7 subranks and an S- or better game", async () => {
            const s = editionSignals(await edition("lantern", "season"));
            expect(signalOf(s, "climb")?.facts.steps).toBeGreaterThanOrEqual(7);
            expect(signalOf(s, "big_game")).toBeDefined();
            expect(signalOf(s, "one_trick")?.facts.heroId).toBe(31);
        });

        it("month: eight wins in a row on a hero that is half the games", async () => {
            const e = await edition("lantern", "month");
            const s = editionSignals(e);
            expect(signalOf(s, "streak")?.facts.wins).toBe(8);
            expect(signalOf(s, "one_trick")?.facts.share).toBeGreaterThanOrEqual(0.5);
            expect(s.slice(0, 3).map((x) => x.id)).toContain("streak");
            expect(e.stats.matches).toBeGreaterThanOrEqual(12);
        });
    });

    describe("P2 Moth, the explorer in a slump", () => {
        it("year: a wide cast, new heroes, 41% won", async () => {
            const e = await edition("moth", "year");
            const s = editionSignals(e);
            expect(e.heroes.length).toBeGreaterThanOrEqual(18);
            expect(e.newHeroes.length).toBeGreaterThanOrEqual(8);
            expect(e.stats.winrate).toBeGreaterThan(0.38);
            expect(e.stats.winrate).toBeLessThan(0.44);
            expect(signalOf(s, "explorer")).toBeDefined();
            expect(signalOf(s, "night_owl")).toBeDefined();
            expect(signalOf(s, "streak")).toBeUndefined();
            expect(signalOf(s, "nemesis")?.facts.rival.name).toBe("Saltmarsh");
        });

        it("season: a slide of at least 4 subranks", async () => {
            const s = editionSignals(await edition("moth", "season"));
            expect(signalOf(s, "slide")?.facts.steps).toBeLessThanOrEqual(-4);
            expect(signalOf(s, "explorer")).toBeDefined();
        });

        it("month: 12 heroes, 4 of them new, 38% of games after midnight", async () => {
            const e = await edition("moth", "month");
            const s = editionSignals(e);
            expect(e.heroes.length).toBe(12);
            expect(e.newHeroes.length).toBe(4);
            const night = signalOf(s, "night_owl");
            expect(night?.facts.share).toBeGreaterThan(0.33);
            expect(night?.facts.share).toBeLessThan(0.43);
            expect(signalOf(s, "explorer")?.facts.newHeroes).toHaveLength(4);
            expect(signalOf(s, "streak")).toBeUndefined();
        });
    });

    describe("P3 Kettle, the duo comeback", () => {
        it("year: Copperhead beside them in 60% of games, a 7-game sitting, a March-to-April swing", async () => {
            const e = await edition("kettle", "year");
            const s = editionSignals(e);
            const duo = signalOf(s, "duo");
            expect(duo?.facts.mate.name).toBe("Copperhead");
            expect(duo?.facts.share).toBeGreaterThan(0.55);
            expect(duo?.facts.share).toBeLessThan(0.65);
            expect(signalOf(s, "marathon")?.facts.matches).toBe(7);
            const swing = signalOf(s, "swing_month");
            expect(new Date(swing!.facts.month.monthStartS * 1000).getUTCMonth()).toBe(3);
            expect(signalOf(s, "losing_then_winning")?.facts.losses).toBe(6);
            expect(signalOf(s, "one_trick")).toBeUndefined();
        });

        it("season: a bounce back from a low point", async () => {
            const s = editionSignals(await edition("kettle", "season"));
            expect(signalOf(s, "bounce_back")?.facts.steps).toBeGreaterThanOrEqual(3);
            expect(signalOf(s, "duo")?.facts.mate.name).toBe("Copperhead");
        });

        it("month: six losses, then seven of eight won, Saltmarsh the nemesis", async () => {
            const e = await edition("kettle", "month");
            const s = editionSignals(e);
            const turn = signalOf(s, "losing_then_winning");
            expect(turn?.facts.losses).toBe(6);
            expect(turn?.facts.wins).toBe(7);
            expect(turn?.facts.of).toBe(8);
            expect(signalOf(s, "duo")?.facts.mate.name).toBe("Copperhead");
            const nemesis = signalOf(s, "nemesis");
            expect(nemesis?.facts.rival.name).toBe("Saltmarsh");
            expect(nemesis?.facts.losses).toBeGreaterThanOrEqual(3);
        });
    });

    it("keeps the personas apart: no two share a leading signal in any edition", async () => {
        for (const kind of ["year", "season", "month"] as const) {
            const tops = await Promise.all(
                PERSONA_IDS.map(async (id) => editionSignals(await edition(id, kind))[0]!.id),
            );
            expect(new Set(tops).size, `${kind}: ${tops.join(", ")}`).toBe(PERSONA_IDS.length);
        }
    });

    it("keeps the personas apart: their top three never match as a set", async () => {
        for (const kind of ["year", "season", "month"] as const) {
            const sets = await Promise.all(
                PERSONA_IDS.map(async (id) =>
                    editionSignals(await edition(id, kind))
                        .slice(0, 3)
                        .map((x) => x.id)
                        .sort()
                        .join("+"),
                ),
            );
            expect(new Set(sets).size, `${kind}: ${sets.join(" | ")}`).toBe(PERSONA_IDS.length);
        }
    });
});
