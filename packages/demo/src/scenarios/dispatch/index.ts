import type { ApiRoute } from "../../fetch";
import { defineScenario, type Module, type Scenario } from "../../scenario";
import { defaultScenario, type ScenarioOptions } from "../default";
import { gradeBook } from "./grades";
import { allRows, olderRows } from "./history";
import { enemyStatsRows, heroStatsRows, mateStatsRows, windowOf } from "./player-stats";

const accountOf = (url: URL) => Number(url.pathname.split("/")[3]);

/**
 * Answers for the Dispatch: `hero-stats`, `mate-stats` and `enemy-stats` over the whole history, and grades for
 * the generated matches. The merged match-history answer is laid over the scenario by `dispatchScenario`,
 * because the progress module already claims that route.
 */
const dispatchModule: Module = {
    name: "dispatch",
    overrides: ["mvp_grade_match"],
    create(context, replaced) {
        const { identity } = context;
        const older = olderRows(context);
        const rows = allRows(context);
        const gradeOf = gradeBook(identity, older);
        const routes: ApiRoute[] = [
            [
                /^\/v1\/players\/hero-stats$/,
                (url) => {
                    const ids = (url.searchParams.get("account_ids") ?? "").split(",").map(Number);
                    return ids.includes(identity.accountId)
                        ? heroStatsRows(rows, identity.accountId, windowOf(url))
                        : [];
                },
            ],
            [
                /^\/v1\/players\/\d+\/mate-stats$/,
                (url) => (accountOf(url) === identity.accountId ? mateStatsRows(identity, rows, windowOf(url)) : []),
            ],
            [
                /^\/v1\/players\/\d+\/enemy-stats$/,
                (url) => (accountOf(url) === identity.accountId ? enemyStatsRows(identity, rows, windowOf(url)) : []),
            ],
        ];
        return {
            routes,
            handlers: {
                mvp_grade_match: (args) => gradeOf(Number(args.matchId)) ?? replaced.mvp_grade_match!(args),
            },
        };
    },
};

/**
 * The default scenario with about 14 months of match history behind its 60 matches, enough for every weekly and
 * monthly edition, and the player-stats answers the Dispatch reads. The default scenario itself is unchanged.
 */
export function dispatchScenario(options: ScenarioOptions): Scenario {
    const base = defaultScenario(options);
    const scenario = defineScenario({
        id: "dispatch",
        identity: base.identity,
        now: base.now,
        seed: base.seed,
        modules: [...base.modules, dispatchModule],
    });
    const rows = allRows(scenario);
    const history: ApiRoute = [
        /^\/v1\/players\/\d+\/match-history$/,
        (url) => (accountOf(url) === scenario.identity.accountId ? rows : []),
    ];
    return scenario.with({ routes: [history] });
}
