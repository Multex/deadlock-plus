import type { ApiRoute } from "../../fetch";
import { defineScenario, type Module, type Scenario, type ScenarioContext } from "../../scenario";
import { defaultScenario, type ScenarioOptions } from "../default";
import { gradeBook } from "./grades";
import { allRows, olderRows, laterRows, specialsRows } from "./history";
import { enemyStatsRows, heroStatsRows, mateStatsRows, windowOf } from "./player-stats";
import { RANKED_SEASONS, SPECIALS_NOW_MS } from "./seasons";

const accountOf = (url: URL) => Number(url.pathname.split("/")[3]);

/** The rows a scenario serves, and the ones among them it generated (the others are the default history's). */
interface Book {
    all: ReturnType<typeof allRows>;
    generated: ReturnType<typeof allRows>;
}

/** Grades for the generated matches; the default matches keep the default scenario's grades. */
function gradeModule(bookOf: (context: ScenarioContext) => Book): Module {
    return {
        name: "dispatch",
        overrides: ["mvp_grade_match"],
        create(context, replaced) {
            const gradeOf = gradeBook(context.identity, bookOf(context).generated);
            return {
                handlers: {
                    mvp_grade_match: (args) => gradeOf(Number(args.matchId)) ?? replaced.mvp_grade_match!(args),
                },
            };
        },
    };
}

/**
 * The answers laid over the scenario: the merged match-history, the Dispatch's `hero-stats`, `mate-stats` and
 * `enemy-stats` over the whole history, and the ranked seasons. They go in a layer, not a module, because the
 * default modules claim some of these routes.
 */
function dispatchRoutes(scenario: Scenario, rows: Book["all"]): ApiRoute[] {
    const { accountId } = scenario.identity;
    const { identity } = scenario;
    return [
        [/^\/v1\/players\/\d+\/match-history$/, (url) => (accountOf(url) === accountId ? rows : [])],
        [
            /^\/v1\/players\/hero-stats$/,
            (url) => {
                const ids = (url.searchParams.get("account_ids") ?? "").split(",").map(Number);
                return ids.includes(accountId) ? heroStatsRows(rows, accountId, windowOf(url)) : [];
            },
        ],
        [
            /^\/v1\/players\/\d+\/mate-stats$/,
            (url) => (accountOf(url) === accountId ? mateStatsRows(identity, rows, windowOf(url)) : []),
        ],
        [
            /^\/v1\/players\/\d+\/enemy-stats$/,
            (url) => (accountOf(url) === accountId ? enemyStatsRows(identity, rows, windowOf(url)) : []),
        ],
        [/^\/v1\/assets\/ranked-seasons$/, () => RANKED_SEASONS],
    ];
}

/**
 * The default scenario with about 14 months of match history behind its 60 matches, enough for every weekly and
 * monthly edition, and the player-stats answers the Dispatch reads. The default scenario itself is unchanged.
 */
export function dispatchScenario(options: ScenarioOptions): Scenario {
    const base = defaultScenario(options);
    const bookOf = (context: ScenarioContext): Book => ({ all: allRows(context), generated: olderRows(context) });
    const scenario = defineScenario({
        id: "dispatch",
        identity: base.identity,
        now: base.now,
        seed: base.seed,
        modules: [...base.modules, gradeModule(bookOf)],
    });
    return scenario.with({ routes: dispatchRoutes(scenario, bookOf(scenario).all) });
}

/**
 * The `dispatch` scenario seen on the evening of 2026-12-02, once a Collector's Copy for Beta Season 1 and the
 * Year-End Special are due. The match history runs on from the default 60 matches to 2026-12-01, climbing to a
 * peak late in the season and starting over low in season 2. Only the clock moves: the default modules still
 * build their data at the default scenario's own "now", because the default 60 matches are fixed to it.
 */
export function dispatchSpecialsScenario(options: ScenarioOptions): Scenario {
    const base = defaultScenario(options);
    const anchor: ScenarioContext = { identity: base.identity, now: base.now, seed: base.seed };
    const bookOf = (): Book => ({
        all: specialsRows(anchor),
        generated: [...olderRows(anchor), ...laterRows(anchor)],
    });
    const anchored = (module: Module): Module => ({
        ...module,
        create: (context, replaced) => module.create({ ...context, now: base.now }, replaced),
    });
    const scenario = defineScenario({
        id: "dispatch-specials",
        identity: base.identity,
        now: SPECIALS_NOW_MS,
        seed: base.seed,
        modules: [...base.modules.map(anchored), gradeModule(bookOf)],
    });
    return scenario.with({ routes: dispatchRoutes(scenario, bookOf().all) });
}
