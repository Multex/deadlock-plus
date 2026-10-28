import { afterEach, describe, expect, it } from "vitest";
import { createDeadlockApi } from "@deadlock-plus/deadlock-api";
import { install, type DemoHandle } from "@deadlock-plus/demo/scenario";
import { scenarioFactory } from "@deadlock-plus/demo/scenarios/index";
import { IDENTITY } from "@deadlock-plus/demo/scenarios/default/identity";
import { gradeBook } from "@deadlock-plus/demo/scenarios/dispatch/grades";
import {
    PERSONA_IDS,
    personaRows,
    personaScenarioId,
    type PersonaId,
} from "@deadlock-plus/demo/scenarios/dispatch/personas";
import { bestGameCandidates, buildEdition, windowRows } from "@deadlock-plus/stats/dispatch/edition";
import { KNOWN_SEASONS } from "@deadlock-plus/stats/dispatch/seasons";
import { editionSignals } from "@deadlock-plus/stats/dispatch/signals";
import { BEST_GAME_CANDIDATES, type Edition, type EditionWindow } from "@deadlock-plus/stats/dispatch/types";
import { collectorsWindow, windowFor } from "@deadlock-plus/stats/dispatch/window";
import { toMatch, type Match } from "@deadlock-plus/stats/stats";
import { enrichEdition } from "../../../enrich";
import { castCards } from "./plan";

const OPTIONS = { appVersion: "1.2.3", changelog: "", mapItemsTsv: "# a\n# b\n# c" };
const TZ = "UTC";
const NOV_S = Date.UTC(2026, 10, 1) / 1000;

const WINDOWS = {
    collectors: () => collectorsWindow(KNOWN_SEASONS[0]!, TZ),
    monthly: () => windowFor("monthly", NOV_S, TZ),
    year_end: () => windowFor("year_end", NOV_S + 10 * 86_400, TZ),
};
type Kind = keyof typeof WINDOWS;

describe("demo personas through the app's edition builder", () => {
    const handles: DemoHandle[] = [];
    afterEach(() => {
        while (handles.length) handles.pop()!.uninstall();
    });

    /** The demo API rows, enriched and built the way the dispatch service does it. */
    async function build(id: PersonaId, window: EditionWindow): Promise<Edition> {
        const handle = install(scenarioFactory(personaScenarioId(id))(OPTIONS));
        handles.push(handle);
        const api = createDeadlockApi({ fetch: (...args) => fetch(...args) });
        const { accountId } = IDENTITY;
        const rows = (await (
            await fetch(`https://api.deadlock-api.com/v1/players/${accountId}/match-history`)
        ).json()) as unknown[];
        const history = rows.map(toMatch).filter((m): m is Match => m !== null);
        const grade = gradeBook(IDENTITY, personaRows(id));
        const candidates = bestGameCandidates(windowRows(history, window), BEST_GAME_CANDIDATES);
        const enrichment = await enrichEdition(window, accountId, candidates, {
            api,
            gradeMatch: async (matchId) => grade(matchId) ?? null,
            names: async (ids) =>
                new Map(
                    ids.flatMap((a) =>
                        IDENTITY.names[a - accountId - 1] ? [[a, IDENTITY.names[a - accountId - 1]!]] : [],
                    ),
                ),
        });
        const edition = buildEdition({
            window,
            accountId,
            history,
            enrichment,
            season: window.kind === "collectors" ? KNOWN_SEASONS[0] : undefined,
            playerName: null,
            number: null,
            issuedAt: null,
        });
        if (!edition) throw new Error(`${id}: no edition for ${window.id}`);
        return edition;
    }

    const signalsOf = async (id: PersonaId, kind: Kind) => editionSignals(await build(id, WINDOWS[kind]()));

    // One scenario at a time: each install swaps the global fetch.
    async function each<T>(run: (id: PersonaId) => Promise<T>): Promise<T[]> {
        const out: T[] = [];
        for (const id of PERSONA_IDS) out.push(await run(id));
        return out;
    }

    it("pulls a different chase card for each persona's Collector's Copy", async () => {
        const chases = await each(async (id) => {
            const e = await build(id, WINDOWS.collectors());
            return castCards(e, editionSignals(e)).chase?.face;
        });
        expect(new Set(chases).size, chases.join(", ")).toBe(PERSONA_IDS.length);
    });

    it.each(["monthly", "year_end"] as const)("gives each persona a different lead in the %s edition", async (kind) => {
        const leads = await each(async (id) => (await signalsOf(id, kind))[0]?.id);
        expect(new Set(leads).size, leads.join(", ")).toBe(PERSONA_IDS.length);
    });
});
